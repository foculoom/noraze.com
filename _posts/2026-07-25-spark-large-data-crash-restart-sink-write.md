---
layout: post
title: "When a Spark Job Writing to Event Hubs Crashes on Large Data — and How to Restart Safely"
date: 2026-07-25 00:00:00 +0000
description: "The slow-crash-restart loop on a Spark-to-Event-Hubs sink is rarely one cause: it's OOM during the write, a token expiring mid-micro-batch, or a renewed cert not being picked up by the long-running job. Here is how to tell them apart and the restart strategy that survives each."
tags: [spark, azure, event-hubs, kafka, structured-streaming, data-engineering, oom, token-refresh, certificate, troubleshooting]
---

# When a Spark Job Writing to Event Hubs Crashes on Large Data — and How to Restart Safely

The pattern is familiar: a Spark job writes a large batch (or a long-running Structured Streaming micro-batch) to Azure Event Hubs over the Kafka endpoint. It runs fine for a while, then slows, then aborts with `STREAM_FAILED` or a stage-failure exception, and you have to restart it manually. The error message is thin. This post unpacks the three causes that converge on this symptom — OOM during the write, a token expiring mid-micro-batch, and the renewed-cert trap — and the restart strategy that's safe across all three. Every durable claim traces to Apache Spark, Apache Kafka, or Microsoft Learn.

## The symptom is shared, the causes are not

The crash looks the same from the outside:

```
org.apache.spark.SparkException: Job aborted due to stage failure: ... STREAM_FAILED
```

with a nested cause that might be an `OutOfMemoryError`, a `SaslException`, or a `FetchFailedException`. The fix is different for each, and the restart strategy has to handle whichever one bit you, because the wrong restart (e.g. restarting from the beginning of a stream without a checkpoint) replays data and can duplicate writes downstream.

## Cause 1 — OOM during the write

The first cause is memory. A Spark write to a Kafka/Event Hubs sink serializes each row to a Kafka producer record and sends it. The producer batches records in memory before sending. Three things push memory up on a large write:

- **Partition count and skew.** A write to a Kafka topic with few partitions, or a skewed key distribution, concentrates the producer load on a small number of executors. The executors with the heavy partitions accumulate in-flight batches; if the batch buffer exceeds the JVM's available memory, the executor OOMs.
- **Producer buffer config.** Kafka producer `buffer.memory` (default 32 MB per producer instance) and `batch.size` accumulate. With many partitions per executor and large records, the per-producer buffer plus the in-flight batch memory can exceed the executor's `spark.executor.memory` envelope.
- **The serialization overhead.** JSON or wide-row serialization is allocation-heavy; the JVM spends more time in GC, and a GC spiral can OOM the executor before the write completes (the GC death spiral covered in the Spark memory-model post).

**The fix on the compute side:** bound the micro-batch size (in Structured Streaming, the trigger interval and `maxOffsetsPerTrigger` for a Kafka source, or partitioning the static write into smaller batches), raise the executor memory envelope (`spark.executor.memory` + `spark.memory.overhead`), repartition upstream to spread the write across more executors, and use Kryo serialization where applicable. These are the same knobs as the general Spark memory tuning — the sink-write context just makes OOM more likely because the producer adds a second in-memory buffer on top of the executor's own memory pressure.

## Cause 2 — a token expiring mid-micro-batch

The second cause is auth, and it's specific to the OAUTHBEARER path (Path 2 and Path 3 in the Event Hubs sink post). The Entra ID access token expires in about 1 hour (the `expires_in: 3599` field). The Kafka client's background login-refresh thread is supposed to renew the token before it expires. Two things go wrong on a long write:

- **The micro-batch outlasts the token.** A single micro-batch that runs longer than the token's lifetime means the producer is holding a connection authenticated with a token that expires mid-write. The next send hits an expired-token auth error, the stream aborts with `STREAM_FAILED`, and the SASL error is wrapped in the stage-failure message.
- **The refresh thread can't renew.** Even if the micro-batch is shorter than the token, the refresh thread has to renew the token *before* it expires. If the refresh fails (the Entra endpoint is unreachable, the callback handler can't acquire a new token — see the dedicated post for the causes), the next connection that needs a fresh token gets the `No OAuth Bearer tokens in Subject's private credentials` exception, and the stream aborts.

