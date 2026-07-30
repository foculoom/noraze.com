---
layout: post
title: "Building iOS/iPadOS Games the AI-Native Way"
date: 2026-05-08 00:00:00 +0000
description: "Stop using agents as a chat window. Treat them as roles in your pipeline — and build SpriteKit games with the context-switch tax removed."
tags: [ai, agents, vscode, github-copilot, ios, ipados, spritekit, gameplaykit, swift, game-dev]
---

> **Accuracy note (2026-07-29 audit):** This post was reviewed against current official documentation in July 2026 and contains inaccuracies relative to the current state of the tools described. The post is retained for its workflow reasoning; the specific factual issues are:
>
> Two refinements: (1) Explicit `@workspace` usage has been deprecated in current VS Code in favor of automatic workspace context/tool selection in agent/chat workflows. (2) The absolute claim that the coding agent 'always uses a remote environment where local checkout and main are never touched' applies to GitHub's cloud coding agent; VS Code exposes multiple agent types including local and cloud/background sessions. Distinguish GitHub Copilot coding agent (cloud) from local VS Code agents.
>
> Reference docs to verify against:
- VS Code agent types — https://code.visualstudio.com/docs/agents
- GitHub Copilot coding agent — https://docs.github.com/en/copilot/concepts/agents/about-copilot-coding-agent


# Building iOS/iPadOS Games the AI-Native Way

You're implementing a player state machine in SpriteKit. `GKStateMachine` has five states, each with valid transition logic, entry/exit animations, and physics toggles. You know exactly what it should do. The question is how long it takes to get there.

**The GUI path:** switch to a browser tab, open your chat tool of choice, describe the problem in prose, get back a wall of code that doesn't compile because it references `SKSpriteNode` as if you're using SceneKit, fix the types, copy-paste into Xcode or VS Code, discover the `isValidNextState` logic is wrong, return to chat, re-explain the context you already had, iterate twice more.

**The agent-native path:** your project already has a `.github/agents/builder.agent.md` with your Swift version, SpriteKit conventions, and `PhysicsCategory` struct baked in. You file a one-sentence GitHub Issue with three acceptance criteria. A Copilot coding agent picks it up, drafts `PlayerStateMachine.swift` on an isolated branch in a remote execution environment, and opens a PR. You read the diff — twenty minutes from issue to reviewable code, no tab-switching.

The difference is not model quality. It is workflow design.

This post is a deep-dive into the agent tooling available in VS Code and a practical playbook for applying it to Swift + SpriteKit / GameplayKit game development on iOS and iPadOS — written for indie developers who want to move fast without building up a debt of half-understood, untested scaffolding.

