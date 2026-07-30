---
layout: post
title: "The Agents Window: How to Actually Run Multiple AI Tasks Side by Side in VS Code"
date: 2026-02-17 00:00:00 +0000
description: "VS Code's new Agents window lets you orchestrate parallel AI sessions without losing context. Here's how to use it, and why it matters for real work."
tags: [ai, developer-tools, vscode, github-copilot, workflow, agents]
---

> **Accuracy note (2026-07-29 audit):** This post was reviewed against current official documentation in July 2026 and contains inaccuracies relative to the current state of the tools described. The post is retained for its workflow reasoning; the specific factual issues are:
>
> The VS Code Agents window is a Preview feature and its controls differ from the inventory described here. As of VS Code 1.123 (released June 3, 2026), the Agents window supports multiple open sessions side-by-side, pinning, drag-and-drop, 'Open to the Side', and a maximize action — not the 'session name / unread count / quick-switch' controls listed below. Refer to the official VS Code 1.123 release notes for the current UI.
>
> Reference docs to verify against:
- VS Code 1.123 release notes — https://code.visualstudio.com/updates/v1_123


Most developers think "agent mode" means watching Copilot solve the whole problem in one shot. In practice, real work is messier: you need planning notes, reference implementations, and review passes all happening at once—but not tangled together.

The Agents window in VS Code solves this by letting you keep multiple agent sessions open and visibly separate. It is not fancy. But it cuts the friction of switching between contexts significantly.

## The problem it solves: context fragmentation with one chat

Before the Agents window, a typical day looked like this:

- Chat tab 1: Planning discussion ("what should the API look like?")
- Chat tab 2: Implementation attempt ("write the database schema")
- Chat tab 3: Debugging ("why is this query slow?")
- Your memory: the one design decision from 45 minutes ago that affects all of them

Each tab felt independent. When you moved between them, your mental model of "which assumptions are we working from?" had to rebuild.

Over a full day, this cost real time: restating constraints, backtracking on decisions, or applying a fix to the planning chat that never makes it to implementation.

## What the Agents window does differently

The Agents window gives you dedicated, labeled slots for different sessions. Instead of tabs that all look the same, you can see:

```
Planning Agent        → [conversation history]
Implementation Agent  → [conversation history]
Review Agent          → [conversation history]
```

Each agent runs independently. When implementation asks "should we validate on the client or server?", you can look directly at planning's notes without navigating away.

The window itself shows:
- Session name and scope (you set this)
- Unread message count
- Last message timestamp
- Quick-switch buttons to jump between agents

It is bounded parallelism: intentional boundaries make multi-tasking useful instead of chaotic.

## A practical workflow with the Agents window

Here is how I use it on a real feature:

**Session 1 — Planning Agent**
- I describe the feature request and edge cases
- Agent breaks it down: API surface, data model, user flows
- I capture this as the canonical spec
- Status: ✓ done (not touched again unless requirements change)

**Session 2 — Implementation Agent**
- I reference the planning notes: "Following the spec from Planning Agent..."
- Agent writes code, runs tests, handles refactoring
- I stay in this session for 20-40 minutes
- Status: iterating

**Session 3 — Review Agent**
- I paste the final diff: "Review this PR diff for..."
- Agent checks: logic errors, edge cases, performance, security
- Findings go back to Implementation Agent if needed
- Status: waiting for implementation fixes

The key shift is that I switch agents intentionally, not because I lost the thread. Each session has one job.

## Naming agents so their role is clear

The power is in the naming. When you create a session, give it a role:

- `planning-user-auth`
- `impl-user-auth`
- `review-user-auth`

Or:
- `design-dashboard`
- `code-dashboard`
- `test-dashboard`

When a session name tells you what it does, context switching costs less. You do not have to reread the full conversation to remember "oh, this one is for architecture."

## When the Agents window actually helps

This is most useful on multi-day features:
- You finish one session mid-afternoon
- You come back tomorrow and the Planning Agent still has all your constraints documented
- Context sync (if enabled) means your machine's Agents window mirrors your account state
- No "where were we?" overhead

It is less useful on quick fixes (one agent, 10 minutes). It is extremely useful on the work that spans sprints.

## What it does not do

The Agents window does not:
- Automatically coordinate between agents (they do not read each other's chats)
- Prevent you from applying one agent's output to the wrong context
- Replace explicit acceptance criteria (you still write those)

You have to manually copy insights from Planning to Implementation. That is fine—it is a feature, not a bug. The friction of deliberate copy-paste means you notice when something does not align.

## How to set it up

In VS Code 1.123+:
1. Open the Copilot Agents panel (bottom-right corner)
2. Click "New Session"
3. Give it a scope name (e.g., "Planning: Feature X")
4. Leave it open (it persists across VS Code restarts if session sync is enabled)
5. Start with your first agent's scope

That is it. You can now reference other sessions by name when briefing a new agent.

## Bottom line

The Agents window is the first feature that made multi-session work feel like operations instead of chaos.

If you are working on a feature bigger than a single morning, naming and organizing your agent sessions pays back in reduced context-switching cost and fewer "wait, what were we assuming?" moments.

Boring wins again.

### Sources

- [Visual Studio Code Agents window documentation](https://code.visualstudio.com/docs/copilot/agents)
- [GitHub Blog: Copilot in VS Code April releases](https://github.blog/changelog/2026-05-06-github-copilot-in-visual-studio-code-april-releases/)
- [GitHub Copilot documentation: Agents overview](https://docs.github.com/en/copilot/using-github-copilot/agents-overview)
