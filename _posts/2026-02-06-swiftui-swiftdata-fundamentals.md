---
layout: post
title: "SwiftUI and SwiftData Fundamentals for Building iOS Apps"
date: 2026-02-06 00:00:00 +0000
description: "The state-management stack for a modern iOS app: SwiftUI with @Observable, SwiftData for persistence, and why iOS 17+ is the sensible deployment target."
tags: [swiftui, swiftdata, swift, ios, app-development, persistence]
---

# SwiftUI and SwiftData Fundamentals for Building iOS Apps

If you're building an iOS app today and you don't have a strong reason to do otherwise, the default stack is SwiftUI for the UI and SwiftData for on-device persistence. This post covers the fundamentals of that stack — how state flows through a SwiftUI view tree, how Observation replaces the older `ObservableObject`/`@Published` pattern, and how SwiftData models, queries, and containers fit together. Everything here targets iOS 17 and later, which is also the deployment target I'd recommend for new indie apps (more on why at the end).

## SwiftUI: views are a function of state

The core SwiftUI idea: the view tree is a function of state. When state changes, the framework re-renders the affected views. Your job is to declare the state and the views that depend on it; SwiftUI handles the diffing and updates.

The state-holding property wrappers differ by who owns the state and how long it should live:

- **`@State`** — value-type state owned by the view itself. Used for transient UI state (toggle positions, text field content, selection). The storage lives with the view's identity.
- **`@Binding`** — a reference to a `@State` owned elsewhere, passed down. Lets a child view read and write a parent's state without owning it.
- **`@Environment`** — values injected into the view hierarchy (system things like `\.colorScheme`, `\.dismiss`, or your own environment values). Lets a deeply-nested view access a shared resource without threading it through every initializer.

The older pattern for shared mutable reference types was `ObservableObject` + `@Published` + `@ObservedObject`/`@EnvironmentObject`. It still works, but for new code the Observation framework is the better default (next section).

## Observation: `@Observable` (iOS 17+)

The Observation framework (iOS 17+) introduces the `@Observable` macro. Instead of annotating each property with `@Published` and the whole type with `ObservableObject`, you mark the type `@Observable` and the framework tracks access to its stored properties automatically. Views that read a property subscribe to just that property's changes — finer-grained re-rendering than `ObservableObject`, which re-rendered the whole view on any `@Published` change.

A minimal model:

```swift
import Observation

@Observable
final class CounterModel {
    var count: Int = 0
    var label: String = "Counter"

    func increment() { count += 1 }
}
```

A view using it:

```swift
import SwiftUI

struct CounterView: View {
    let model: CounterModel

    var body: some View {
        VStack {
            Text("\(model.count)")          // subscribes to count
            Text(model.label)                // subscribes to label
            Button("Increment") { model.increment() }
        }
    }
}
```

The `@Observable` macro generates the access-tracking that SwiftUI uses to decide which views to invalidate. You pass an instance of the model in (typically as a plain property or via `@Environment`), and the view re-renders only when the specific properties it read change.

## SwiftData: persistence without Core Data's boilerplate

SwiftData (iOS 17+) is Apple's persistence framework built on top of the same SQLite storage Core Data uses, but with a much smaller surface area. You model your data as Swift classes annotated with `@Model`; SwiftData generates the schema and storage.

The three pieces:

1. **`@Model`** — annotate a class to make it a persisted model. Its stored properties become persisted attributes (including relationships to other `@Model` types).

   ```swift
   import SwiftData

   @Model
   final class Task {
       var title: String
       var done: Bool
       var createdAt: Date

       init(title: String, done: Bool = false, createdAt: Date = .now) {
           self.title = title
           self.done = done
           self.createdAt = createdAt
       }
   }
   ```

2. **`ModelContainer`** — the database. You create one for your app, typically in the App struct, and inject it into the view hierarchy via `.modelContainer(for: Task.self)`.

   ```swift
   import SwiftUI
   import SwiftData

   @main
   struct MyApp: App {
       var body: some Scene {
           WindowGroup {
               ContentView()
           }
           .modelContainer(for: Task.self)
       }
   }
   ```

3. **`@Query`** — a property wrapper that fetches models from the container and keeps the view updated as the data changes. It's the SwiftUI-friendly way to read SwiftData.

   ```swift
   struct ContentView: View {
       @Query(sort: \Task.createdAt, order: .reverse) private var tasks: [Task]
       @Environment(\.modelContext) private var context

       var body: some View {
           List {
               ForEach(tasks) { task in
                   Text(task.title)
               }
           }
           .toolbar {
               Button("Add") {
                   context.insert(Task(title: "New task"))
               }
           }
       }
   }
   ```

`@Environment(\.modelContext)` gives you the `ModelContext` for inserts, deletes, and saves. Inserts/deletes through the context are reflected back into `@Query` automatically — that's the live-data property that makes SwiftData feel like a single stack rather than a database plus a separate UI layer.

## SwiftData vs Core Data

SwiftData is not a replacement that supersedes Core Data in every dimension — Core Data is older, has a larger API surface, supports some advanced features (cross-store configurations, more granular migration control) that SwiftData doesn't expose yet. The practical guidance:

- **New app, no existing schema, iOS 17+ target** — SwiftData. Smaller surface, less boilerplate, integrates directly with SwiftUI via `@Query`.
- **Existing Core Data stack, or pre-iOS 17 target** — keep Core Data. Don't rewrite a working persistence layer to chase a newer API.
- **Heavy migration needs** — Core Data's custom migration tooling is more mature; verify SwiftData's migration support covers your case before committing.

The honest position: SwiftData is the default for *new* greenfield apps on iOS 17+, not a forced migration for everything.

## Why iOS 17+ as the deployment target

For an indie app shipping today, I'd set the deployment target to iOS 17. The reasons:

- **Distribution reach.** iOS 17 covers the large majority of active devices. Apple's published device-availability data (the App Store distribution dashboard in App Store Connect) shows iOS 17+ adoption is high; the marginal reach of dropping to iOS 16 is small and shrinking.
- **Modern APIs without backporting.** `@Observable`, SwiftData, and a set of SwiftUI refinements shipped in iOS 17. Supporting iOS 16 means either forgoing these or maintaining polyfills (e.g. `ObservableObject` alongside `@Observable`), which doubles the state-management surface for no real gain.
- **Maintenance cost.** Each older OS you support is a matrix of behavior you must verify. For a solo or small team, narrowing that matrix is worth more than the marginal user reach.

The tradeoff is real — you do leave a small slice of users behind. For most indie apps the math favors iOS 17+. For an app with a known older-iOS audience (e.g. an enterprise fleet) the calculus flips; do the distribution check in App Store Connect before locking the target.

## The takeaway

SwiftUI with `@Observable` for state, SwiftData with `@Model` + `ModelContainer` + `@Query` for persistence, iOS 17+ as the deployment target. Views are functions of state; Observation tracks property access to re-render only what changed; SwiftData turns annotated Swift classes into a persisted schema with a SwiftUI-native query layer. That's the modern default stack for a new iOS app.

## Sources & References

- Apple Developer — SwiftUI (declarative UI, state and data flow): https://developer.apple.com/documentation/swiftui
- Apple Developer — State and Data Flow (property wrappers): https://developer.apple.com/documentation/swiftui/managing-user-interface-state
- Apple Developer — Observation (`@Observable`): https://developer.apple.com/documentation/observation
- Apple Developer — SwiftData (`@Model`, `ModelContainer`, `@Query`): https://developer.apple.com/documentation/swiftdata
- Apple Developer — App Store distribution (device availability dashboard): https://developer.apple.com/support/app-store/