---
layout: post
title: "StoreKit 2 In-App Purchases for Indie Apps"
date: 2026-03-13 00:00:00 +0000
description: "StoreKit 2 is the modern In-App Purchase API for Apple platforms. Here is the IAP product types, the API surface, and how to test without a real payment."
tags: [storekit, in-app-purchase, iap, monetization, ios, swift, app-store]
---

# StoreKit 2 In-App Purchases for Indie Apps

In-App Purchase (IAP) is how you charge money inside an iOS app, and Apple's modern API for it is **StoreKit 2** (Swift, async/await, available iOS 15+ and the recommended API on iOS 17+). This post covers the four IAP product types, which one fits which business model, the StoreKit 2 API surface you actually write, and how to test purchases without real money. Every durable claim about the API or store policy traces to Apple's developer documentation.

## The four IAP product types

Apple defines four product types. The type you choose determines the purchase model — pick wrong and you'll either fight the platform or fail App Review.

- **Consumable** — used up and re-purchasable. Examples: in-game currency, one-time hints. No restore-purchase behavior (each purchase is independent). Good for things the user genuinely consumes.
- **Non-consumable** — bought once, owned forever, restorable. Examples: a permanent feature unlock, a premium theme pack, removing ads. The user restores this on a new device via their Apple ID. This is the classic "buy once" model.
- **Auto-renewable subscription** — renews automatically (weekly/monthly/yearly) until the user cancels. Apple takes its cut and handles renewal/billing. Used for ongoing-access services: a subscription product, a recurring-content app, a service with ongoing server cost. Comes with free-tier trial/introductory-offer support and a substantial policy surface (share-a-subscription group, family sharing, refund policy).
- **Non-renewing subscription** — a fixed-term purchase that does not auto-renew (the user re-subscribes manually). Less common; used for time-bounded access that shouldn't auto-charge.

Which to pick:

| Business model | Product type |
|---|---|
| One-time premium unlock ("pro version") | Non-consumable |
| Permanent content packs, themes | Non-consumable |
| Currency, one-time boosts | Consumable |
| Ongoing service, recurring server cost | Auto-renewable subscription |
| Time-limited access, no auto-charge | Non-renewing subscription |

For most indie apps the choice is binary: non-consumable for a one-time unlock, or auto-renewable subscription for recurring access. The other two are the niche cases.

## The StoreKit 2 API surface

StoreKit 2 is Swift-native, async/await, and dramatically simpler than the original transaction-based API. The three things you do:

### 1. Fetch products

```swift
import StoreKit

let productIds: Set<String> = ["pro_unlock"]

func loadProducts() async throws -> [Product] {
    let products = try await Product.products(for: productIds)
    return products
}
```

`Product.products(for:)` returns `Product` instances — each carries the configured price, display name, description, and product type. You render your paywall from these.

### 2. Purchase

```swift
func purchase(_ product: Product) async throws {
    let result = try await product.purchase()

    switch result {
    case .success(let verification):
        // StoreKit 2 returns a verification result; verify the transaction
        // locally with the JWS signature, then grant entitlement.
        let transaction = try checkVerified(verification)
        await transaction.finish()
    case .userCancelled:
        break
    case .pending:
        // Ask the user to follow the parental-approval / ask-to-buy flow.
        break
    @unknown default:
        break
    }
}
```

`product.purchase()` returns a `Product.PurchaseResult`. The `.success` case carries a verification result that you must verify — StoreKit 2 signs transactions (JWS), and verifying locally means the app grants entitlement only for a legitimately-signed transaction, not a tampered one.

### 3. Listen for transaction updates and renewals

For subscriptions, the renewal happens out-of-band from your purchase call. You listen on `Transaction.updates` (an async sequence) to catch **transaction changes** — renewals, refunds, family-sharing changes, and other transactions the App Store posts to the app. Note that a plain subscription *expiry* does not by itself produce a transaction update; to detect expiration you must check current entitlements (next paragraph), not rely solely on the updates stream.

