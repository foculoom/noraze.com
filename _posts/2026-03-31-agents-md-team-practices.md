---
layout: post
title: "AGENTS.md: How Teams Share Copilot Practices Without Documentation"
date: 2026-03-31 00:00:00 +0000
description: "Create an AGENTS.md file in your repo to teach Copilot (and your team) how to work. Here's what goes in it."
tags: [ai, developer-tools, vscode, github-copilot, team-practices, documentation]
---

> **Accuracy note (2026-07-29 audit):** This post was reviewed against current official documentation in July 2026 and contains inaccuracies relative to the current state of the tools described. The post is retained for its workflow reasoning; the specific factual issues are:
>
> Two corrections: (1) `AGENTS.md` support predates May 2026 — the historical claim below is wrong. (2) `AGENTS.md` supports nested/scoped instruction files (a root file supplies repository-wide instructions; nested files apply more specific instructions by directory), not only a root file as stated. The cited `agents-md-instructions` URL returns 404. Refer to current GitHub custom-instructions documentation.
>
> Reference docs to verify against:
- GitHub custom instructions / AGENTS.md — https://docs.github.com/en/copilot/customizing-copilot


You onboard a new developer. You want them to know: "We use error boundaries for React, we validate on the server not the client, we name test files with .test.ts."

Traditionally, you write a CONTRIBUTING.md or ask someone to pair with them.

In May 2026, GitHub added AGENTS.md—a file that teaches Copilot your team's practices. When a developer (new or experienced) uses Copilot in your repo, it reads AGENTS.md and adjusts its behavior accordingly.

AGENTS.md is not documentation for humans. It is instructions for Copilot. It is how you encode your team's conventions in a way that agents actually follow.

## Why AGENTS.md matters

Before AGENTS.md, when you asked Copilot to "write a React component," it would generate something generic. It might use Redux when your team uses Context API. It might validate on the client when your team policy is server-only validation.

With AGENTS.md, Copilot knows your patterns. It generates code that matches your team's conventions without you having to correct it every time.

More importantly: new developers do not have to ask "how do we do X?" because Copilot shows them the right way, consistently.

## What goes in AGENTS.md

Create a file called `AGENTS.md` in the root of your repo:

```markdown
# How AI Agents Should Work in This Repository

## Language and Framework Preferences

- **Framework:** React 18+ with TypeScript 5.0+
- **State management:** Use React Context + useReducer, not Redux
- **UI library:** Material-UI v5 only
- **API calls:** Use `fetch` with custom hooks, not axios

## Error Handling

- Wrap all `async` functions with try/catch
- Return `{ success: false, error: "message" }` on failure
- Never throw in event handlers; log and return error objects
- Server-side validation is required; client validation is a UX enhancement only

## Testing

- Use Vitest, not Jest
- Test files: `*.test.ts` in the same directory as source
- Aim for 80%+ coverage on critical paths
- Avoid mocking unless necessary; prefer test fixtures

## Deployment

- Dev environment: `npm run dev`
- Production build: `npm run build`
- Deploy to: staging (auto after main PR merge), prod (manual via tag)

## API Design

- All endpoints require authentication (JWT in Authorization header)
- Paginated endpoints use `?page=N&limit=20` format
- Always return HTTP 200 with `{ success: true/false, data?: T, error?: string }`

## Code Style

- Use single quotes for strings
- Use `const`, not `let` or `var`
- Max line length: 100 characters
- Prefer arrow functions `=>` except for class methods
```

When Copilot agents work in your repo, they read this file and follow these practices.

## How agents use AGENTS.md

When you ask Copilot to generate code:

```
"Write a login form component"
```

Without AGENTS.md:
- Copilot generates generic React code
- Uses its default state management (Redux, Zustand, etc.)
- Writes tests in whatever format it defaults to

With AGENTS.md:
- Copilot sees "use React Context + useReducer"
- Sees "test files are *.test.ts"
- Sees "validate on server, not client"
- Generates code that matches your team's patterns from the first attempt

Result: better-fitting code, fewer "you need to refactor this" reviews.

## Example: AGENTS.md in a real project

Here is a realistic AGENTS.md for a Node.js backend:

