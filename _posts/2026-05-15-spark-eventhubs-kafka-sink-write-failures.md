---
layout: post
title: "Writing to Azure Event Hubs from Spark: The Kafka Endpoint and Where It Breaks"
date: 2026-05-15 00:00:00 +0000
description: "Azure Event Hubs speaks the Kafka protocol, so a Spark job can write to it like a Kafka topic — until auth, throttling, or a token-refresh failure stops the stream. Here is the endpoint, the three auth paths, and the failure modes."
tags: [azure, event-hubs, kafka, spark, synapse, data-engineering, oauth, sasl]
---

# Writing to Azure Event Hubs from Spark: The Kafka Endpoint and Where It Breaks

Azure Event Hubs exposes an Apache Kafka endpoint, so a Spark job can write to an event hub the same way it writes to any Kafka topic — same producer API, same `kafka` DataFrame format. That is the good news. The bad news is that "same protocol" does not mean "same operational profile": Event Hubs has its own auth paths, its own tier-gated features, and its own throttling model, and the place a Spark-to-Event-Hubs sink breaks is almost never the Kafka protocol layer. This post covers the endpoint, the three ways to authenticate it, and the failure modes each one produces. Every durable claim traces to Microsoft Learn or the official Apache Kafka docs.

## The endpoint: it's a Kafka broker on port 9093

An Event Hubs namespace is a single stable endpoint with a fully-qualified domain name of the form `NAMESPACENAME.servicebus.windows.net`. The Kafka endpoint listens on port `9093` with TLS. Conceptually:

- Apache Kafka **cluster** → Event Hubs **namespace**
- Apache Kafka **topic** → an **event hub** (inside the namespace)
- Apache Kafka **partition** → **partition**
- Apache Kafka **consumer group** → **consumer group**
- Apache Kafka **offset** → **offset**

The Kafka-side config is therefore familiar, with the bootstrap pointing at the namespace:

```properties
bootstrap.servers=NAMESPACENAME.servicebus.windows.net:9093
```

A Spark Structured Streaming write to Event Hubs looks like a write to any Kafka sink — pick the `kafka` format, set the bootstrap servers and topic options, and the engine produces records. The producer options (acks, retries, batch size, linger) are the Kafka producer options. The thing that changes is the auth and the throughput model.

## The three auth paths

Event Hubs documents three ways to authenticate a Kafka client. They have different failure modes, and the rest of this post is organized by which one you picked.

### Path 1 — SASL_SSL + PLAIN with the connection string

The simplest path, documented in the Event Hubs Kafka overview: use `SASL_SSL` for the protocol, `PLAIN` for the mechanism, and the Event Hubs connection string as the password with the literal username `$ConnectionString`.

```properties
security.protocol=SASL_SSL
sasl.mechanism=PLAIN
sasl.jaas.config=org.apache.kafka.common.security.plain.PlainLoginModule required username="$ConnectionString" password="Endpoint=sb://mynamespace.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=XXXXXXXX";
```

This is the "get something working fast" path. Its failure modes:

- **Key rotation.** The Event Hubs docs note that established connections are *not* disconnected when the SAS key is regenerated, but a new connection (a reconnect, a producer restart, a broker-side rebalance) will fail with auth errors if your job still holds the old key. A long-running Spark job that started before the rotation will keep working until it has to establish a new connection — then it breaks.
- **The connection string in the config.** It is a real credential. Storing it in a notebook or a plaintext Spark property is a leak waiting to happen. Use a Linked Service / Key Vault-backed secret, not a pasted string.

### Path 2 — SASL_SSL + OAUTHBEARER with Entra ID (managed identity or service principal)

The OAuth path, documented in the Event Hubs Kafka overview and the Event Hubs Entra-auth page. Use `SASL_SSL` for the protocol, `OAUTHBEARER` for the mechanism, and a custom `AuthenticateCallbackHandler` that acquires an Entra ID access token for the Event Hubs resource.