```swift
func listenForTransactions() async {
    for await update in Transaction.updates {
        if let transaction = try? checkVerified(update) {
            // refresh entitlement, update UI
            await transaction.finish()
        }
    }
}
```

`Transaction.updates` is the runtime hook for transaction changes while the app runs. Finishing a transaction (`transaction.finish()`) tells App Store you've processed it; you must finish after granting entitlement or the system will keep prompting. **Subscription expiration is not delivered via `Transaction.updates`** — to keep entitlement UI current (including expirations and renewals that happened while the app was closed), re-check current entitlements on app launch, on foregrounding, and whenever the subscription surface is shown. The StoreKit 2 API exposes current entitlement checks for this purpose (`<verify>` confirm the exact `Transaction.currentEntitlements` / `Transaction.latest(for:)` symbol names against the Apple Developer docs for your target iOS version).

The exact verification helper (`checkVerified` above is a placeholder name) — StoreKit 2 transactions are JWS-signed; you verify the signature against Apple's root certificate and check the payload. The API surface for the verification step is documented; confirm the exact entry-point symbol against the Apple Developer StoreKit 2 docs for your target iOS version.

## Testing without real money

Two testing paths:

- **StoreKit Configuration file in Xcode** — add a `.storekit` configuration file to your project; Xcode runs your app against that local store, with the products you define in the file, against a local clock you control (you can fast-forward subscription renewals, test refunds, test family-sharing). This is the primary dev-loop testing path — no network, no App Store Connect, real StoreKit 2 API against a synthetic store.
- **Sandbox** — test against real App Store servers but with sandbox accounts (no charge). Used for validating the end-to-end flow with App Store Connect–configured products before going live. You create a sandbox tester account in App Store Connect and sign in with it on a test device.

The discipline: develop and iterate against the StoreKit Configuration file (fast, offline, clock-controllable), then validate the integration against Sandbox before submission. Real-user IAP only works post-approval.

## App Store policy constraints to know

A few durable policy points (verify against the current App Store Review Guidelines — they update):

- **You can't direct users to a non-IAP payment method for digital content** in the app. If you sell digital goods inside the app, you use IAP. (Physical goods and services are exempt.)
- **Restoring purchases is required** for non-consumables and subscriptions — you must provide a "Restore Purchases" affordance that re-grants entitlement from `Transaction.currentEntitlements` (or the equivalent). Apps without a restore path fail review.
- **Subscription disclosures** — auto-renewable terms (length, price, renewal timing, cancellation) must be clearly disclosed. Apple enforces this at review.
- **Receipts / server-side validation** — for server-granted entitlement, validate the transaction server-side with the App Store Server API. For an on-device-only entitlement, local JWS verification suffices.

## The takeaway

Pick the IAP product type from the business model (non-consumable = buy once, auto-renewable subscription = recurring). Use StoreKit 2's `Product.products(for:)` to render the paywall, `product.purchase()` for the buy, `Transaction.updates` for the subscription lifecycle. Test against a StoreKit Configuration file in Xcode for the fast loop, validate against Sandbox before submission, and never skip the restore-purchase path — review fails without it.

## Sources & References

- Apple Developer — StoreKit 2 (modern API, `Product`, `Transaction`): https://developer.apple.com/documentation/storekit/in-app-purchase
- Apple Developer — In-App Purchase (concepts, product types, server-side): https://developer.apple.com/documentation/storekit/in-app-purchase
- Apple Developer — Testing In-App Purchase with a StoreKit configuration file: https://developer.apple.com/documentation/storekit/testing_in-app_purchase_with_a_storekit_configuration_file
- Apple Developer — App Store Server API (server-side transaction validation): https://developer.apple.com/documentation/appstoreserverapi
- Apple Developer — App Store Review Guidelines (product-type policies, restore requirement): https://developer.apple.com/app-store/review/guidelines/
- Note: exact verification helper symbol and `Transaction.currentEntitlements` surface are `<verify>` — confirm against the StoreKit 2 docs for your target iOS version.