---
layout: post
title: "The 'No OAuth Bearer tokens in Subject's private credentials' Error Explained"
date: 2026-05-20 00:00:00 +0000
description: "That Kafka SASL exception is not about an expired token. It means the OAuthBearerLoginModule finished login but the callback handler left the Subject with no token. Here are the three reasons that happens on Synapse→Event Hubs and how to diagnose each."
tags: [kafka, oauth, sasl, sasl-exception, azure, event-hubs, synapse, spark, data-engineering, troubleshooting]
---

# The 'No OAuth Bearer tokens in Subject's private credentials' Error Explained

The full error, the way it shows up in a Synapse Spark executor log, is usually wrapped in a `STREAM_FAILED` / stage-failure abort:

```
javax.security.sasl.SaslException: No OAuth Bearer tokens in Subject's private credentials
```

It looks like an expired-token error. It is not. The error means something more specific, and the difference decides which fix actually works. This post unpacks what the error means mechanically, the three reasons it happens on a Synapse Spark job writing to (or reading from) Azure Event Hubs over the Kafka endpoint, and how to tell which one is yours. Every durable claim traces to the Apache Kafka SASL docs or Microsoft Learn.

## What the error means mechanically

Kafka's `SASL_SSL` + `OAUTHBEARER` flow runs through the `OAuthBearerLoginModule`. The login module's job is to populate the JAAS `Subject` with an `OAuthBearerToken` in its private-credentials set, which the Kafka client then sends to the broker as the SASL response.

