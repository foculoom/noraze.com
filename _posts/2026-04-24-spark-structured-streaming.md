---
layout: post
title: "Spark Structured Streaming: The Processing-Model Primer"
date: 2026-04-24 00:00:00 +0000
description: "Structured Streaming treats a stream as an unbounded table and runs it on the Spark SQL engine. Here is the model — triggers, event time, watermarks, output modes — before you touch a config key."
tags: [spark, structured-streaming, streaming, kafka, data-engineering]
---

# Spark Structured Streaming: The Processing-Model Primer

Structured Streaming is Spark's stream-processing API. The design choice that makes it tractable is that it treats a stream as an **unbounded table** and runs the same DataFrame/Dataset operations you'd run on a bounded batch job. The Spark SQL engine runs the query incrementally as new data arrives. This post is the model — what's actually happening when a Structured Streaming query runs — before any config tuning.

## The unbounded-table model

You express a streaming computation the same way as a batch one: a DataFrame is read from a streaming source, transformed with the usual operations (select, filter, join, groupBy), and written to a streaming sink. The engine takes responsibility for running it incrementally — processing new data as it arrives and updating the result.

The key conceptual leap: a streaming DataFrame is an unbounded table — it keeps growing as new rows arrive. Operations you write against it are then a continuous query over that growing table, and Spark tracks what's new since the last trigger and updates downstream state/output accordingly.

## Triggers: when the engine runs

A **trigger** controls when the engine processes new data. Two trigger modes (per the official guide):

- **Micro-batch processing (default)** — the engine processes new data as a series of small batch jobs, achieving end-to-end latencies as low as ~100 milliseconds with exactly-once fault-tolerance guarantees. This is the default and the most common mode. You can configure the micro-batch interval (e.g. `Trigger.ProcessingTime("10 seconds")`).
- **Continuous processing** — a lower-latency mode (since Spark 2.3) that can achieve end-to-end latencies as low as ~1 millisecond, but with **at-least-once** guarantees rather than exactly-once. This is the tradeoff: lower latency, weaker delivery semantics. Useful for a narrow class of very-low-latency workloads.

The choice matters because it changes what your downstream must tolerate. If your sink cannot tolerate duplicate writes, the exactly-once micro-batch model is the safer default; you design around micro-batch latency instead.

## Event time and watermarks

**Event time** is the time embedded in the data (a timestamp column in the record), as opposed to the time the record arrived at Spark (processing time). Event-time processing is what lets a windowed aggregation be correct even when data arrives late or out of order.

A **watermark** is the mechanism Structured Streaming uses to decide how long to keep state for a window before it's safe to drop late data. You define a watermark as "the maximum delay the engine tolerates" — e.g. `withWatermark("eventTime", "10 minutes")` means the engine considers an event late if it arrives more than 10 minutes after the latest event time it has seen; after the watermark advances past a window's close, that window's state can be dropped and late events for it are discarded.

Without a watermark, state for windowed aggregations grows unbounded — the engine must keep every window open in case late data arrives. The watermark is the practical knob that bounds state. Set it too small and you drop legitimately-late data; too large and state grows until you OOM. The right value is "the largest real-world delay you expect in this pipeline."

## Output modes

When the result of a streaming aggregation updates, the **output mode** controls what the sink sees:

- **Append** — only new rows that are final (for aggregations, this means rows for windows that have closed past the watermark; the engine can't emit a row for a still-open window as "final" because more data may arrive). Used when you want only completed results.
- **Update** — only rows that changed since the last trigger. Good for sinks that support in-place updates (e.g. a key-value store where you overwrite the latest aggregate).
- **Complete** — the entire result table is written every trigger. Only practical for small result sets (e.g. a small set of aggregates), because it rewrites everything each time.

The mode you pick depends on the sink and the query. Aggregations with event-time windows and a watermark commonly use Update or Append depending on whether the downstream wants incremental deltas or finalized rows.

## Fault tolerance: checkpointing and exactly-once

Structured Streaming provides **end-to-end exactly-once** guarantees (in micro-batch mode) through **checkpointing** and write-ahead logs. The engine records its progress (offsets consumed, aggregation state) to a checkpoint location; on a restart it resumes from the checkpoint rather than reprocessing from scratch. For the exactly-once guarantee to hold, the sink must support idempotent writes or be replayable — the engine guarantees it won't reprocess on restart, but if the engine crashes mid-write the sink must tolerate the reattempt.

This is why the checkpoint location is not optional in production: without it, the query has no durable progress and restart re-reads from the earliest offset (or whatever the source provides), losing the exactly-once guarantee.

## A Kafka source/sink

Kafka is a first-class source and sink. A streaming read from Kafka is a DataFrame of Kafka records (key, value, topic, partition, offset, timestamp); you then parse the value (e.g. JSON → struct). A streaming write to Kafka produces records to a topic, using the key/value columns of the output DataFrame.

A minimal sketch (PySpark):

```python
from pyspark.sql import SparkSession
from pyspark.sql.functions import from_json, col
from pyspark.sql.types import StructType, StringType

spark = SparkSession.builder.appName("stream-demo").getOrCreate()

schema = StructType().add("event_id", StringType()).add("amount", StringType())

stream = (
    spark.readStream
         .format("kafka")
         .option("kafka.bootstrap.servers", "broker:9093")
         .option("subscribe", "events")
         .load()
         .select(from_json(col("value").cast("string"), schema).alias("e"))
         .selectExpr("e.event_id AS event_id", "CAST(e.amount AS double) AS amount")
)

query = (
    stream.writeStream
          .format("console")              # or "kafka" with topic option for a sink
          .option("checkpointLocation", "/path/to/checkpoint")
          .outputMode("append")
          .start()
)
query.awaitTermination()
```

The checkpoint location is the durable-progress anchor. The source options (`kafka.bootstrap.servers`, `subscribe`) are Kafka-side; the security options (`sasl.mechanism`, `security.protocol`, JAAS) attach the same way as in the batch Kafka connector — that's the OAuth/SASL surface covered in the Kafka auth posts.

## When to use Structured Streaming

Structured Streaming is the right tool when you already run Spark and have a continuous, low-ish-latency need that fits the DataFrame model — aggregations, joins to static data, ETL into a lake. For very-low-latency (sub-ms) or pure event-routing workloads, a dedicated streaming system is often a better fit than asking Spark to be a message router. Structured Streaming's strength is that you reuse the batch mental model and the SQL engine; its cost is that the micro-batch latency floor and the stateful-checkpoint machinery add overhead a leaner stream processor doesn't carry.

## The takeaway

Structured Streaming = an unbounded table + a continuous SQL query + a trigger that decides when to run + a watermark that bounds state for late data + a checkpoint that gives exactly-once. Pick the trigger for your latency, the watermark for your late-data tolerance, the output mode for your sink's update semantics, and never run without a checkpoint location in production.

## Sources & References

- Apache Spark — Structured Streaming Programming Guide (model, triggers, event time, watermarks, output modes, fault tolerance): https://spark.apache.org/docs/latest/streaming/index.html
- Apache Spark — Structured Streaming: Getting Started (Kafka source/sink examples): https://spark.apache.org/docs/latest/streaming/getting-started.html
- Apache Spark — Structured Streaming: Performance Tips (continuous processing): https://spark.apache.org/docs/latest/streaming/performance-tips.html
- Apache Kafka — Documentation (Kafka connector integration, security options): https://kafka.apache.org/documentation