**The fix on the auth side:** size the micro-batch so each batch completes well within the token's lifetime (with buffer for the refresh), confirm `sasl.login.refresh.buffer.seconds` is set so the refresh happens before expiry, and — the crucial one — make sure the callback handler can actually acquire a token at refresh time, not just at startup. The token-refresh path is the one that breaks on long-running jobs, and it's where cause 2 collapses into cause 3 below.

## Cause 3 — the renewed-cert trap (the one that forces a manual restart)

This is the cause that produces the "I have to manually restart the job" symptom, and it's worth being precise about because the common description ("the bearer token expired") is wrong, as covered in the dedicated post. The short version:

If your handler uses the **certificate-based client-credentials flow** (the cert is a credential for acquiring tokens, not the token itself), the handler signs each token request with the cert's private key. Key Vault renews the cert on its schedule (a new cert version). Your long-running Spark job loaded the cert into the handler's memory at JVM startup and never re-reads it. The in-memory cert eventually passes its `NotAfter` date. From then on:

1. The Kafka refresh thread tries to re-acquire a token before the access token expires.
2. The handler signs a new `client_assertion` JWT with the old (now-expired) cert's private key.
3. Entra ID rejects the assertion with `invalid_client` (signature-verification failure / cert expired).
4. The handler returns no token; the `Subject` is empty.
5. The Kafka client throws `No OAuth Bearer tokens in Subject's private credentials`.
6. The stream aborts with `STREAM_FAILED` / stage failure.
7. The job sits failed until you manually restart it (the restart loads the new cert from Key Vault, the handler can sign again, the stream resumes).

The crucial distinction: the bearer token is not expired — **it can't be acquired**, because the cert used to *request* it is expired in the job's memory. This is why tuning `sasl.login.refresh.*` doesn't fix it: the refresh thread is running, it's just failing the token request because the signing cert is dead.

**The fix:**
- **Prefer managed identity.** No cert in memory, no expiry to trap you. The Event Hubs and Key Vault docs both call this the recommended default for Azure-resident workloads.
- **If you must use a cert, re-read it on each token refresh.** The handler should fetch the latest cert version from Key Vault on each token-acquisition call, not cache it in a static field. Whether your Azure Identity SDK version does this automatically is `<verify>` against your SDK version — some SDK clients cache the credential for the JVM lifetime, which is exactly the trap.
- **If neither is possible, restart the job after cert renewal.** Schedule a job restart shortly after the cert renewal window so the job picks up the new cert before the old one expires. Operational, not elegant, but it's the documented-pattern fallback. **Precondition:** the renewed cert's public key must be registered on the Entra ID app registration (with an overlap period before the old cert expires) — Entra ID validates the `client_assertion` against registered certs, so a restart only works if the new cert is registered. This is a coordinated Key Vault + Entra app-registration rotation, not just a Key Vault renewal.

## The restart strategy that survives all three

The reason the symptom forces a "manual restart" isn't just the crash — it's that a naive restart risks duplicating data or losing progress. The safe restart strategy uses the same checkpointing discipline the Structured Streaming post covers, applied to the sink-write context:

- **Use a checkpoint location.** Structured Streaming's exactly-once guarantee (micro-batch mode) depends on the checkpoint; on restart it resumes from the checkpoint rather than reprocessing from scratch. Without a checkpoint, a restart re-reads from the source's earliest offset (or whatever the source provides) and you re-write data. Never run a production sink-write stream without a checkpoint location.
- **Make the downstream writes idempotent.** Event Hubs (and Kafka generally) is at-least-once. On a restart after a mid-write crash, the last in-flight batch may be written twice. The consumer/downstream must dedupe or be idempotent on the event key. The Event Hubs Kafka overview explicitly states this: "consumers can receive events more than once, even repeatedly … it's important that the consumer supports the idempotent consumer pattern."
- **Bound the micro-batch.** For cause 1 (OOM) and cause 2 (token expiry), the micro-batch size is the lever. Smaller batches mean each batch fits in memory and completes within the token lifetime; the cost is higher per-batch overhead. Use `maxOffsetsPerTrigger` (Kafka source) or a `Trigger.ProcessingTime` interval sized to your throughput and the 1-hour token.
- **Verify the cert is fresh before restart (cause 3).** If you're on the cert path and the crash was auth-related, decode the cert's `NotAfter` before restarting; if it's expired in Key Vault too (renewal failed), restarting won't help. If it's renewed in Key Vault but the job held the old one, the restart is the fix — it loads the new cert.

## The diagnostic order

When the `STREAM_FAILED` abort hits, the nested cause tells you which of the three it was:

| Nested cause | Likely layer | Fix |
|---|---|---|
| `OutOfMemoryError` / GC exhaustion | Compute (cause 1) | Bound micro-batch, raise memory envelope, repartition |
| `SaslException: No OAuth Bearer tokens in Subject's private credentials` | Auth (cause 2 or 3) | Handler config / cert lifecycle — see dedicated post |
| `SASL authentication failed: expired token` | Auth (cause 2) | Refresh config / micro-batch sizing |
| `FetchFailedException` | Compute (shuffle) | See the shuffle-fetch-failure post |

The error message is your layer identifier. Read the nested cause before reaching for a config key — tuning `retries` won't fix an OOM or an expired cert, and raising `spark.executor.memory` won't fix a token-refresh failure.

## The takeaway

A Spark job writing to Event Hubs crashes on large data for one of three reasons: OOM during the write (compute — bound the micro-batch, raise the envelope), a token expiring mid-micro-batch (auth — size the batch to the token lifetime, fix the refresh path), or a renewed cert not being picked up by the long-running job (the renewed-cert trap — prefer managed identity, or re-read the cert on each refresh, or restart after cert renewal). The restart that survives all three is: checkpoint location + idempotent downstream writes + bounded micro-batch. And when the crash hits, read the nested cause before tuning — the error tells you which layer owns the fix.

## Sources & References

- Apache Spark — Structured Streaming (checkpointing, exactly-once, triggers, `maxOffsetsPerTrigger`): https://spark.apache.org/docs/latest/streaming/index.html
- Apache Spark — Configuration (executor memory, overhead, Kryo): https://spark.apache.org/docs/latest/configuration.html
- Apache Spark — Tuning (GC, skew, partition sizing): https://spark.apache.org/docs/latest/tuning.html
- Apache Kafka — Producer Configs (`buffer.memory`, `batch.size`, `acks`, `sasl.login.refresh.*`): https://kafka.apache.org/documentation/#producerconfigs
- Microsoft Learn — Apache Kafka Protocol Support in Azure Event Hubs (at-least-once, idempotent consumer): https://learn.microsoft.com/azure/event-hubs/azure-event-hubs-apache-kafka-overview
- Microsoft Learn — OAuth 2.0 client credentials flow (cert-based `client_assertion`, `expires_in`): https://learn.microsoft.com/entra/identity-platform/v2-oauth2-client-creds-grant-flow
- Microsoft Learn — Authenticate to Azure Key Vault (managed identity as recommended default): https://learn.microsoft.com/azure/key-vault/general/authentication
- Microsoft Learn — Key Vault certificate lifecycle (auto-renewal, new versions, `NotAfter`): https://learn.microsoft.com/azure/key-vault/certificates/certificate-scenarios
- Note: the in-memory caching behavior of a Key-Vault cert inside a Synapse Spark `AuthenticateCallbackHandler` is `<verify>` against your Azure Identity SDK version — the docs describe the cert lifecycle and the client-credentials flow but not a Synapse-specific "reload cert mid-job" mechanism.