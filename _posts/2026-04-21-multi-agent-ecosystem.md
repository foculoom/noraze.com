---
layout: post
title: "Running Multiple AI Agents in One Workspace: Orchestration Without Chaos"
date: 2026-04-21 00:00:00 +0000
description: "VS Code now supports multiple AI agents (Copilot, Claude, OpenAI agents) working in parallel. How to coordinate them without them fighting each other."
tags: [ai, developer-tools, vscode, agents, workflow, coordination]
---

> **Accuracy note (2026-07-29 audit):** This post was reviewed against current official documentation in July 2026 and contains inaccuracies relative to the current state of the tools described. The post is retained for its workflow reasoning; the specific factual issues are:
>
> The 'single Agents panel listing Copilot, Claude, and custom agents with each agent reading prior agents' shared context' described below does not match the VS Code Agents window model. The Agents window manages sessions; installing a separate Claude extension or selecting a model does not create interoperable agents that automatically share read-only histories. Only one session is active at a time; cross-session context transfer is manual. Treat the automatic shared-context claim as unverified.
>
> Reference docs to verify against:
- VS Code 1.123 — Agents window (Preview) — https://code.visualstudio.com/updates/v1_123#_agents-window-preview


For years, VS Code was single-agent. You had Copilot. If you wanted to use another AI service, you opened a separate chat window and manually copied results between them.

In May 2026, VS Code added true multi-agent support. You can now keep Copilot, Claude, and custom agents open in the same workspace, each with separate sessions but shared context.

The trick is not having them fight. When you have three agents all suggesting solutions, you need to know why each one is suggesting what it is, and when to trust which agent.

## Why multi-agent workspaces matter

Different AI models have different strengths:
- **Copilot (GPT-5):** Fast, good at code generation, understands GitHub context
- **Claude (Anthropic):** Better at reasoning, stronger at architectural discussions
- **Custom agents:** Know your codebase, internal APIs, team conventions

In the past, you would pick one and live with its limitations. Now you can use each for what it is good at.

**Example workflow:**
1. Ask Copilot to generate a React component (fast)
2. Ask Claude if the component is over-engineered (reasoning)
3. Ask your custom infrastructure agent if the component can be deployed with your infra (domain knowledge)
4. Take the best parts of all three suggestions

Result: better code, faster iteration.

## How multi-agent workspaces work

In VS Code 1.120+, open the Agents panel and you see:

```
Agents Window
├─ Copilot      [switch]
├─ Claude       [switch]
└─ Infrastructure Agent [switch]
```

Each agent has:
- Its own chat history
- Its own session state
- Access to shared workspace context

When you switch between agents, they have read-only access to what prior agents saw, but each maintains its own reasoning thread.

This is different from one big conversation. It is more like having three colleagues at your desk, each with their own notebook.

## Setting up multiple agents

### Agent 1: Copilot (built-in)
Copilot is already available. Nothing to do.

### Agent 2: Claude via Anthropic API

In VS Code:
1. Install the Claude extension (from VS Code Marketplace)
2. Go to Settings → Claude → API Key
3. Paste your Anthropic API key
4. Claude appears in the Agents panel

### Agent 3: Custom agent

Build and deploy a custom agent (see previous post on extensions). Once deployed:
1. Your team installs it like any extension
2. It appears in the Agents panel
3. You can switch to it from Copilot or Claude

## Practical multi-agent workflows

### Workflow 1: Code design review

You are starting a new feature. You want input from multiple perspectives.

**Session 1 — Copilot:**
You describe the feature. Copilot generates an initial design:
```typescript
type User = {
  id: string;
  name: string;
  email: string;
  preferences: Record<string, any>;
}
```

**Session 2 — Claude:**
You ask: "Review this design for over-engineering. Are there edge cases we are missing?"

Claude sees your Copilot output and responds:
```
Good: Simple structure.
Concern: preferences uses Record<string, any>. That is too loose. 
Better: Create a specific PreferencesSchema for validation.
Edge case: What happens if email is not unique?
```

**Session 3 — Infrastructure Agent:**
You ask: "Can we store this with our current database? Any performance concerns?"

Your agent knows your database schema and responds:
```
Fits our schema perfectly. ✓
Performance: Add index on email (high query volume).
Recommendation: Pre-allocate id via UUID v6 (better locality than v4).
```