The error `No OAuth Bearer tokens in Subject's private credentials` is thrown by the Kafka login machinery when the login module returned successfully (login didn't throw), but the `Subject`'s private-credentials set is empty — there is no `OAuthBearerToken` in it. In other words: **the login "succeeded" but the callback handler left no token behind.** The Kafka client then has nothing to send the broker, and the auth handshake aborts with this SASL exception.

This is a different failure from the ones the existing Kafka OAuth post covers:
- **Token acquisition fails at startup** (failure mode 1 in that post) — the callback handler threw an exception or returned null. That typically surfaces as a different error (an `OAuthBearerLoginModule` login exception or a wrapped `IOException`).
- **The broker rejects the token** (failure mode 2) — the client *had* a token; the broker refused it (scope, signature, clock skew).
- **Connection/retry storms** (failure mode 3) — auth is *transiently* failing and the retry knobs make it worse.

The `No OAuth Bearer tokens` error is the *fourth* mode: the handler silently produced nothing, the `Subject` is empty, and Kafka throws this specific exception. It's the most common mode on Synapse→Event Hubs, and it's the one that's hardest to diagnose from the error alone because the handler logged nothing.

## Cause 1 — the callback handler isn't wired (or is wired to the wrong class)

The first cause is configuration, not runtime. The Kafka client property `sasl.login.callback.handler.class` must point at a real, on-classpath `AuthenticateCallbackHandler` implementation that knows how to acquire an Entra ID token. If the property is missing, points at the wrong class, or the class isn't on the executor's classpath, the login runs against the default handler — which, for the OAUTHBEARER mechanism, won't produce a token for an Entra-issued resource.

The diagnostic: check the Spark session config that the property is set and the class is loadable on the executor. The class name must be fully qualified and the JAR containing it must be on the executor classpath (on Synapse, that means a pool library or a workspace package, depending on your setup).

**Fix:** verify `sasl.login.callback.handler.class` is set in the producer/consumer properties your Spark job passes to the Kafka sink/source, and verify the handler class is on the executor classpath. A missing handler looks exactly like this error.

## Cause 2 — the handler is wired but can't acquire a token (wrong scope, wrong endpoint, network)

The second cause is the most common one I see in practice. The handler is correctly wired, runs, tries to acquire an Entra ID token, and fails silently. The handler catches the failure internally and returns without populating the `OAuthBearerTokenCallback`, so the `Subject` ends up empty.

The reasons the handler fails to acquire a token:

- **Wrong scope / audience.** The Event Hubs Entra-auth docs state that for Kafka clients the resource to request a token for is `https://<namespace>.servicebus.windows.net` (the AMQP/HTTP resource is `https://eventhubs.azure.net/`). If the handler requests the wrong scope, Entra ID either issues a token the Event Hubs broker rejects (cause-2 manifests as cause-3 in the existing post), or — more commonly on the client side — the token endpoint returns an `invalid_scope` error that the handler swallows. Decode the JWT if one is produced; compare its `aud` claim to the Event Hubs namespace endpoint.
- **Wrong Entra endpoint / tenant.** The handler posts to the wrong `/{tenant}/oauth2/v2.0/token` URL. Entra ID returns a 400 with an `error` / `error_description` field. If the handler doesn't log the response body, you see nothing.
- **Network / firewall.** The Synapse executor can't reach `login.microsoftonline.com` (a private endpoint or egress filter). The handler's HTTP call times out or fails; if it doesn't propagate, the `Subject` is empty.

**Fix:** the handler runs inside the executor JVM, so its logs go to executor stdout/stderr — Synapse Monitor exposes them. Enable logging in your custom callback handler. Log the token endpoint URL, the HTTP status, and the response body on failure. Confirm the `aud` claim in any returned token matches `https://<namespace>.servicebus.windows.net`. This is the diagnostic that turns "it doesn't work" into "the scope string was wrong."

## Cause 3 — the certificate used to sign the client-assertion is expired (the renewed-cert trap)

This is the cause that produces the "renewed cert not refreshed on a long-running job" symptom, and it's worth being precise about the mechanism because the common description ("the bearer token expired") is wrong.

When your handler uses the **certificate-based client-credentials flow** (Path 3 in the Event Hubs sink post), the handler acquires the Entra ID access token by:

1. Loading the certificate (typically from Key Vault) — the cert's private key is used to sign a JWT, the `client_assertion`.
2. POSTing that assertion to `/{tenant}/oauth2/v2.0/token` with `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer` and `grant_type=client_credentials`.
3. Receiving a bearer access token with `expires_in: 3599` (about 1 hour).

Two lifetimes are in play:
- The **access token** lifetime: ~1 hour (the `expires_in` field). The Kafka client's refresh thread re-acquires before this expires.
- The **certificate** lifetime: months or years. The cert is the *credential* used to *acquire* tokens, not the token itself.

The trap: Key Vault renews the certificate (a new cert version is created per the renewal policy). Your long-running Spark job loaded the cert into the handler's memory at JVM startup and never re-reads it. The old cert in memory eventually passes its `NotAfter` date. From that moment, every token request signed with the old cert is rejected by Entra ID with `invalid_client` / a signature-verification failure. The handler's token request returns an error; the handler returns without populating the `OAuthBearerTokenCallback`; the `Subject`'s private credentials stay empty; the Kafka client throws `No OAuth Bearer tokens in Subject's private credentials`.

The crucial correction: **the bearer token is not expired — it can't be acquired**, because the cert used to *request* it is expired in the job's memory. The observable error is the same `No OAuth Bearer tokens` exception, but the root cause is the expired cert, not an expired token. This distinction matters because the fix is different (rotate/reload the cert, not tune the token-refresh window).

**Fix:** the documented fix paths, in order of preference:
- **Use managed identity instead of a cert.** Azure manages the credential lifecycle; there is no cert to expire in memory. The Event Hubs and Key Vault auth docs both call managed identity the recommended default for Azure-resident workloads. This eliminates the failure mode entirely.
- **If you must use a cert, re-read it on each token refresh, not once at JVM startup.** The handler should fetch the latest cert version from Key Vault on each token-acquisition call, not cache the cert in a static field. Whether your Azure Identity SDK version does this automatically depends on the SDK's credential caching — `<verify>` the caching behavior against your SDK version; some SDK clients cache the cert for the process lifetime.
- **If neither is possible, restart the job after cert renewal.** This is the operational workaround: schedule a job restart shortly after the cert renewal window, so the job picks up the new cert before the old one expires. Not elegant, but it's the documented-pattern fallback when the credential can't be reloaded mid-flight. **Important precondition:** the renewed certificate's public key must be registered on the Entra ID app registration *before* the restart — Entra ID validates the `client_assertion` against the certificates registered on the app registration, not against Key Vault directly. The standard practice is to register the new cert's public key on the app registration with an overlap period (both old and new registered) before the old cert expires, so a restart after renewal can use the new cert. Without that registration step, restarting the job does not fix the auth failure.

## The diagnostic order

When the error appears, in order:

1. **Is the handler wired?** Check `sasl.login.callback.handler.class` is set and on the executor classpath. (Cause 1.)
2. **Does the handler log a token-acquisition failure?** Enable handler logging; look at executor stdout/stderr in Synapse Monitor. An `invalid_scope`, a 4xx from the Entra endpoint, or a connection timeout tells you it's an acquisition failure. (Cause 2.)
3. **Is the cert expired in the job's memory?** If the handler uses a cert, decode the cert's `NotAfter` date and compare to the current time on the executor. If the in-memory cert is past expiry and the cert in Key Vault has a newer version, you're in the renewed-cert trap. (Cause 3.)

The order matters because cause 3 only applies if you're on the certificate-based path, and cause 1 only applies if the config is wrong. The error alone doesn't tell you which; the handler logs and the cert's `NotAfter` do.

## The takeaway

`No OAuth Bearer tokens in Subject's private credentials` means the OAuthBearerLoginModule finished login but the Subject has no token — the callback handler left it empty. On Synapse→Event Hubs, three things cause that: the handler isn't wired (config), the handler can't acquire a token (wrong scope/endpoint/network), or the certificate used to sign the client-assertion is expired in the job's memory (the renewed-cert trap). The error is not "expired bearer token"; it's "no token could be produced." Diagnose in order: config, then handler logs, then cert expiry. And the cleanest fix for cause 3 is to not use a long-lived cert at all — managed identity removes the failure mode.

## Sources & References

- Apache Kafka — Authentication using SASL (OAUTHBEARER, `OAuthBearerLoginModule`, `AuthenticateCallbackHandler`, `OAuthBearerTokenCallback`): https://kafka.apache.org/documentation/#security_sasl
- Apache Kafka — Producer Configs (`sasl.login.callback.handler.class`, `sasl.login.refresh.*`): https://kafka.apache.org/documentation/#producerconfigs
- Microsoft Learn — Authenticate an application with Entra ID to access Event Hubs (token resource `https://<namespace>.servicebus.windows.net` for Kafka): https://learn.microsoft.com/azure/event-hubs/authenticate-application
- Microsoft Learn — OAuth 2.0 client credentials flow (cert-based `client_assertion`, `expires_in`): https://learn.microsoft.com/entra/identity-platform/v2-oauth2-client-creds-grant-flow
- Microsoft Learn — Authenticate to Azure Key Vault (managed identity vs cert): https://learn.microsoft.com/azure/key-vault/general/authentication
- Microsoft Learn — Key Vault certificate lifecycle (auto-renewal, new versions): https://learn.microsoft.com/azure/key-vault/certificates/certificate-scenarios
- Note: the in-memory caching behavior of a Key-Vault cert inside a Synapse Spark `AuthenticateCallbackHandler` is `<verify>` against your Azure Identity SDK version — the docs describe the cert lifecycle and the client-credentials flow but not a single Synapse-specific "reload cert mid-job" mechanism.