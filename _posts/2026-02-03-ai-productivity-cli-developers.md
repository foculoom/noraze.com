---
layout: post
title: "AI Productivity for CLI-First Developers"
date: 2026-02-03 00:00:00 +0000
description: "Stop switching to browser chat tabs. Treat AI as a composable terminal tool — and keep your flow intact."
image: /assets/images/ai-cli-productivity-og.svg
tags: [ai, cli, productivity, developer-tools, github-copilot]
---

> **Accuracy note (2026-07-29 audit):** This post was reviewed against current official documentation in July 2026 and contains inaccuracies relative to the current state of the tools described. The post is retained for its workflow reasoning; the specific factual issues are:
>
> The GitHub CLI Copilot extension (`gh copilot suggest` / `gh copilot explain`) has been retired; current terminal Copilot workflows use the standalone Copilot CLI with an agentic interface. Treat the `gh copilot suggest`/`explain` commands below as historical; confirm current terminal Copilot usage against the official Copilot CLI documentation.
>
> Reference docs to verify against:
- GitHub Copilot CLI — https://docs.github.com/en/copilot/concepts/agents/about-copilot-cli


## Prerequisites

To follow the examples in this article you need two things installed and authenticated:

```sh
# 1. Install the gh CLI — https://cli.github.com
#    macOS: brew install gh   |   Linux: see https://github.com/cli/cli#installation

# 2. Install the Copilot extension
gh extension install github/gh-copilot

# 3. Authenticate (if you haven't already)
gh auth login
```

Once `gh copilot suggest "hello"` prints a suggestion, you're ready.

---

You type `gh copilot suggest "list processes using port 8080"` and a runnable one-liner lands in your terminal in under three seconds — already inside the same composable environment where your pipes, aliases, and flow live. No browser tab opened. No context switch.

Same task via a chat window: open browser, navigate to the UI, paste the question, read the response, copy the command, return to terminal — three interruptions before you have anything to run.

**What if the AI were just another program in your pipeline?**

---

## The Problem with GUI-First AI

The cost is not the AI — it is the round trip.

Every time you leave the terminal to reach a chat interface, you perform at least three context hops: terminal → browser tab → chat UI → copy result → back to terminal. Each hop is small. Across a four-hour coding session they are not small at all.

Consider a common scenario: you hit an unfamiliar error trace and need to understand it quickly. The GUI path requires selecting text, switching to a browser, navigating to the chat tool, pasting, waiting, reading, copying the useful part, and returning to your terminal. The shell path:

```sh
# Diagnose an error inline — capture first, then compose as a string argument
ERR=$(tail -20 error.log)
gh copilot suggest "diagnose this error and suggest a fix: $ERR"
```

The suggestion appears in your terminal. Context never moved.

The mechanism behind this friction is workflow design, not model quality. Switching tools is not just a time cost; it is an attention reset. The fix is not a better chat tool. It is a different mental model.

---

## Mental Model: AI as a Composable Tool

In a Unix shell, composability means treating every program's stdout as a potential input stage. A program that reads an argument and writes to stdout slots into any script, alias, or pipeline. `gh copilot suggest "..."` works exactly this way: pass a task description as a positional string argument and the output is text on stdout — capturable with `$()`, filterable with `grep` or `awk`, embeddable in a `Makefile` target.

The reframe that matters: AI output is a stream, not a reply. A reply demands your attention in the moment. A stream can be captured, reviewed, and acted on as part of a larger workflow — or discarded. Once you treat AI responses as streams, they compose exactly like any other shell output.

One line converts the tool into a first-class shell verb:

```sh
# Add to .bashrc or .zshrc
alias ask='gh copilot suggest'
```

No config file, no install step. `ask "..."` is now a shell verb that fits anywhere you'd type a command.

For team workflows, scope it to a project via `Makefile`:

```makefile
# Makefile — project-specific AI entry point
ask: ## Usage: make ask PROMPT="describe the task"
	@gh copilot suggest "$(PROMPT)"
```

Commit this target and every developer on the team gets a shared, project-scoped AI entry point. Zero per-developer setup beyond `gh` auth.

> **⚠ Guard:** `gh copilot suggest` requires the task description as a positional argument string. Omit it and the tool enters interactive mode — breaking pipe-safe usage and any script that wraps it.

---

## The Playbook

### Habit 1 — Suggest by description

```sh
# Ask for a shell one-liner; review output before running
gh copilot suggest "list all running docker containers sorted by memory usage"
```

The suggestion prints to your terminal. Read it before pressing Enter — unfamiliar flags deserve a second look. If the output is unclear, feed it to Habit 3 before running. The pattern works well for ad-hoc tasks you run infrequently enough that you can't rely on shell history: `gh copilot suggest` acts as a searchable vocabulary for shell idioms, with context coming from your description rather than your memory.

