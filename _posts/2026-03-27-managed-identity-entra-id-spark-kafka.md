---
layout: post
title: "Managed Identity, Entra ID, and Spark-to-Kafka Authentication"
date: 2026-03-27 00:00:00 +0000
description: "How Synapse Spark jobs acquire tokens with managed identity and Entra ID, and the honest boundary where wiring that identity into Kafka OAuth is not officially documented."
tags: [azure, synapse, kafka, oauth, managed-identity, entra-id, security, data-engineering]
---

# Managed Identity, Entra ID, and Spark-to-Kafka Authentication

When a Spark job in Azure Synapse needs to talk to a Kafka broker secured with OAuth, you are crossing two identity systems: the Azure one (which issues the token) and the Kafka one (which validates it). This post covers the Azure side — managed identity, Entra ID, and how a Synapse Spark job acquires a token — and then the Kafka side, the SASL/OAUTHBEARER pattern that is officially documented. It ends at the boundary where the two must meet, because that boundary is not fully documented and pretending otherwise is the worst mistake you can make here.

## Entra ID and the two credential types

Microsoft Entra ID (formerly Azure AD) is the identity provider. Applications and services authenticate to it to get OAuth 2.0 access tokens. Two ways a Synapse Spark job can present itself to Entra ID:

- **Managed identity** — a system-assigned identity tied to an Azure resource (the Synapse workspace). The identity lifecycle is bound to the resource: it is created when the resource is and deleted when the resource is. No secret to rotate. This is the recommended default for Azure-resident workloads.
- **Service principal** — an app registration with a client ID and a secret (or certificate). Requires you to manage the secret/cert lifecycle. Used when managed identity isn't available (e.g. a client running outside Azure) or when an explicit, separate identity is required.

For Synapse Spark, the managed identity of the workspace is the natural choice — the Spark pool runs inside that workspace and can request tokens on the workspace's behalf without a stored secret.

## TokenLibrary: how a Synapse Spark job gets a token

Synapse provides a helper, `TokenLibrary`, exposed to notebooks (PySpark/Scala) so that Spark code can fetch Entra ID access tokens for downstream resources **without hard-coding secrets**. The general pattern (Python):

```python
from mssparkutils import credentials as mssparkutils_creds
# or, via the documented TokenLibrary entry point in notebooks:
# token = mssparkutils.credentials.getToken("<resource-endpoint>")
```

`getToken` takes the resource URI / scope that the token is meant for (the audience). Entra ID issues a token scoped to that resource; the downstream service (a SQL database, a REST API, a storage account) validates it. The key property is that **the workspace's managed identity is used implicitly** — Synapse resolves the credential, your code receives a token, and no secret appears in the notebook.

For Linked Services defined in the workspace, Synapse can resolve the connection's credential using the same mechanism, so a notebook referencing a Linked Service does not see the underlying secret either. This is why Linked Services matter for the security posture of the pipeline: they keep credentials out of source code.

The exact surface of `mssparkutils.credentials` and `TokenLibrary` evolves across Synapse runtime versions — confirm the entry point and supported token-resource values against the Microsoft Learn page for the runtime version your pool uses.

## The Kafka side: SASL/OAUTHBEARER (what IS documented)

Apache Kafka documents SASL with the `OAUTHBEARER` mechanism. The client proves identity by presenting an OAuth bearer token to the broker as part of the SASL handshake. The relevant client properties (per the official Kafka docs):

- `security.protocol` — `SASL_SSL` (SASL over TLS — the only sane choice for OAuth, which sends a bearer token).
- `sasl.mechanism` — `OAUTHBEARER`.
- `sasl.jaas.config` — a JAAS login module configuration. The built-in `OAuthBearerLoginModule` is documented for the standards-based token-acquisition path.
- `sasl.login.callback.handler.class` — the callback handler that acquires the token. Kafka documents a built-in handler for the secured (OIDC) flow and allows custom handlers for unsupported token sources.

Kafka also documents token-refresh properties (`sasl.login.refresh.*`) that control how a client refreshes an expiring token before it expires. Getting refresh right is the whole game for long-running jobs: a token that expires mid-stream with no refresh path causes the retry-storm failure mode covered in the Kafka OAuth troubleshooting post.

