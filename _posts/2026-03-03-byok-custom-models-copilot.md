---
layout: post
title: "Bring Your Own Key (BYOK): Using Claude, ChatGPT, or Your Own Model with Copilot"
date: 2026-03-03 00:00:00 +0000
description: "GitHub Copilot now supports connecting your own API keys so you can use Claude, OpenAI, or other models. Here's what you can control."
tags: [ai, developer-tools, vscode, github-copilot, configuration, enterprise]
---

> **Accuracy note (2026-07-29 audit):** This post was reviewed against current official documentation in July 2026 and contains inaccuracies relative to the current state of the tools described. The post is retained for its workflow reasoning; the specific factual issues are:
>
> The 'Settings → Copilot → Model Provider' configuration form described below is not the current VS Code BYOK flow; current VS Code configures provider models through the chat model picker's 'Manage Models'. The on-premises-Claude-proxy privacy guarantee and the hard-coded per-1M-token price range below are not supported by current provider/Copilot documentation. Confirm the current Manage Models flow and current provider pricing against official VS Code and provider documentation.
>
> Reference docs to verify against:
- VS Code language models / BYOK — https://code.visualstudio.com/updates/v1_123


For years, GitHub Copilot meant OpenAI's models (GPT-4, GPT-5). You could not swap in Claude, Gemini, or your own fine-tuned model.

In May 2026, GitHub released BYOK (Bring Your Own Key), letting teams connect their own model providers. You can now configure Copilot to use Claude from Anthropic, OpenAI's models, Google's Gemini, or even a private model endpoint.

This is less flashy than it sounds, but it unlocks something important: using Copilot with the model your team actually trusts or has licensed.

## Why this matters

Every model has trade-offs:
- Some are better at reasoning (Claude)
- Some are faster (GPT-4-Turbo)
- Some are cheaper (smaller models)
- Some are privately hosted (no logs sent to third parties)

Before BYOK, you were locked into Copilot's default model choice. If your security policy required on-premise deployments, or your team had licenses with a specific vendor, you were out of luck.

BYOK removes that lock.

## How BYOK works

When you enable BYOK in VS Code:

1. You configure a model provider (Anthropic, OpenAI, Google, or custom endpoint)
2. You supply your API key (stored securely in VS Code's credential manager)
3. When you open Copilot chat or run an agent, it uses your model instead of the default

The Copilot interface does not change. The prompts Copilot sends stay the same. The output flows into the same chat window. What changes is which LLM processes the request.

## Setting it up in VS Code

In VS Code 1.120+, Settings → Copilot → Model Provider:

```
Model Provider: [Dropdown]
├── GitHub (default)
├── Anthropic
├── OpenAI
├── Google Gemini
└── Custom Endpoint
```

If you choose Anthropic:
```
Anthropic API Key: [enter your key]
Model: [claude-opus-4, claude-sonnet-4, etc.]
```

If you choose Custom Endpoint:
```
API Endpoint: https://your-internal-api.example.com
API Key: [your-key]
Model ID: [model-name]
```

VS Code validates the connection before saving. If your key is invalid or the endpoint is unreachable, it tells you immediately.

## Team and Enterprise scenarios

For teams and enterprises, BYOK unlocks:

**Scenario 1: Strict data privacy**
Your company policy: no code leaves the building. With BYOK, you can point Copilot at an on-premise Claude API proxy or a private model endpoint. Code and chat history stay behind your firewall.

**Scenario 2: Model licensing**
Your team has a preferred vendor relationship. Maybe you negotiated a bulk license with Anthropic, or you have a committed spend with OpenAI. BYOK lets you use that investment across your entire team, not just in your own applications.

**Scenario 3: Fine-tuned models**
You have a private model fine-tuned on your company's codebase and conventions. With a custom endpoint, you can make that available to every developer in VS Code.

## What you control with BYOK

You can control:
- **Which model runs** (Claude 3.5 Sonnet vs. GPT-4 vs. your own)
- **Where requests go** (Anthropic's servers, OpenAI's, your private endpoint)
- **Cost** (you pay directly to the provider, not to GitHub)
- **Logging and data retention** (you control your provider's policies)

What you cannot change:
- **Copilot's prompts** (GitHub still decides how to brief the model)
- **Session persistence** (Chronicle and session sync still use GitHub's backend)
- **Extensions and integrations** (third-party Copilot extensions still work the same way)

## Practical example: using Claude as your coding model

You prefer Claude because it is better at multi-file reasoning. Here is how to make it your default:

1. Get an Anthropic API key from console.anthropic.com
2. In VS Code: Settings → Copilot → Model Provider → Anthropic
3. Paste your API key
4. Select Model: `claude-opus-4`

Now when you open Copilot:
- Chat requests go to Claude
- Agent sessions run with Claude
- You get Claude's reasoning and output

Cost: you pay Anthropic directly (usually $0.015–$0.08 per 1M input tokens, depending on model).

## Gotchas and limitations

**API compatibility.** Not all models support the same features. Some models do not support tool use (function calling), which Copilot agents rely on. Before switching, check that your chosen model supports:
- Tool/function calling (required for agents)
- Long context windows (Copilot can send large files)
- Streaming (Copilot streams responses in real-time)

**Billing is separate.** You now pay your model provider directly instead of a flat GitHub Copilot license fee. This can be cheaper or more expensive depending on usage.

**Session sync still uses GitHub.** Your chat history and Session sync still upload to GitHub's servers, even if your model runs elsewhere. If you need 100% on-premise, you need a fully private deployment (not BYOK).

**Model capabilities vary.** If you switch from GPT-5 to an older model, Copilot's reasoning and code quality may degrade. Test on real work before rolling out to the team.

## When to use BYOK

**Use it if:**
- Your team has a preferred model and want to standardize
- Your security policy requires on-premise or private model endpoints
- You have a licensing deal with a specific vendor
- You want to experiment with different models without changing Copilot

**Skip it if:**
- You are happy with GitHub's default model choice
- You want GitHub to manage model updates and costs
- You do not have API keys for alternative providers

## The larger shift

BYOK is part of a bigger trend: Copilot is becoming less of a GitHub-branded product and more of a platform.

You can now:
- Choose your model (BYOK)
- Write custom agents (Copilot extensions and skills)
- Deploy agents to remote machines (remote execution)
- Configure organization rules (AGENTS.md)

The interface is still called "GitHub Copilot," but the underlying infrastructure is increasingly pluggable.

### Sources

- [GitHub Copilot: Using custom models (BYOK documentation)](https://docs.github.com/en/copilot/using-github-copilot/byok)
- [VS Code: Configuring Copilot model providers](https://code.visualstudio.com/docs/copilot/model-providers)
- [Anthropic API documentation](https://docs.anthropic.com/claude/reference/getting-started-with-the-api)
- [GitHub Blog: Copilot enterprise features (May 2026)](https://github.blog/changelog/2026-05-22-github-copilot-enterprise-updates/)
