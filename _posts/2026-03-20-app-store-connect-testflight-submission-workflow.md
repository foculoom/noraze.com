---
layout: post
title: "App Store Connect and TestFlight: The Submission Workflow"
date: 2026-03-20 00:00:00 +0000
description: "From an archive in Xcode to a published app on the App Store — the steps, the signing, the metadata, the TestFlight beta, and the review submission."
tags: [app-store, app-store-connect, testflight, submission, ios, app-development, release]
---

# App Store Connect and TestFlight: The Submission Workflow

The path from "the app builds on my machine" to "the app is on the App Store" is a sequence of well-defined steps that all flow through **App Store Connect** (Apple's app-management web/console) and **TestFlight** (the beta-distribution channel). This post walks the workflow: archiving, signing, uploading, the metadata you owe the store, the TestFlight beta phase, and the review submission. Every durable claim traces to Apple's developer documentation.

## Step 1: Archive the build

A submission build is not a debug build — it's a **release archive**. In Xcode, you set the scheme to "Any iOS Device (arm64)" (a real device, not the simulator), then **Product → Archive**. Xcode builds the release configuration and produces an `.xcarchive` (the app bundle plus dSYMs plus the build metadata) in the Organizer.

Things that must be true for the archive to be valid:

- **Release configuration**, not debug — the archive uses your release build settings (optimization, no assertions, the right Info.plist).
- **Correct bundle identifier** matching the App ID registered in the Apple Developer portal.
- **Version and build numbers** set in the target — each upload needs a unique build number (you can't re-upload a build number Apple has already accepted).
- **Distribution-ready assets** — the app icon set is complete; launch screen is configured; no placeholder/test content that would trip review.

The archive is the artifact you'll sign and upload.

## Step 2: Signing

Code signing tells Apple which developer account the app belongs to and that the build hasn't been tampered with since. Two practical modes:

- **Automatic signing** — Xcode manages the provisioning profiles and certificates for you. Right for most indie devs with one team. You check "Automatically manage signing," pick your team, Xcode creates/renews the profiles as needed.
- **Manual signing** — you create the App ID, certificate, provisioning profile explicitly in the Apple Developer portal and reference them. Used when you need to control the signing identity (CI, shared team builds, multiple targets with distinct identities).

For App Store distribution the profile is a "App Store" distribution profile (not a "Development" profile — that's for installing on your own test devices). The build is signed with your distribution certificate. This is what allows the upload to App Store Connect to be accepted.

## Step 3: Upload to App Store Connect

From the Xcode Organizer, "Distribute App → App Store Connect." Xcode validates the archive (checks signing, entitlements, the API usage, and several pre-submission checks) and uploads the build to App Store Connect. Once uploaded, the build appears in App Store Connect under the app's "TestFlight" tab within a few minutes (longer if Apple's processing is backed up).

You can also upload outside the Xcode UI — Apple's **Transporter** app (a standalone macOS app for uploading builds to App Store Connect) and CI-driven flows built on the App Store Connect API are the documented non-Organizer paths. (`xcrun altool`, the older CLI uploader, has been deprecated; do not use it for new automation.) The Xcode Organizer path is the simple dev-loop path; Transporter or an API-based CI flow is the automation path. All of them put the build in the same place (App Store Connect, pending processing).

Processing takes a few minutes; once complete, the build is available for TestFlight and for review submission. If processing fails, the error message usually points at a missing piece (missing icon, a privacy-usage description missing in Info.plist, an entitlement mismatch) — fix and re-upload with a new build number.

## Step 4: App Store metadata

Before you can submit for review, the App Store Connect record needs the metadata Apple requires:

- **App information** — name, subtitle, primary/secondary category, content rating, URL fields (privacy policy URL is mandatory).
- **Screenshots** — at least one set for the required device sizes (Apple lists the required sizes per device family). The screenshots are your primary store-page visual; they carry most of the conversion weight.
- **App preview video** (optional but valuable) — a short video per device family.
- **Description and "What's New"** — text fields. The description is long-form; keywords for search ranking are a separate field (more on this in the ASO post).
- **Privacy nutrition labels** — you declare the data your app collects and how it's used. Apple requires this and enforces it at review; underreporting data collection gets apps rejected.
- **Support URL, marketing URL** — required/optional fields.
- **Pricing and availability** — the base country availability and the price tier. In-App Purchases are configured separately as products (covered in the StoreKit 2 post).
- **App Review information** — demo account credentials if your app requires login, review notes (what to look at, any non-obvious behavior). This is read by the reviewer; clear notes prevent avoidable rejection cycles.

## Step 5: TestFlight beta

With the build uploaded and processed, you can distribute it via TestFlight — Apple's beta-distribution channel. Two tester groups:

- **Internal testers** — members of your App Store Connect team (up to ~100 internal testers, no review needed). Fastest path; useful for your own QA and for teammates.
- **External testers** — up to 10,000 testers via public invite link or email invite. **External TestFlight builds require a beta review** (Apple's quick pre-check of a beta build before it goes to external testers). The first build per version goes through beta review; subsequent builds of the same version are generally lighter.

TestFlight builds expire after 90 days. Each tester gets the TestFlight app, installs your build, and you collect feedback through TestFlight's built-in feedback mechanism (screenshot + comment) and crash reports. The TestFlight phase is where you catch the real-device issues that the simulator and your own testing missed — especially on a fleet of devices you don't personally own.

## Step 6: Submit for review

From the App Store Connect "App Store" tab, you add the build to the version, complete the metadata, and **Submit for Review**. The app enters the review queue. App Review is human review of the app against the App Store Review Guidelines — functionality, content, IAP correctness, privacy, etc.

During review:

- **Review state** — the version's status moves from "Waiting for Review" → "In Review" → "Pending Developer Release" (if you held release) or "Ready for Sale" (if you auto-released).
- **Rejection** — Apple sends a resolution-center message identifying the guideline(s) violated and what to fix. You fix, re-archive, re-upload (new build number), and re-submit. Most rejections are fixable; the most common ones are around IAP restore, privacy-policy presence, and metadata accuracy.
- **Approval → release** — when approved, you either release the version manually (the "Pending Developer Release" state lets you time the launch) or let it auto-release.

## The pre-submission checklist

Before you click Submit for Review, the things that most often cause rejection:

- [ ] **Restore Purchases** works (required for non-consumables and subscriptions).
- [ ] **Privacy policy URL** resolves and matches the app's actual data practices.
- [ ] **Privacy nutrition labels** accurately reflect data collected.
- [ ] **Screenshots** for all required device sizes are present and current.
- [ ] **Login-protected app** has demo credentials supplied in App Review information.
- [ ] **No placeholder/test content** that a reviewer would flag.
- [ ] **Bundle ID, version, build number** correct and unique.
- [ ] **App permissions usage strings** (camera, location, etc.) present in Info.plist.

Each of these is a durable Apple requirement — verifying them before submission saves review cycles.

## The takeaway

Build a release archive, sign it with your distribution certificate, upload to App Store Connect from Xcode Organizer (or Transporter / an App Store Connect API CI flow), complete the metadata (especially privacy policy and nutrition labels), beta-test through TestFlight (internal = no review, external = beta review), then submit for App Review. The build's status moves through well-defined states; rejections come back with specific guideline citations and you fix-and-resubmit with a new build number.

## Sources & References

- Apple Developer — App Store Connect (app management, metadata, version states): https://developer.apple.com/app-store-connect/
- Apple Developer — Distributing your app for beta testing and release (archiving, signing, upload): https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-release
- Apple Developer — TestFlight (beta distribution, internal/external testers): https://developer.apple.com/testflight/
- Apple Developer — App Store Review Guidelines (review criteria): https://developer.apple.com/app-store/review/guidelines/
- Apple Developer — Privacy policy and nutrition labels requirements: https://developer.apple.com/app-store/app-privacy-details/