```markdown
# Agent Instructions for payments-service

## Architecture

- **Framework:** Express.js 4.x
- **Database:** PostgreSQL with TypeORM (not Prisma)
- **Authentication:** JWT with RS256 algorithm (keys in env vars)
- **Logging:** winston, not console.log

## Code Organization

```
src/
├── routes/     # Express route handlers
├── services/   # Business logic
├── models/     # TypeORM entities
├── middleware/ # Auth, error handling, logging
├── utils/      # Shared utilities
└── tests/      # Test files (*.spec.ts)
```

## Error Handling

- Wrap route handlers in try/catch
- Throw custom `ApiError(statusCode, message)` from services
- Never leak internal details in error messages (use generic "Internal error" for 500s)
- Log full error with stack trace server-side only

## Database

- All queries use TypeORM, not raw SQL
- Migrations run automatically on startup if `DB_MIGRATE=true`
- No cascading deletes without explicit approval
- Use indices on foreign keys and frequently-queried columns

## Deployment

- Services are stateless (can scale horizontally)
- Config via environment variables only (no hardcoded values)
- Startup: `npm run migrate && npm start`

## Testing

- Use Jest with `supertest` for HTTP testing
- Each test file mirrors the source file: `src/routes/auth.ts` → `src/routes/__tests__/auth.spec.ts`
- Mock external services (Stripe, Twilio) in tests

## Security

- Validate and sanitize all user input
- Never log passwords or API keys
- CORS whitelist: only https://yourdomain.com and https://admin.yourdomain.com
```

When engineers work in this repo and ask Copilot to add a new endpoint, it will:
- Use TypeORM entities
- Wrap in try/catch
- Throw `ApiError`
- Add a corresponding test file

## Where to put AGENTS.md

```
my-repo/
├── AGENTS.md          ← Put it here
├── src/
├── tests/
├── package.json
└── README.md
```

That is it. Git commit it like any other file.

## Using AGENTS.md across your organization

If you have multiple repos with similar patterns:

**Option 1: Share a template**
- Create a central `AGENTS.md.template`
- Each repo copies it and customizes for their needs
- Document in your team's wiki or handbook

**Option 2: Create a shared extension**
- Build a Copilot extension (from the prior post) that enforces org-wide practices
- Extensions are more powerful than AGENTS.md; use this if patterns are complex

## When AGENTS.md makes the biggest impact

AGENTS.md is most valuable for:
1. **Onboarding** — New developers see the right patterns from day one
2. **Large codebases** — More code means more edge cases where Copilot can go wrong
3. **Teams with strong conventions** — If your team has specific practices, document them
4. **API services** — Copilot often generates inconsistent API responses; AGENTS.md fixes this

AGENTS.md is less valuable if:
- Your codebase is small (one person can onboard another in 30 minutes)
- Your practices are documented elsewhere and rarely change
- Your team does not use Copilot heavily

## Keeping AGENTS.md up to date

Treat AGENTS.md like any code. When your team agrees on a new practice:
1. Someone updates AGENTS.md
2. Review and merge the PR
3. All Copilot sessions immediately use the new practice

Version control + code review keeps it accurate.

## Practical example: AGENTS.md for a React app

```markdown
# Frontend: React App AGENTS.md

## React Patterns

- Use functional components with hooks
- Custom hooks for shared logic (not higher-order components)
- Never use `useState` for derived data; compute it inline
- Error boundaries around pages, not individual components

## Form Handling

- Use `react-hook-form` for all forms
- Validation schema: Zod (runtime type checking)
- Don't validate on blur; validate on submit

## API Integration

- Create custom hooks: `useGetUser()`, `useCreatePost()`, etc.
- Always handle loading and error states
- Retry failed requests up to 3 times with exponential backoff

## Styling

- Tailwind CSS for all styles (no CSS modules, no styled-components)
- Component layout: Tailwind utilities, not custom classes
- No inline styles except for dynamic values

## Testing

- Unit tests with Vitest
- Component tests with React Testing Library
- No snapshot tests (they give false confidence)
- Mock API calls with MSW (Mock Service Worker)
```

New developers see this and Copilot generates components that follow it. Faster code review, fewer corrections.

## The bigger picture

AGENTS.md is a small file with big implications. It is the first time you can encode team practices in a way that AI actually respects.

As more teams use AGENTS.md, the cost of onboarding drops and code consistency improves automatically.

### Sources

- [GitHub Copilot: Using AGENTS.md](https://docs.github.com/en/copilot/using-github-copilot/agents-md-instructions)
- [VS Code: Repo-level Copilot settings](https://code.visualstudio.com/docs/copilot/settings)
- [GitHub Blog: Copilot in VS Code May releases](https://github.blog/changelog/2026-05-06-github-copilot-in-visual-studio-code-may-releases/)
