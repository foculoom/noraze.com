---
layout: post
title: "Apple FoundationModels: On-Device AI for Your App"
date: 2026-03-06 00:00:00 +0000
description: "FoundationModels is Apple's framework for running guided generative models on-device. Here is what it gives you, what it does not, and why the on-device property matters."
tags: [apple, foundationmodels, apple-intelligence, on-device-ai, swift, ios]
---

# Apple FoundationModels: On-Device AI for Your App

Apple ships a framework called **FoundationModels** (part of the Apple Intelligence family) that exposes on-device generative and guided-generation models to your app. The pitch is simple and important: a model running on the user's device means the data never leaves the device. This post covers what the framework gives you, what it deliberately doesn't, and the privacy property that's the whole reason it exists.

A note on confidence: the FoundationModels API surface is recent and continues to evolve across iOS releases. I describe what is documented as the framework's purpose and the patterns it's designed around, and I mark specific symbols I'm not certain are stable with `<verify>`. Confirm exact symbol names against the Apple Developer docs for the iOS version you target before relying on them.

## What FoundationModels is

FoundationModels is the framework layer over Apple Intelligence's on-device generative capability. Where Apple Intelligence powers system features (Writing Tools, image playgrounds, summarization in system surfaces), FoundationModels is the developer-facing hook into the same on-device model stack — you can ask the model to generate structured or guided output from your app's data without that data leaving the device.

The deliberate design properties, as Apple frames them:

- **On-device execution.** The model runs on the user's Apple Silicon device. The prompt and the data in it stay local. This is the privacy story and the reason the framework exists — for a productivity or note-taking app that handles sensitive personal content, not shipping the prompt to a server is a meaningful property, not a marketing line.
- **Guided / structured generation.** The framework is built around constraining the model's output to a schema you define (a Swift type), rather than free-form text. This is the "guided generation" pattern: you describe the shape of the result you want (e.g. a struct with a few fields), and the framework steers generation toward that shape.
- **Availability is conditional.** The framework is available on devices that support Apple Intelligence and on the iOS/macOS versions where the framework ships. Older devices, or devices where the user has disabled Apple Intelligence, won't have it. Your app must degrade gracefully when the model isn't available — checking availability before use is part of the API contract.

## The pattern you write

The shape of using FoundationModels (at the documented level) is:

1. **Check availability** before doing anything — the framework's session/model types have an availability check; you branch to a non-AI fallback when unavailable.
2. **Create a session** for the model.
3. **Provide instructions and a target schema** — a prompt describing the task plus a Swift type describing the desired output shape.
4. **Run the generation** — the framework produces a result conforming to your schema.
5. **Handle the result and the unavailable case**.

I'm deliberately not pasting exact API names here: the entry-point symbols (`<verify>` session type name, `<verify>` the guided-generation method name) and their exact signatures should be confirmed against the Apple Developer FoundationModels documentation for your target OS before you write them into production code. The pattern is real and documented; the symbol surface moves between releases. Treat any snippet that names specific types as something to verify against the current docs, not as stable reference.

## What FoundationModels is not

Being clear about the boundaries prevents the wrong architecture:

- **It is not a server LLM.** You don't get GPT-class or Claude-class capability. On-device models are smaller and more constrained. Tasks that need deep reasoning, broad knowledge, or long context may need a server-side model with the privacy tradeoff that implies. FoundationModels is for in-app tasks where on-device sufficiency and privacy matter more than peak capability.
- **It is not a general "bring your own model" runtime.** You don't load arbitrary weights. The framework runs Apple's on-device models; you work within what those models and the framework's guided-generation surface expose.
- **It is not always available.** Apple Intelligence requires supported hardware and user opt-in. Your app must function without it. Designing for "AI-enhanced when available, plain app when not" is the correct mental model, not "AI app."

## When to reach for it

FoundationModels fits when the task is:

- **Schema-constrained generation** — extracting structured fields from user text (parse a free-form note into a typed object), summarizing into a small fixed format, light transformation.
- **Privacy-sensitive** — the data the model sees is personal or sensitive (notes, journal entries, private documents), so on-device processing is a real product benefit, not a checkbox.
- **Tolerant of on-device capability** — the task doesn't require frontier-model reasoning; "good enough on-device" is acceptable.

It does not fit when you need frontier capability, when you need to load a custom model, or when your app's core value is a server-side model and the on-device one is a downgrade.

## The privacy property in practice

The on-device property has architectural consequences beyond "data stays local":

- **No per-call network cost.** On-device inference has no token billing. This changes feature design — you can call the model freely without a usage budget, which is liberating for a feature that would be uneconomic at server-API prices.
- **No network dependency.** The feature works offline (given the model is available locally). For a note-taking or productivity app this is a real benefit, not a corner case.
- **No server data path.** There's no request body to log, no provider data policy to audit, no retention to negotiate. For an app whose users are privacy-conscious (or for a COPPA-relevant kids product, where sending data off-device is a regulatory landmine), this is often the deciding factor.

The tradeoff is that you can't log or improve from the prompts — there's no server-side observability of model inputs. For a product team that's used to improving a model from logged traces, on-device AI is a different operating mode.

## The takeaway

FoundationModels gives you Apple Intelligence's on-device generative capability as a developer framework, with guided generation toward a Swift schema and a strong privacy property (data never leaves the device). It's the right tool for schema-constrained, privacy-sensitive, on-device-tolerant tasks; it's the wrong tool for frontier-capability or custom-model needs. Always design for the unavailable case — the framework's availability is conditional, and a graceful non-AI fallback is part of the contract, not an afterthought.

## Sources & References

- Apple Developer — Foundation Models framework: https://developer.apple.com/documentation/foundationmodels
- Apple Developer — Apple Intelligence (system context, availability): https://developer.apple.com/apple-intelligence/
- Apple Developer — Machine learning on Apple platforms (broader on-device ML context): https://developer.apple.com/machine-learning/
- Note: specific API symbol names (session types, guided-generation methods) are `<verify>` — confirm against the Apple Developer FoundationModels page for your target iOS version. The framework's API surface is recent and evolves between releases.