```properties
bootstrap.servers=NAMESPACENAME.servicebus.windows.net:9093
security.protocol=SASL_SSL
sasl.mechanism=OAUTHBEARER
sasl.jaas.config=org.apache.kafka.common.security.oauthbearer.OAuthBearerLoginModule required;
sasl.login.callback.handler.class=CustomAuthenticateCallbackHandler
```

The token is acquired for the Event Hubs resource. The Event Hubs Entra-auth docs state the resource to request a token for is `https://eventhubs.azure.net/` (the same for all clouds/tenants) for the AMQP/HTTP path, and for Kafka clients the resource is the namespace endpoint `https://<namespace>.servicebus.windows.net`. Confirm the exact scope string your callback handler requests against the Event Hubs docs and your namespace — a wrong audience is a common cause of the `No OAuth Bearer tokens` error covered in its own post.

This path's failure modes are the token-acquisition and token-refresh failures covered in the existing Kafka OAuth post and in the dedicated "No OAuth Bearer tokens" post: the callback handler can't reach Entra ID, the token's audience is wrong, the token expires and the refresh thread can't renew it. For a *producer* (the sink side), the killer is a long micro-batch that outlasts the token's lifetime — see the large-data-crash post.

### Path 3 — Certificate-based client credentials (service principal + cert from Key Vault)

The third path is a variant of Path 2. Instead of the callback handler acquiring a token via a secret or managed identity, it acquires the Entra ID access token using the **OAuth 2.0 client-credentials flow with a certificate** — the app presents a JWT signed by the certificate's private key (`client_assertion`) to the Entra ID `/token` endpoint, and Entra ID returns a bearer access token. This is documented in the Microsoft identity-platform client-credentials reference.

The Entra ID token request for the certificate-based flow:

```http
POST /{tenant}/oauth2/v2.0/token HTTP/1.1
Host: login.microsoftonline.com
Content-Type: application/x-www-form-urlencoded

scope=https%3A%2F%2F<namespace>.servicebus.windows.net%2F.default
&client_id={client-id}
&client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
&client_assertion={jwt-signed-by-cert-private-key}
&grant_type=client_credentials
```

The certificate is typically stored in and renewed from Azure Key Vault. Key Vault manages certificate lifecycle: a cert can be auto-renewed via a partnered CA (DigiCert/GlobalSign) or a CA you bring, with renewal policies (e.g. "renew 90 days before expiry"). Key Vault cert renewal produces a *new version* of the certificate; the old version remains retrievable until manually removed.

This is the path that produces the "renewed cert not refreshed on a long-running job" failure — see the large-data-crash-restart post for the full diagnosis. The short version: the cert is a *credential* for acquiring tokens, not the token itself; the token expires in ~1 hour (per the `expires_in` field), and the cert has a much longer lifetime; if the cert is renewed in Key Vault but the Spark job holds the old cert in memory, the old cert eventually expires and every subsequent token request signed with it is rejected by Entra ID — which surfaces inside the Kafka client as `No OAuth Bearer tokens in Subject's private credentials`.

## Where the protocol layer stops being the problem

People reach for Kafka producer tuning (`acks`, `retries`, `batch.size`, `linger.ms`) when a Spark-to-Event-Hubs write is slow or failing. Those are rarely the cause on Event Hubs, because Event Hubs is not a self-managed broker:

- **Throughput Units (TUs) / Processing Units (PUs).** Event Hubs scales by the TUs or PUs you purchase. If your producer exceeds the ingress quota for your TU allotment, Event Hubs throttles — the producer sees backpressure or errors, not a slow broker. Auto-Inflate (Standard tier) scales TUs up automatically when you hit the limit; without it, you are throttled. This is a capacity/quotas problem, not a producer-tuning problem, and it's owned at the namespace, not in the Spark job config.
- **Tier-gated features.** Compression (`gzip` only), Kafka transactions, and Kafka Streams are supported on Premium/Dedicated tiers (some in preview). If you enable compression on a Standard-tier namespace and your job assumes it's working, you may be silently not getting the throughput benefit. Verify the tier supports the feature before relying on it.
- **The single endpoint.** Per the Event Hubs Kafka overview, Event Hubs uses a single stable virtual IP address as the namespace endpoint, so all partitions route through it — you don't tune broker lists, you don't add brokers. Scaling is a control-plane operation on the namespace, not a client-side change.