**Result:** You have design input from speed (Copilot), reasoning (Claude), and domain knowledge (your agent). Better design in 30 minutes.

### Workflow 2: Debugging with multiple agents

A test is failing and you are not sure why.

**Session 1 — Copilot:**
You paste the error. Copilot suggests: "Looks like a race condition. Try adding a timeout."

**Session 2 — Claude:**
You ask for deeper analysis: "Is this actually a race condition? What is the root cause?"

Claude, with better reasoning, suggests: "Not a race condition. The mock setup is incomplete. Jest mock is not being called in the right order."

**Session 3 — Your test infrastructure agent:**
You ask: "What is the right way to set up this mock in our test framework?"

Your agent knows your testing conventions and provides the correct setup code.

**Result:** Copilot's surface-level suggestion was wrong. Claude found the real issue. Your agent knew how to fix it. Without multi-agent, you would have applied Copilot's suggestion and spent hours debugging.

### Workflow 3: Refactoring with consensus

You are refactoring a payment processing module. Big change, want to get it right.

**Ask Copilot:**
"Refactor this payment handler for readability."
→ Copilot provides a clean version.

**Ask Claude:**
"Is this refactoring safe? Any hidden bugs?"
→ Claude finds a timezone bug in charge dates.

**Ask your infrastructure agent:**
"Will this work with our payment gateway?"
→ Agent says: "Yes, but reorder the API calls (gateway needs auth before amount)."

**Compare results:**
You now have three perspectives on the same problem. Apply the best insights from each.

## When multi-agent helps vs. when it is overhead

**Use multi-agent when:**
- You are doing high-stakes work (architecture, security, payments)
- You want perspective from different AI models
- You need both fast suggestions and deep reasoning
- Your team has custom agents that add real domain knowledge

**Stick with single agent when:**
- You are fixing a simple bug
- You are writing routine code (no edge cases)
- You are in flow and speed matters more than depth
- You do not have multiple agents worth consulting

## Practical tips for multi-agent workflows

**Tip 1: Name your sessions clearly**

Instead of `Chat 1`, `Chat 2`, `Chat 3`, name them:
- `Design review — Payment flow`
- `Security review — Payment flow`
- `Infra validation — Payment flow`

Clear names make it obvious when to switch to which agent.

**Tip 2: Start with Copilot for speed**

Copilot is usually fastest. Get a first draft from Copilot, then route to Claude or custom agents for review.

**Tip 3: Use Claude for reasoning bottlenecks**

When you are stuck and need to think through something deeply, Claude is often better than Copilot. Switch to Claude for complex trade-offs.

**Tip 4: Let custom agents handle domain questions**

Your infrastructure agent knows things Copilot and Claude do not (your internal APIs, your conventions). Use it for domain-specific questions.

**Tip 5: Compare suggestions, do not blindly apply**

When you get suggestions from multiple agents, you still need to evaluate them. Do not let them make the decision for you.

## Coordination between agents: what works, what does not

**What works:**
- Each agent has its own session and reasoning
- Agents can see outputs from other agents (read-only)
- You manually coordinate by copying insights between sessions
- Each agent focuses on one job

**What does not work:**
- You cannot run a single prompt across all three agents at once
- Agents do not automatically debate each other
- There is no built-in "take these three outputs and synthesize them" feature
- You have to manually manage what each agent sees

This is intentional. It prevents agents from getting confused or contradicting each other.

## The bigger picture

Multi-agent workspaces represent the maturation of AI-assisted coding.

It is no longer "use one AI to do everything." It is "use the right AI for each part of the problem."

This is how specialized teams work in real companies:
- You ask the architect for design review
- You ask the security expert for security review
- You ask the domain expert for feasibility

Multi-agent brings that diversity to your editor.

### Sources

- [VS Code Agents documentation](https://code.visualstudio.com/docs/copilot/agents)
- [GitHub Copilot Extensions for third-party agents](https://docs.github.com/en/copilot/creating-copilot-extensions)
- [GitHub Blog: Multi-agent support in VS Code (May 2026)](https://github.blog/changelog/2026-05-08-github-copilot-multi-agent-support/)
- [Anthropic: Claude API and integrations](https://docs.anthropic.com/)