### Habit 2 — Scope to git with `-t git`

```sh
# Constrain suggestions to git commands
gh copilot suggest -t git "squash the last three commits into one with a new message"
```

The `-t git` flag keeps suggestions within git command space. Without it, the model may suggest shell alternatives when you want a `git` invocation. Reliable in git workflow aliases and pre-push hook documentation.

### Habit 3 — Explain in-context

```sh
# Plain-English explanation, no browser, no context switch
gh copilot explain "git rebase -i HEAD~3"
```

Use this when reading an unfamiliar one-liner from a script, a PR comment, or a `man` page example. The explanation prints to stdout — review it inline or capture it with `$()`. When you encounter a command in a PR review and you're not sure what a specific flag does, `explain` gives you a breakdown without parsing a `man` page or opening a browser tab.

### Habit 4 — Capture context with variable assignment

```sh
# Capture rg output first; embed as a string — no interactive pipe
HITS=$(rg "TODO" src/ -l | head -5 | tr '\n' ',')
gh copilot suggest "given files with open TODOs: $HITS — write a bash script to grep and print each TODO with its file and line number"
```

The critical pattern is capture-then-compose. Piping directly into `gh copilot` triggers interactive mode. Capture the context you need with `$()` first, then embed it as a string in the prompt argument. This is the reliable pattern for any codebase-aware suggestion.

> **⚠ Safety — metacharacter injection in `$VAR` interpolation:** When the captured variable comes from log output or user-controlled input (e.g. `ERR=$(tail -20 error.log)`), it may contain shell metacharacters — backticks, `$()`, quotes, newlines — that word-split or execute when unquoted inside a double-quoted string. Two safe patterns:
>
> ```sh
> # Option A — printf %q escapes the value for safe re-use as a single word
> SAFE_ERR=$(printf '%q' "$(tail -20 error.log)")
> gh copilot suggest "diagnose this error: $SAFE_ERR"
>
> # Option B — truncate and strip control characters before embedding
> ERR=$(tail -20 error.log | tr -d '\000-\037' | head -c 500)
> gh copilot suggest "diagnose this error: $ERR"
> ```
>
> For `$HITS`-style captured paths and comma-lists the risk is low, but adopt `printf '%q'` by default whenever the source is a log file or external command output.

### Habit 5 — Embed project context in a Makefile target

```makefile
# Embed stack conventions directly in the prompt prefix
ask-go: ## Usage: make ask-go TASK="describe the task"
	@gh copilot suggest "in this Go codebase using chi router — $(TASK)"
```

Project-scoped prompts reduce the overhead of remembering which framework, router, or naming convention applies to each query. Commit this target and a teammate can run `make ask-go TASK="add a middleware that logs request duration"` without knowing the full stack context — the `Makefile` carries it.

---

## Anti-Patterns to Drop

### 1. Switching to the browser for every AI query

**Problem:** Every GUI-bound query costs three context hops — terminal → browser → chat UI → copy → back. Three queries per hour at three hops each is 36 attention resets in a four-hour session.

**Consequence:** You spend more time switching contexts than evaluating the output.

**Fix:** Add `alias ask='gh copilot suggest'` to your shell profile and the `ask` target to your project `Makefile`. When the tool is already in your terminal, the terminal becomes the path of least resistance.

### 2. Running AI-generated commands without reading them

**Problem:** AI tools hallucinate flags. This is falsifiable in under sixty seconds: ask for a command with an unfamiliar flag, then verify that flag exists.

**Consequence:** Invented syntax reaching production scripts, or destructive commands running unchecked.

**Fix:** Read the output before pressing Enter. For anything destructive, prefix with `echo` or use `--dry-run` where supported.

### 3. Prompting in prose when you need a runnable command

**Problem:** `"How do I find files modified in the last 24 hours?"` returns a multi-paragraph explanation with alternatives.

**Consequence:** Verbose output that puts the extraction work back on you.

**Fix:** Frame the need as a task: `gh copilot suggest "find all files modified in the last 24 hours in the current directory"` returns a command, not an essay.

---

## What to Try Today

Treating AI as a composable terminal tool — not a chat window — is the difference between AI that accelerates flow and AI that fragments it. The habits above are not theoretical: each takes one to four lines to install.

Start here:

- **Prove the model now:** `gh copilot explain "git rebase -i HEAD~3"` — no setup required beyond `gh` auth; you never leave the terminal
- **Make `ask` a shell verb:** `echo "alias ask='gh copilot suggest'" >> ~/.zshrc && source ~/.zshrc`
- **Share it with your team:** add the `ask` target to your project `Makefile` — zero per-developer setup
- **Try Habit 4 on your next error:** capture output with `$()`, embed it in a prompt, get a targeted suggestion
- **Build the read habit:** run `gh copilot explain <command>` before executing any AI-generated command you don't fully recognise