## The failure-mode map

When a Spark write to Event Hubs fails, the error usually falls into one of these, and the fix is not in the same place for each:

| Symptom | Layer | Likely cause | Fix location |
|---|---|---|---|
| `SASL authentication failed` at connection | Auth | Wrong connection string (Path 1) or wrong scope/handler (Path 2/3) | Auth config in the Spark job |
| `No OAuth Bearer tokens in Subject's private credentials` | Auth | Callback handler returned no token (wrong scope, cert expired in memory, Entra rejected the assertion) | Callback handler + credential lifecycle |
| Stream stalls / `STREAM_FAILED` mid-micro-batch | Auth + runtime | Token expired during a long write; refresh thread couldn't renew | Refresh config + micro-batch sizing |
| Throttling errors under high throughput | Capacity | Exceeded TU/PU ingress quota | Namespace scaling (Auto-Inflate / more PUs) |
| Connection refused / TLS errors | Network | Wrong port, firewall, private endpoint | Namespace networking config |
| Producer retries not helping | Producer | Tuning retries won't fix a non-retriable auth or capacity error | Stop tuning retries; fix the underlying layer |

The producer tuning knobs are real and they matter for throughput, but they will not fix an auth failure or a throttling failure. The diagnostic discipline is: identify the layer from the error message before reaching for a config key.

## The takeaway

Event Hubs speaks Kafka, so your Spark job writes to it the same way it writes to any Kafka topic. The three auth paths (PLAIN with connection string, OAUTHBEARER with Entra ID, certificate-based client credentials) each have their own failure modes, and the operational issues — throttling, tier-gated features, the single endpoint — are owned at the namespace, not in the producer config. When a write breaks, the error message tells you which layer: `SASL authentication failed` is auth, `No OAuth Bearer tokens` is the callback handler, throttling errors are capacity, and `STREAM_FAILED` during a long write is the token/refresh-vs-micro-batch-size mismatch covered in the dedicated posts.

## Sources & References

- Microsoft Learn — Apache Kafka Protocol Support in Azure Event Hubs (endpoint, tier-gated features, auth configs): https://learn.microsoft.com/azure/event-hubs/azure-event-hubs-apache-kafka-overview
- Microsoft Learn — Authenticate an application with Entra ID to access Event Hubs (resource `https://eventhubs.azure.net/`, Kafka resource `https://<namespace>.servicebus.windows.net`, RBAC roles): https://learn.microsoft.com/azure/event-hubs/authenticate-application
- Microsoft Learn — OAuth 2.0 client credentials flow on the Microsoft identity platform (cert-based `client_assertion` + `client_assertion_type=jwt-bearer`): https://learn.microsoft.com/entra/identity-platform/v2-oauth2-client-creds-grant-flow
- Microsoft Learn — Authenticate to Azure Key Vault (service principal / managed identity / cert credentials): https://learn.microsoft.com/azure/key-vault/general/authentication
- Microsoft Learn — Get started with Key Vault certificates (auto-renewal, new versions): https://learn.microsoft.com/azure/key-vault/certificates/certificate-scenarios
- Microsoft Learn — Azure Event Hubs quotas and throttling (TUs/PUs, Auto-Inflate): https://learn.microsoft.com/azure/event-hubs/event-hubs-quotas
- Apache Kafka — Producer Configs (`acks`, `retries`, `batch.size`, `linger.ms`, SASL keys): https://kafka.apache.org/documentation/#producerconfigs
- Note: the exact Synapse-specific wiring of a Key-Vault cert into a Kafka `sasl.login.callback.handler.class` is `<verify>` — the docs cover the Entra ID client-credentials flow and Key Vault cert lifecycle, but a single documented Synapse-specific path for the integration is not in the official docs; confirm against your Synapse runtime version and SDK.