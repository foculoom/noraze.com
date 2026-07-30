---
layout: post
title: "Spark Memory Model and Tuning: Executors, Heap, and GC"
date: 2026-04-17 00:00:00 +0000
description: "Spark's memory is not one bucket. Heap, overhead, off-heap, and PySpark's separate Python process each have their own limits — and GC death spirals happen when you forget that."
tags: [spark, memory, gc, data-engineering, performance, tuning]
---

# Spark Memory Model and Tuning: Executors, Heap, and GC

The shuffle-fetch-failure and executor-exit-143 posts both end up at the same place: memory. This is the fundamentals companion — what Spark's memory actually is, how it's divided, and which knob controls which failure mode. If you only ever memorize one Spark tuning diagram, make it the executor memory layout.

## The four memory regions of an executor

A Spark executor is a JVM. Its memory budget is divided across several regions, and the failure you're diagnosing depends on which one is exhausted. Roughly, from the bottom up:

1. **Executor heap** — controlled by `spark.executor.memory` (e.g. `4g`). This is the JVM heap the unified memory manager lives in.
2. **Memory overhead** — `spark.executor.memoryOverhead` (the modern unified name; the older `spark.yarn.executor.memoryOverhead` was YARN-specific). An off-heap bucket for JVM metaspace, thread stacks, off-heap allocations, and — critically — **the Python process memory in PySpark**. Default is ~10% of `spark.executor.memory` (min 384MB).
3. **Off-heap execution/storage** — `spark.memory.offHeap.enabled=true` + `spark.memory.offHeap.size`. When enabled, Spark can use direct off-heap memory for execution and storage beyond the heap. Reduces GC pressure for memory-heavy workloads.
4. **PySpark Python process memory** — PySpark runs a separate Python process per executor (for Python UDFs and pandas workloads). That process has its own memory, drawn from the overhead bucket. A Python UDF that loads a large pandas DataFrame can OOM the executor not through the JVM heap but through the overhead budget.

The total container size the cluster manager sees (and the limit YARN enforces before killing the container) is roughly `spark.executor.memory + spark.memory.offHeap.size (if enabled) + spark.executor.memoryOverhead`. If the sum exceeds what the node can give the container, you get the YARN kill / exit-137 / exit-143 symptoms covered in the exit-code post. So you don't tune heap in isolation — you tune the whole envelope.

## The unified memory manager (inside the heap)

Inside the JVM heap, Spark uses the **unified memory manager** (default since Spark 1.6). It carves off a reserved region (system-internal, not user-settable) and divides the remaining usable heap (sized by `spark.memory.fraction`, default 0.6) into two pools that share a soft boundary:

- **Execution memory** — for shuffles, joins, aggregations, sorts. The work Spark does during a transformation. This pool can borrow from storage.
- **Storage memory** — for cached/persisted blocks and broadcast variables. This pool can be evicted to give back to execution when execution needs it.

The boundary is soft: storage can borrow from execution when execution isn't using all of it, and execution can reclaim that space by evicting storage blocks. The reverse is not symmetric — execution cannot be evicted. This is why you sometimes see a cached DataFrame get evicted mid-job: the job's execution memory needs spiked and reclaimed the space.

The split is controlled by `spark.memory.storageFraction` (default 0.5) — the fraction of the unified region reserved as a guaranteed floor for storage before execution starts borrowing.

When execution needs more memory than is available and there's nothing to evict, Spark **spills to disk**. The `disk spill` and `memory spill` metrics in the Spark UI tell you exactly when this happened. Persistent spill is the silent killer: the job doesn't crash, it just gets slow because it's reading/writing disk instead of memory.

## The shuffle cost, and reducing it

Most memory-driven slowness comes from shuffles. A few knobs that matter:

- `spark.sql.shuffle.partitions` — default 200. Too high for small data (tiny tasks), too low for skewed large data (one task carries too much). Tune per query; with Adaptive Query Execution enabled, AQE coalesces small partitions post-shuffle automatically.
- `spark.shuffle.service.enabled` — the external shuffle service. When enabled (and the service is actually installed on the cluster), shuffle files survive executor removal, so dynamic allocation can release executors without losing in-flight shuffle output. On a managed runtime like Synapse, verify whether the shuffle service is installed/configured by the cluster before flipping this property — setting the flag alone does not create the service.
- Broadcast joins (`spark.sql.autoBroadcastJoinThreshold`, default 10MB) — when one side of a join is small enough, Spark broadcasts it to all executors, avoiding a shuffle of the large side entirely. Raising the threshold can turn a slow shuffle-join into a broadcast join for small dimension tables.

## Skew: `reduceByKey` vs `groupByKey`

A skew story that comes up constantly: you have a `groupBy` on a dominant key, and one reducer task takes 10x as long as all the others. The fix usually involves how the aggregation is structured.

- `groupByKey(k).mapValues(...)` — shuffles *all* values for each key to one reducer, then applies the per-key function. For a dominant key this lands everything on one task. Memory-heavy, skew-fragile.
- `reduceByKey` / the DataFrame `agg` equivalents — performs **partial aggregation on the map side** before shuffling, so only the *combined* partial result is sent across the network. For a sum/count the partial combination shrinks the shuffle dramatically and limits the reduce-side skew.

The general principle: combine as early as possible. Partial aggregation on the map side reduces both shuffle volume and reduce-side skew. AQE's skew-join handling does the analogous split-the-large-partition trick for joins at runtime.

## GC: when memory tuning becomes GC tuning

When the executor heap is full and the workload is allocation-heavy (lots of intermediate objects — common in non-codegen-friendly Python UDFs, or large columnar expansions), the JVM spends more and more time in GC. Symptoms: long task durations with low CPU (the task is paused in GC), rising GC time in the executor metrics. Left unchecked this becomes the GC death spiral — longer pauses, more promotion, eventually a full GC that either throws OOM or hangs long enough that the cluster manager kills the executor (the exit-143 / SIGTERM pattern).

Two practical levers:

- **G1GC** — `spark.executor.extraJavaOptions=-XX:+UseG1GC`. G1 is generally the better default for Spark than the throughput collector; its region-based layout handles large heaps with many short pauses better than the legacy collectors. G1 is often the default in modern Spark runtimes; confirm via the runtime.
- **Kryo serialization** — `spark.serializer=org.apache.spark.serializer.KryoSerializer`. Kryo is far smaller and faster than Java serialization for RDD caching and shuffle data that must be serialized. Less serialized bytes = less memory pressure = less GC. Register your classes for the best Kryo performance.

GC logging (`-verbose:gc -XX:+PrintGCDetails -XX:+PrintGCTimeStamps`, or the equivalent unified-logging flags on modern JVMs) is the only way to confirm a GC spiral rather than guess at it. The executor's GC time in the Spark UI executor tab is the aggregate signal.

## Putting it together: the diagnostic order

When a job is slow or dying, in order:

1. **Spark UI Stages tab** — which stage is slow, how many tasks, is one task an outlier (skew), what are the shuffle read/write bytes, is there disk spill?
2. **Executor tab** — GC time, memory used, disk spill. High GC + low CPU = GC spiral; high spill = memory pressure; one executor dead = shuffle-fetch source gone.
3. **Driver/executor logs** — the actual error (OOM, FetchFailed, exit code, SIGTERM).
4. **Then** choose the knob: partition count, broadcast threshold, memory overhead, G1GC, Kryo, or — if the whole envelope is too big for the node — smaller executors with more of them.

You don't tune Spark by default; you tune it by what the metrics say is hurting.

## Sources & References

- Apache Spark — Configuration (memory options, shuffle, serializer): https://spark.apache.org/docs/latest/configuration.html
- Apache Spark — Tuning (memory tuning, skew, broadcast joins, GC, Kryo): https://spark.apache.org/docs/latest/tuning.html
- Apache Spark — Monitoring (executor metrics, GC, spill): https://spark.apache.org/docs/latest/monitoring.html
- Apache Spark — Hardware Provisioning (executor sizing, overhead): https://spark.apache.org/docs/latest/hardware-provisioning.html
- Apache Spark — Job Scheduling (dynamic allocation, external shuffle service): https://spark.apache.org/docs/latest/job-scheduling.html