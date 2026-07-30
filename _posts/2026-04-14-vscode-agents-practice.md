---
layout: post
title: "VS Code 1.123 in Real Work: What Actually Changed for Agentic Coding"
date: 2026-04-14 00:00:00 +0000
description: "After using VS Code 1.123 in daily engineering work, here is what improved, what stayed hard, and what workflow changes are worth adopting right now."
tags: [ai, developer-tools, vscode, github-copilot, workflow]
---

> **Accuracy note (2026-07-29 audit):** This post was reviewed against current official documentation in July 2026 and contains inaccuracies relative to the current state of the tools described. The post is retained for its workflow reasoning; the specific factual issues are:
>
> This post is dated April 14 but describes VS Code 1.123 as a released product. VS Code 1.123 was released June 3, 2026, so a first-person 'released version' account in April is chronologically impossible unless it used an Insiders/pre-release build. The features described (session sync, chronicle, agents window) are real as of the June 3 release; the date does not align with general availability.
>
> Reference docs to verify against:
- VS Code 1.123 release notes (June 3, 2026) — https://code.visualstudio.com/updates/v1_123


I have read a lot of “agentic coding” takes this year, and most are either hype or fear.

The VS Code 1.123 release was the first update that felt less like hype and more like operations. Not because it introduced one flashy model feature, but because it improved how sessions are tracked and managed when you are doing real multi-step work.

The features that changed my workflow are straightforward:

1. session sync
2. `/chronicle`
3. side-by-side agent sessions in the Agents window

None of these magically writes perfect software. But they reduce the friction of running serious AI-assisted development as a repeatable process.

## The old problem: context fragmentation

Before this release, my AI work looked like this:

- one session had planning context
- another had implementation attempts
- a third had review comments
- and at least one “important” decision lived only in my memory

That is survivable on a one-off script. It is expensive on a real project.

When session context is fragmented, you do the same cognitive work repeatedly:

- restating assumptions
- reloading constraints
- explaining decisions already made yesterday

This is not model-quality failure. It is workflow-surface failure.

## What session sync fixed for me

In 1.123, session sync stores conversation history and related repo context in your account. Practically, this means I can move machines or resume later without rebuilding everything from scratch.

That is valuable for two reasons:

1. **Continuity:** less “where were we?” overhead.
2. **Auditability:** there is a recoverable trail of what was discussed and changed.

The second point matters more than it seems. AI workflows get safer when decisions are inspectable after the fact.

## Why `/chronicle` is underrated

`/chronicle` is the first feature that made me stop treating prior sessions as dead text.

Instead of manually searching through old logs, I can ask targeted questions about previous work:

- what changed in this area last week?
- which session touched this file?
- what was the rationale for this approach?

That shifts session history from archive to active tool.

I now use it in two places:

1. as a pre-work warmup (“what did I already decide?”)
2. as a standup input (“what actually moved?”)

## The Agents window and parallel work

I used to fake parallel AI work with multiple tabs and a lot of copy/paste.

The Agents window makes this cleaner: I can keep separate sessions open and compare outputs without losing the thread.

The important part is not “parallelism” by itself. It is **bounded parallelism**:

- one session owns planning
- one owns implementation
- one owns critique/review

If those boundaries are not clear, parallel sessions become noise quickly.

## What did not change

This update did **not** eliminate the need for engineering discipline.

You still need:

- explicit acceptance criteria
- clear handoff boundaries
- verification before completion claims
- PR review gates

Agent UX got better. Governance is still your job.

## A practical checklist I now use

If you are adopting this release, here is the minimum setup I recommend:

1. Turn on session sync (if your org policy allows it).
2. Use `/chronicle` at session start before coding.
3. Split long tasks into named sessions with clear ownership.
4. Capture final decisions in PR/issue artifacts, not only in chat.
5. Treat “agent done” as a hypothesis until independently verified.

This is boring. It also works.

## Bottom line

VS Code 1.123 did not make AI coding “solved.” It made it more operational.

For me, that is the right direction: fewer hero prompts, more reliable process.

If you are building with AI every day, workflow ergonomics now matter as much as model capability.

### Sources

- [Visual Studio Code 1.123 release notes](https://code.visualstudio.com/updates/v1_123)
- [GitHub changelog: GPT-5.2 and GPT-5.2-Codex deprecated (June 5, 2026)](https://github.blog/changelog/2026-06-05-gpt-5-2-and-gpt-5-2-codex-deprecated/)