> **Prerequisites:** VS Code with the [GitHub Copilot extension](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) and [GitHub Pull Requests extension](https://marketplace.visualstudio.com/items?itemName=GitHub.vscode-pull-request-github) installed; a GitHub account with Copilot access; a Swift iOS/iPadOS project in a GitHub repository. The **Copilot coding agent** (autonomous PR generation) requires enabling agent mode in your GitHub Copilot settings. For iOS build/test validation, you'll need a macOS runner or a local Xcode install — the agent can produce a compilable diff without one, but Simulator verification stays a local step.

---

## The VS Code Agent Ecosystem

VS Code's agent landscape has three distinct layers. Understanding which layer you're operating in changes how you write prompts, structure issues, and manage context.

### Chat Participants (Interactive)

Chat participants are the `@`-prefixed actors in the VS Code Copilot Chat sidebar. `@workspace` indexes your project and can answer questions about your `GameScene.swift`, trace why your `SKPhysicsBody` mask configuration causes missed contacts, or explain a method in a file you haven't opened — within its context limits. `@github` reaches into your repository's issues and PR history. Custom participants can be registered via VS Code extensions.

These are **interactive agents**: you drive the conversation, they respond. They are good for exploration, diagnosis, and short drafting tasks where you want to stay in the loop on every step.

### MCP Servers (Tool Extensions)

Model Context Protocol servers extend what agents can *do* — not just what they know. An MCP server gives a Copilot agent a set of callable tools: read a file, list open GitHub Issues, query a SQLite database, call a REST API. For game development, you can connect MCP servers that expose your asset pipeline, your Simulator launch commands, or your build scripts.

The practical effect: instead of describing a task in prose, the agent can execute it — read your `Info.plist`, check which iOS deployment target you're using, call `xcodebuild` to verify a clean build, then write the implementation that matches.

### Copilot Coding Agent (Autonomous Background)

The Copilot coding agent is qualitatively different from the above. You don't interact with it turn-by-turn. You assign it a GitHub Issue. It:

1. Creates an isolated branch in a remote execution environment (your local checkout and `main` are never touched)
2. Reads your issue body, acceptance criteria, and repository context
3. Implements, runs whatever checks it can, pushes a branch
4. Opens a PR for your review

This is **autonomous work** — the agent drives, you gate at merge. The agent runs in a remote GitHub environment on an isolated branch; your local checkout and `main` are never touched. It is the highest-leverage tool for work that is well-specified and low-novelty: scaffolding a new component, wiring a `GKStateMachine`, adding a collision category, writing test harnesses for deterministic game logic.

> **⚠ Gate discipline:** The coding agent's output is only as good as its input. A vague issue produces a vague PR. A tight issue — three acceptance criteria (ACs), explicit constraints, one deliverable — produces a reviewable diff. The coding agent does not replace spec work; it rewards it.

> **⚠ Platform caveat:** The coding agent runs in a remote Linux/macOS environment. For Swift / SpriteKit projects, `xcodebuild` and Simulator validation require a macOS runner. Without one, the agent can still produce compilable Swift and a reviewable diff — but build verification and Simulator QA must happen locally before merge.

### Custom Agent Profiles

VS Code custom agent profiles live in `.github/agents/`. They are markdown files that inject a persona and a set of instructions into a Copilot Chat agent when you select it in the sidebar. They are not extensions; they require no install. A profile like `builder.agent.md` that knows your Swift version, your SpriteKit scene graph conventions, and your `PhysicsCategory` struct means you never re-inject that context by hand.

| Layer | You drive? | Autonomous? | Good for |
|---|---|---|---|
| Chat participant | Yes | No | Exploration, diagnosis, short drafts |
| MCP server | Yes | Tool-assisted | Build verification, asset pipeline |
| Coding agent | No (issue) | Yes | Scaffolding, boilerplate, well-scoped ACs |
| Agent profile | Configures the above | — | Context injection, role definition |

---

## Going Deep on Copilot Agents in VS Code

### `@workspace` and Codebase-Aware Completions

`@workspace` indexes your project's file tree and builds a working model of your codebase within its context limits. For SpriteKit work, this means it can usually reason about:

- The inheritance chain: `GameScene: SKScene`, `PlayerNode: SKSpriteNode`
- Which physics categories you've defined and what their bit values are
- Which `GKStateMachine` states already exist and which transitions are declared

This codebase awareness makes `@workspace` dramatically more useful than a raw chat tool for in-context questions: "Why does `PlayerJumpState` not transition to `PlayerRunState`?" is answerable with real context, not a generic explanation of `GKStateMachine`.

### Custom Agent Profiles in Practice

A well-written `builder.agent.md` for an iOS game project looks like this:

```markdown
---
name: BUILDER
description: Implements one scoped GitHub Issue. Produces a reviewable PR.
---

You are BUILDER. You implement exactly one scoped issue.

## Stack
- Swift 6.0, iOS 17+ / iPadOS 17+
- SpriteKit for rendering, GameplayKit for entity-component and state machines
- VS Code + Swift extension for editing; xcodebuild for builds

## Conventions
- PhysicsCategory is a struct with static UInt32 bitmask constants (never raw integers inline)
- SKPhysicsBody categories follow: player = 0b0001, ground = 0b0010, obstacle = 0b0100, collectible = 0b1000
- State machine states are named [Noun][Verb]State (e.g., PlayerRunState, PlayerJumpState)
- removeFromParent() must be called on all temporary nodes — no node leaks

## Constraints
- Implement only what the issue's acceptance criteria describe
- Do not refactor outside the issue scope
- All new types get a corresponding unit test target entry
```

This profile loads every time you switch to BUILDER in the sidebar. You never explain the `PhysicsCategory` convention again.

### `.github/copilot-instructions.md` as Global Context

For context that applies to every agent role, `.github/copilot-instructions.md` is the right home. For a SpriteKit game project, useful global entries include:

```markdown
## Project Context
- iOS/iPadOS endless runner, Swift 6.0, minimum deployment iOS 17
- SpriteKit scene hierarchy: GameScene > WorldNode > PlayerNode, ObstacleLayer, BackgroundLayer
- GameplayKit: entity-component for player, GKStateMachine for player state
- All physics constants live in Sources/Physics/PhysicsCategory.swift — never hardcode bitmasks

## Automation Default
- Prefer xcodebuild over Xcode GUI for build verification
- Simulator launch: `xcrun simctl launch booted <bundle-id>`
```

This file is read by every agent, every session, automatically. It is the highest-ROI config investment in an AI-native game project.

### Triggering the Coding Agent from an Issue

The coding agent activates when you assign a GitHub Issue to the Copilot bot, or when you use the VS Code sidebar to delegate an issue directly. The agent reads:

1. The issue title and body
2. Your acceptance criteria
3. The full `.github/copilot-instructions.md`
4. Referenced files (link them explicitly in the issue body with full paths)

The practical lesson: **write issues for machines, not humans.** A good coding agent issue is:

```
Title: Add GKStateMachine for player movement states

## Goal
Wire a GKStateMachine to the Player entity with three states.

## Acceptance Criteria
- [ ] PlayerIdleState: removes all actions, plays idle texture frame
- [ ] PlayerRunState: runs the existing `playerRun` SKAction sequence
- [ ] PlayerJumpState: applies a vertical impulse via physicsBody, transitions to Idle on landing
- [ ] isValidNextState enforces: Idle ↔ Run ↔ Jump (no Jump → Jump)
- [ ] Unit test: assert each transition is valid/invalid per the above rules

## Reference files
- Sources/Player/PlayerNode.swift
- Sources/Physics/PhysicsCategory.swift
```

A coding agent handed this issue produces a reviewable PR. A coding agent handed "make a state machine for the player" produces a guess.

---

## AI-Native Workflow Applied to SpriteKit / GameplayKit

### 4a. Scaffolding a Scene

The `GameScene.swift` file in a SpriteKit game is where accidental complexity accumulates fastest. Agents are good at scaffolding the structure; humans must own the physics and timing constants.

A useful pattern: ask the agent (via `@workspace` chat or a coding agent issue) to generate the scene skeleton from your node hierarchy spec, then manually fill in the constants. The agent drafts:

```swift
// GameScene.swift — agent-drafted skeleton; human fills physics constants and delta-time tracking
import SpriteKit
import GameplayKit

final class GameScene: SKScene {

    // MARK: - Nodes
    private let worldNode = SKNode()
    private var playerNode: PlayerNode!
    private var obstacleLayer: ObstacleLayer!
    private var backgroundLayer: BackgroundLayer!

    // MARK: - Systems
    private var entityManager: EntityManager!
    private var stateMachine: GKStateMachine!

    // MARK: - Timing
    private var lastUpdateTime: TimeInterval = 0

    // MARK: - Lifecycle
    override func didMove(to view: SKView) {
        setupPhysics()
        setupNodes()
        setupSystems()
    }

    private func setupPhysics() {
        physicsWorld.gravity = CGVector(dx: 0, dy: -9.8)  // ← human reviews this value
        physicsWorld.contactDelegate = self
    }

    private func setupNodes() {
        addChild(worldNode)
        playerNode = PlayerNode()
        playerNode.position = CGPoint(x: frame.midX * 0.3, y: frame.midY)
        worldNode.addChild(playerNode)
    }

    private func setupSystems() {
        entityManager = EntityManager(scene: self)
        stateMachine = PlayerStateMachine(player: playerNode)
        stateMachine.enter(PlayerIdleState.self)
    }

    // Note: currentTime is absolute elapsed time, not per-frame delta.
    // Compute deltaTime manually and guard against spikes on the first frame.
    override func update(_ currentTime: TimeInterval) {
        let deltaTime = lastUpdateTime == 0 ? 0 : currentTime - lastUpdateTime
        lastUpdateTime = currentTime

        entityManager.update(deltaTime: deltaTime)
        stateMachine.update(deltaTime: deltaTime)
    }
}

extension GameScene: SKPhysicsContactDelegate {
    func didBegin(_ contact: SKPhysicsContact) {
        // collision handling — see PhysicsCategory.swift
    }
}
```

The scaffold is accurate boilerplate. The gravity constant, the player spawn position, and the collision logic are judgment calls that belong to you.

### 4b. State Machines with GKStateMachine

`GKStateMachine` is an ideal agent target: it's deterministic, its pattern is rigid, and the boilerplate-to-logic ratio is high. The agent can reliably draft the states; the transition logic is where you exercise judgment.

Provide acceptance criteria first, then let the agent draft:

```swift
// PlayerStateMachine.swift — agent-drafted, human-reviewed transitions
import SpriteKit
import GameplayKit

final class PlayerStateMachine: GKStateMachine {
    init(player: PlayerNode) {
        super.init(states: [
            PlayerIdleState(player: player),
            PlayerRunState(player: player),
            PlayerJumpState(player: player)
        ])
    }
}

final class PlayerIdleState: GKState {
    private let player: PlayerNode

    init(player: PlayerNode) {
        self.player = player
        super.init()
    }

    override func isValidNextState(_ stateClass: AnyClass) -> Bool {
        return stateClass == PlayerRunState.self || stateClass == PlayerJumpState.self
    }

    override func didEnter(from previousState: GKState?) {
        player.removeAllActions()
        player.texture = SKTexture(imageNamed: "player_idle")
    }
}

final class PlayerRunState: GKState {
    private let player: PlayerNode

    init(player: PlayerNode) {
        self.player = player
        super.init()
    }

    override func isValidNextState(_ stateClass: AnyClass) -> Bool {
        return stateClass == PlayerIdleState.self || stateClass == PlayerJumpState.self
    }

    override func didEnter(from previousState: GKState?) {
        let runFrames = (0..<8).map { SKTexture(imageNamed: "player_run_\($0)") }
        let runAction = SKAction.repeatForever(
            SKAction.animate(with: runFrames, timePerFrame: 0.08)
        )
        player.run(runAction, withKey: "playerRun")
    }

    override func willExit(to nextState: GKState) {
        player.removeAction(forKey: "playerRun")
    }
}

final class PlayerJumpState: GKState {
    private let player: PlayerNode

    init(player: PlayerNode) {
        self.player = player
        super.init()
    }

    override func isValidNextState(_ stateClass: AnyClass) -> Bool {
        return stateClass == PlayerIdleState.self || stateClass == PlayerRunState.self
    }

    override func didEnter(from previousState: GKState?) {
        player.physicsBody?.applyImpulse(CGVector(dx: 0, dy: 420)) // ← tune in Simulator
    }

    // Wire this from GameScene.didBegin(_:) when player contacts the ground:
    // guard let jumpState = stateMachine.currentState as? PlayerJumpState else { return }
    // jumpState.landed()
    func landed() {
        stateMachine?.enter(PlayerRunState.self)
    }
}
```

The agent drafts this in under a minute from a well-scoped issue. You review the `isValidNextState` chains and the impulse value — the two places human judgment actually matters.

### 4c. Component Systems with GKComponent / GKEntity

GameplayKit's entity-component system is another high-boilerplate, low-logic zone well-suited to agent drafting. The pattern: spec the component's responsibility in a sentence, let the agent produce the shell, fill in domain logic yourself.

```swift
// HealthComponent.swift — agent-drafted shell
import GameplayKit

final class HealthComponent: GKComponent {
    private(set) var current: Int
    let maximum: Int

    init(maximum: Int) {
        self.maximum = maximum
        self.current = maximum
        super.init()
    }

    required init?(coder: NSCoder) { fatalError("NSCoder not supported") }

    func apply(damage amount: Int) {
        current = max(0, current - amount)
        if current == 0 {
            // Requires: extension Notification.Name { static let playerDied = Notification.Name("playerDied") }
            NotificationCenter.default.post(name: .playerDied, object: entity)
        }
    }

    func restore(amount: Int) {
        current = min(maximum, current + amount)
    }

    var isDead: Bool { current == 0 }
}

// MovementComponent.swift — agent-drafted shell
final class MovementComponent: GKComponent {
    var speed: CGFloat
    var isGrounded: Bool = false

    init(speed: CGFloat) {
        self.speed = speed
        super.init()
    }

    required init?(coder: NSCoder) { fatalError("NSCoder not supported") }

    override func update(deltaTime seconds: TimeInterval) {
        guard let spriteComponent = entity?.component(ofType: SpriteComponent.self) else { return }
        spriteComponent.node.position.x += speed * CGFloat(seconds)
    }
}
```

The `Notification.Name.playerDied` wire-up, the `speed` default value, and the update logic inside `MovementComponent` are judgment calls. The agent correctly identifies the pattern; you own the behavior.

### 4d. Physics and Collision Detection

This is the one area where agent output requires the most skeptical review. `categoryBitMask`, `contactTestBitMask`, and `collisionBitMask` are a system where one wrong bit flip produces confusing, silent bugs. Agents hallucinate plausible-looking but incorrect mask configurations regularly.

The reliable pattern:

```swift
// PhysicsCategory.swift — write this yourself; never let an agent invent bitmasks
import SpriteKit

struct PhysicsCategory {
    // Assign powers of 2 manually; add new categories at the bottom only
    static let none:        UInt32 = 0
    static let player:      UInt32 = 0b00000001  // 1
    static let ground:      UInt32 = 0b00000010  // 2
    static let obstacle:    UInt32 = 0b00000100  // 4
    static let collectible: UInt32 = 0b00001000  // 8
    static let boundary:    UInt32 = 0b00010000  // 16
}
```

```swift
// In PlayerNode — agent may draft this, but you verify each mask against PhysicsCategory
func configurePhysics() {
    let body = SKPhysicsBody(rectangleOf: CGSize(width: 44, height: 60))
    body.categoryBitMask    = PhysicsCategory.player
    body.contactTestBitMask = PhysicsCategory.obstacle | PhysicsCategory.collectible
    body.collisionBitMask   = PhysicsCategory.ground | PhysicsCategory.boundary
    body.allowsRotation     = false
    body.restitution        = 0
    physicsBody = body
}
```

> **⚠ Guard:** Always verify physics mask configuration in the Simulator before merging any agent-produced `physicsBody` setup. Run through each contact scenario manually: player–ground, player–obstacle, player–collectible. A REVIEWER pass on this code should specifically check that `contactTestBitMask` includes every category that should trigger `didBegin(_:)`.

---

## Best Practices

### Habit 1 — Spec Before Prompt

The most common mistake in AI-native game development is typing a freeform prompt at an agent before writing acceptance criteria. The agent produces something. It's probably not what you needed. You iterate in chat. An hour later you have working code and no clear boundary for what it was supposed to do.

The fix is the issue-first discipline: before touching any agent tool, file a GitHub Issue with:
- One-sentence goal
- Three to five acceptance criteria as checkboxes
- Reference files by path

This is not bureaucracy. It is the spec that the coding agent will use to evaluate its own work — and that you will use to evaluate the diff.

### Habit 2 — Scope Gate Every Agent Task

A coding agent handed a large, multi-concern issue will expand scope in ways you won't catch until code review. The rule: **one issue, one agent task, one PR.** If the issue description uses the word "and" to connect two independent concerns, split it.

For SpriteKit work, this means resisting the temptation to bundle: "Add the parallax background **and** wire the obstacle spawner **and** add coin collection." Three issues. Three PRs. Three reviewable diffs.

### Habit 3 — Use Agent Profiles, Not Raw Chat

Every time you describe your `PhysicsCategory` struct in a raw Copilot Chat prompt, you're paying a per-session context tax. The same context injected once into a `.github/agents/builder.agent.md` profile is available to every future BUILDER session for free.

**Raw chat prompt for a SpriteKit task:**
> "In my SpriteKit game using Swift 6, where PhysicsCategory is a struct with static UInt32 constants, and states are named [Noun][Verb]State pattern, please add a new GroundedState to the player state machine that..."

**With a profile loaded:**
> "Add a GroundedState to the player state machine per the existing [Noun][Verb]State pattern."

The profile carries the rest. Invest thirty minutes in your profiles once; recover it on every subsequent session.

### Habit 4 — Gate at Merge, Not During

When the coding agent is running autonomously on its remote branch, resist the urge to interrupt it with corrections mid-run. The agent is working in isolation; interruptions introduce inconsistency. Instead:

1. Write a tight issue (Habit 1)
2. Delegate to the coding agent
3. Work on something else
4. Review the PR diff when it arrives
5. Gate at merge — approve or request changes on the diff

This is the highest-leverage pattern for boilerplate work. An agent that drafts a `ParallaxScrollNode.swift` while you're writing a level design doc costs you zero additional time. Interrupting it mid-task costs you the benefits of autonomy.

### Habit 5 — Keep a REVIEWER Role for QA

The coding agent and `@workspace` chat are BUILDER-role tools. They produce. They do not independently evaluate. A separate REVIEWER pass — either a Copilot agent with a `reviewer.agent.md` profile or a manual review with specific checklists — catches what BUILDER misses.

For SpriteKit work, a REVIEWER checklist should include:

- `removeFromParent()` called on all temporary nodes (especially obstacle nodes as they scroll off-screen)
- No orphan `SKAction` sequences running on removed nodes
- Texture atlas memory: `SKTextureAtlas.preloadTextureAtlases(_:)` called once, not per-scene
- Physics mask configuration verified against `PhysicsCategory.swift`
- No raw integer bitmasks inline (all must reference `PhysicsCategory` constants)

You can encode this checklist directly into `reviewer.agent.md` so the REVIEWER agent knows what to look for.

### Habit 6 — Context Files Over Repeated Re-injection

The agent context hierarchy, from highest to lowest ROI:

1. `.github/copilot-instructions.md` — global, read by every agent, every session
2. `.github/agents/<role>.agent.md` — role-scoped, loaded when you select that agent
3. Issue body with referenced file paths — task-scoped, read by the coding agent for one issue
4. In-chat context (`#file` and `#selection` — VS Code Copilot Chat syntax for attaching a specific file or selected code to a prompt) — session-scoped, manual, non-persistent

Front-load your stack conventions, naming rules, and architectural decisions into levels 1 and 2. Reserve levels 3 and 4 for task-specific detail. The goal: a new agent session should need zero manual context injection before producing useful output.

---

## Anti-Patterns to Drop

### 1. Using Chat for Tasks That Need a Spec

**Problem:** `"Build me a coin collection system"` lands in a raw chat prompt. The agent makes decisions — what triggers a collect, how the score increments, what the visual feedback is — that you didn't specify. You inherit those decisions by accepting the code.

**Fix:** File a GitHub Issue first. If the task takes more than one round-trip in chat to describe, it needs a spec.

### 2. Accepting Agent-Generated Physics Masks Without Verification

**Problem:** The agent produces a `physicsBody` configuration that looks correct because the variable names are right. You merge it. In the Simulator, player–obstacle contacts fire twice, or not at all.

**Fix:** Every merged `physicsBody` configuration gets a manual Simulator run through each contact scenario before it ships. No exceptions.

### 3. Running BUILDER and REVIEWER in the Same Context Window

**Problem:** You ask `@workspace` to write a `GroundedState` implementation, then in the same chat turn ask "is this implementation correct?" The same agent that produced it evaluates it — anchored to its own prior output and unable to approach it fresh. It will not reliably catch its own errors.

**Fix:** Review work in a fresh agent session, or use a separate `reviewer.agent.md` profile. The evaluator must not share context with the builder.

### 4. No Acceptance Criteria = No Ship Signal

**Problem:** You know a feature is done when it "feels right." The agent has no signal for done. It will either under-deliver (missing edge cases you didn't specify) or over-deliver (adding scope you didn't ask for).

**Fix:** Every coding agent issue has at least three checkboxed acceptance criteria. The PR is reviewable only when each checkbox maps to a specific, testable behaviour.

### 5. Letting Agents Refactor Outside Scope

**Problem:** You ask for a `JumpState` and the agent helpfully refactors the entire `PlayerStateMachine` file, renames some constants, and "improves" the `HealthComponent` it happened to read. The diff is now large and reviewing it takes longer than writing the feature manually.

**Fix:** BUILDER agent profiles must include an explicit constraint: "Do not refactor outside the scope of the issue. Touch only the files required by the acceptance criteria." Enforce this at code review — any file change not in the AC scope is a rollback.

---

## End-to-End Example: Parallax Scrolling Background

Here's a complete walkthrough from idea to merged PR for a specific, bounded feature.

**The idea:** add a two-layer parallax scrolling background to the game scene. The far layer scrolls at 0.3× game speed; the near layer at 0.7×.

**Step 1 — PLANNER: write the issue**

```
Title: Add two-layer parallax scrolling background

## Goal
Replace the static background with a seamlessly looping two-layer parallax effect.

## Acceptance Criteria
- [ ] ParallaxScrollNode.swift: two SKSpriteNode tiles per layer, seamless horizontal loop
- [ ] Far layer scrollSpeed = worldSpeed * 0.3; near layer scrollSpeed = worldSpeed * 0.7
- [ ] Layers added to BackgroundLayer node in GameScene, below all gameplay nodes (zPosition < 0)
- [ ] update(deltaTime:) called each frame from GameScene.update(_:)
- [ ] No texture seam visible at tile boundary on iPhone 15 Pro Simulator

## Reference files
- Sources/Scene/GameScene.swift
- Sources/Background/BackgroundLayer.swift (create if absent)
- Assets/Textures/ (sky.png and hills.png exist)
```

**Step 2 — BUILDER: coding agent drafts the implementation**

The coding agent reads the issue, creates a branch in a remote execution environment, and produces:

```swift
// ParallaxScrollNode.swift — agent-drafted, human-reviewed scroll math
import SpriteKit

final class ParallaxScrollNode: SKNode {
    private let scrollSpeed: CGFloat
    private var tiles: [SKSpriteNode] = []
    private let tileWidth: CGFloat

    init(texture: SKTexture, scrollSpeed: CGFloat, sceneSize: CGSize) {
        self.scrollSpeed = scrollSpeed
        self.tileWidth = sceneSize.width

        super.init()

        // Two tiles for seamless looping — tile[1] starts immediately right of tile[0]
        for i in 0..<2 {
            let tile = SKSpriteNode(texture: texture)
            tile.anchorPoint = CGPoint(x: 0, y: 0.5)
            tile.position = CGPoint(x: CGFloat(i) * tileWidth, y: 0)
            tile.size = CGSize(width: tileWidth, height: sceneSize.height)
            addChild(tile)
            tiles.append(tile)
        }
    }

    required init?(coder: NSCoder) { fatalError("NSCoder not supported") }

    func update(deltaTime: TimeInterval) {
        let dx = scrollSpeed * CGFloat(deltaTime)
        for tile in tiles {
            tile.position.x -= dx
        }
        // Recycle: if the first tile has fully scrolled off-screen, move it to the back
        if let first = tiles.first, first.position.x + tileWidth < 0 {
            first.position.x = tiles[1].position.x + tileWidth
            tiles.append(tiles.removeFirst())
        }
    }
}
```

```swift
// BackgroundLayer.swift — agent-drafted
import SpriteKit

final class BackgroundLayer: SKNode {
    private var farLayer: ParallaxScrollNode!
    private var nearLayer: ParallaxScrollNode!

    func setup(sceneSize: CGSize, worldSpeed: CGFloat) {
        let skyTexture = SKTexture(imageNamed: "sky")
        let hillsTexture = SKTexture(imageNamed: "hills")

        farLayer = ParallaxScrollNode(
            texture: skyTexture,
            scrollSpeed: worldSpeed * 0.3,
            sceneSize: sceneSize
        )
        farLayer.zPosition = -20

        nearLayer = ParallaxScrollNode(
            texture: hillsTexture,
            scrollSpeed: worldSpeed * 0.7,
            sceneSize: sceneSize
        )
        nearLayer.zPosition = -10

        addChild(farLayer)
        addChild(nearLayer)
    }

    func update(deltaTime: TimeInterval) {
        farLayer.update(deltaTime: deltaTime)
        nearLayer.update(deltaTime: deltaTime)
    }
}
```

**Step 3 — REVIEWER: diff review and QA**

A REVIEWER pass on this diff checks:

- `removeFromParent()` hygiene: `ParallaxScrollNode` is a persistent node, not spawned/despawned — acceptable
- Texture load: `SKTexture(imageNamed:)` is called twice in `setup()`. For a background that exists for the scene lifetime, this is fine; for frequently spawned nodes it would warrant `SKTextureAtlas`
- The tile recycling logic: verify the boundary condition `first.position.x + tileWidth < 0` covers the case where `scrollSpeed` is very high (fast-forward on iPad Pro). It does.
- Simulator QA: launch on iPhone 15 Pro Simulator at 60 fps, scroll for 30 seconds, confirm no visible seam

All ACs pass. REVIEWER recommends **Ship**.

**Step 4 — Merge**

PR merged. Issue auto-closed via `Closes #N` in the PR body.

Total elapsed: filing the issue took four minutes. The agent produced the draft while you did something else. The review took ten minutes. The only context switches were writing the issue and reviewing the diff — both are decisions only a human should make.

---

## What to Try Today

The habits above are not theoretical — each installs in under ten minutes.

- **Prove the coding agent now:** file a GitHub Issue on your iOS project with three ACs, assign it to Copilot, and watch the branch and PR appear. You don't need to change your workflow; just observe the output on one bounded task.
- **Install a BUILDER profile:** create `.github/agents/builder.agent.md` with your Swift version, deployment target, and one naming convention. Switch to it in the VS Code sidebar for your next SpriteKit task and notice what you no longer have to re-explain.
- **Write `PhysicsCategory.swift` today if you don't have it:** this single file eliminates a whole class of agent errors. Every physics body in your project references it; no inline integers anywhere.
- **Apply Habit 3 to your next state machine:** write the issue first — states, transitions, and one unit test AC — then hand it to the agent. Compare the diff quality against a freeform prompt result.
- **Add the REVIEWER checklist to a profile:** five bullet points covering `removeFromParent()`, texture atlas usage, and physics mask verification. Encode it once; get consistent QA on every SpriteKit PR.

The agent-native approach to iOS game development is not about removing human judgment from the loop. It is about routing judgment to exactly the places it adds value — transition logic, physics constants, acceptance criteria, and merge decisions — and removing the mechanical scaffolding work that consumes the rest of your attention.

The context-switch tax is a choice. You can stop paying it.