## The honest boundary (read this twice)

This is where the two documented systems have to meet, and where I have to be precise:

- **What is documented:** Entra ID / managed identity issuing tokens, Synapse `TokenLibrary` fetching tokens for Azure resources, Kafka's SASL/OAUTHBEARER mechanism, and Kafka's built-in OAuth login module / callback handler for standards-based (OIDC) token acquisition.
- **What is NOT officially documented (as of the documentation I can cite):** a Synapse-specific, supported path that wires Synapse's managed identity token directly into Kafka's `sasl.login.callback.handler.class` so the Spark-to-Kafka client uses that token automatically.

That gap is the crux. In practice, pipelines bridge it one of three ways, and you must verify each against your broker's configuration and the Synapse runtime version you're on:

1. **Custom `AuthenticateCallbackHandler`** that calls `TokenLibrary` / the workspace identity to obtain an Entra ID token and presents it to Kafka. This is supported as a Kafka extension point (the custom handler class is documented). What is *not* documented is whether your specific broker accepts Entra-issued tokens for your specific audience/claims — that depends on the broker's OAuth validator config.
2. **Standards-based (OIDC) OAuth** where Kafka's built-in handler acquires a token from an Entra ID token endpoint using a client-credentials flow (`sasl.oauthbearer.token.endpoint.url` + client id/secret in JAAS). This is the path Kafka's own docs describe. It uses a service principal (or an OIDC client), not managed identity, because the built-in handler performs a direct client-credentials call to the token endpoint.
3. **A separate token-refresh sidecar / pre-fetched token** stored via Linked Service and injected. Fragile, because Kafka's refresh model expects the handler to refresh itself.

**Do not assume any of these three "just works" against your broker.** The audience claim (`aud`) the broker expects must match what Entra ID puts in the token; the broker's JWKS endpoint must point at Entra's signing keys; and the principal claim the broker maps to a Kafka ACL must match what Entra ID emits. Each of these is a broker-side config your Kafka admin owns, not a Synapse-side one. If the docs for your specific Kafka distribution don't describe the Entra ID integration, treat the path as unverified and validate end-to-end before relying on it in production.

This is the honest version. The worst thing a post on this topic can do is hand you a config block that implies a single, supported, one-size path — because that path does not exist in any single official document. The two halves are documented; the join between them, for Synapse-managed-identity-to-Kafka, is an integration boundary you have to verify.

## The takeaway

Managed identity + Entra ID + `TokenLibrary` is the supported way for a Synapse Spark job to get tokens without storing secrets. Kafka SASL/OAUTHBEARER is the supported way for a Kafka client to present a token. The connection between them — wiring a Synapse-issued managed-identity token into the Kafka client's OAuth handler — is not a single officially-documented path. Pick the bridge that matches your broker, verify the audience/claims/JWKS alignment against your broker's config, and never paste a config block that assumes the join works without checking.

## Sources & References

- Microsoft Learn — Managed identities for Azure resources: https://learn.microsoft.com/entra/identity/managed-identities-azure-resources/overview
- Microsoft Learn — Synapse workspace managed identity: https://learn.microsoft.com/azure/synapse-analytics/security/synapse-workspace-managed-identity
- Microsoft Learn — TokenLibrary / mssparkutils credentials (token acquisition in notebooks): https://learn.microsoft.com/azure/synapse-analytics/spark/apache-spark-secure-credentials-with-token-library
- Microsoft Learn — Linked services in Synapse: https://learn.microsoft.com/azure/synapse-analytics/data-integration/data-integration-concepts
- Apache Kafka — Security > SASL and OAuthbearer (mechanism, JAAS, callback handlers, refresh): https://kafka.apache.org/documentation/#security_sasl
- Apache Kafka — Producer/Consumer configs (security.protocol, sasl.*): https://kafka.apache.org/documentation/#consumerconfigs
- Note: the Synapse-managed-identity-to-Kafka-OAuth handler integration is NOT covered by a single official doc — the post documents the boundary rather than inventing a path.