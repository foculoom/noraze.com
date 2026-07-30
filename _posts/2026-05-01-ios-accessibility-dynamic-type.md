---
layout: post
title: "iOS Accessibility: VoiceOver and Dynamic Type"
date: 2026-05-01 00:00:00 +0000
description: "Accessibility on iOS is VoiceOver, Dynamic Type, contrast, and focus order. Here is the SwiftUI surface, the VoiceOver concepts, and the things kids/casual apps get wrong."
tags: [ios, accessibility, voiceover, dynamic-type, swiftui, a11y, app-development]
---

# iOS Accessibility: VoiceOver and Dynamic Type

iOS accessibility is not a separate module you bolt on at the end — it's a set of APIs that you use throughout your SwiftUI views, and getting it right early is dramatically cheaper than retrofitting it. The two highest-leverage areas are **VoiceOver** (the screen reader) and **Dynamic Type** (user-controlled font scaling). This post covers both, the SwiftUI surface for them, and the mistakes that are specific to casual and kids apps.

## VoiceOver: the mental model

VoiceOver is the iOS screen reader. A user with VoiceOver on navigates the UI by swiping to move a virtual "focus" between elements and double-tapping to activate. Two consequences:

- **The view tree VoiceOver sees is not your SwiftUI view tree.** VoiceOver reads **accessibility elements**, which SwiftUI derives from your views but which you can collapse, split, or relabel. A `HStack` with an icon, a title, and a subtitle is, by default, three separate elements — but you usually want it read as one ("Incomplete task, buy groceries"). You control this with accessibility modifiers.
- **Every interactive element needs a label, a role/trait, and (often) a hint.** Without a label, VoiceOver reads the button's text — which is fine if the text is self-describing ("Save") and useless if it's an icon. Without a trait, VoiceOver doesn't announce "button" vs "image" vs "header". Without a hint, the user doesn't know what activating does.

## The SwiftUI accessibility surface

The core modifiers you'll use constantly:

```swift
import SwiftUI

struct TaskRow: View {
    let title: String
    let done: Bool
    let onToggle: () -> Void          // parent owns the state change

    var body: some View {
        Button(action: onToggle) {                // a real actionable control
            HStack {
                Image(systemName: done ? "checkmark.circle.fill" : "circle")
                    .accessibilityHidden(true)    // decorative; the row label covers it
                Text(title)
            }
        }
        .buttonStyle(.plain)                      // keep the row looking like a row, not a button
        .accessibilityElement(children: .combine)  // collapse the HStack into one element
        .accessibilityLabel(done ? "Completed: \(title)" : "Task: \(title)")
        .accessibilityAddTraits(done ? [.isButton, .isSelected] : [.isButton, .isToggle])
        .accessibilityHint("Double tap to mark \(done ? "incomplete" : "complete").")
    }
}
```

The patterns in this snippet:

- **`.accessibilityElement(children: .combine)`** — collapses the children of a container into a single accessibility element. This is how you stop VoiceOver from reading "circle, Buy groceries" as two stops and make it read "Task: Buy groceries" as one.
- **`.accessibilityLabel(_)`** — overrides or supplies the text VoiceOver reads. Use this when the on-screen text isn't enough (icons, ambiguous labels, dynamic content).
- **`.accessibilityHidden(true)`** — removes a view from the accessibility tree. Use for purely decorative elements (background shapes, ornamental icons) so VoiceOver doesn't announce them as noise.
- **`.accessibilityAddTraits(_)`** — adds traits (`.isButton`, `.isHeader`, `.isToggle`, `.isImage`, `.isSelected`) that change how VoiceOver announces the element and how the user navigates to it (headers are jump-to targets).
- **`.accessibilityHint(_)`** — the instruction read after the label. "Double tap to …" The hint is for cases where the action isn't obvious from the label.

For custom controls (a draggable handle, a swipe-card, a gesture-only interface), you'll also use `.accessibilityAction(.default, { … })` and the gesture-to-action mappings so a VoiceOver user can perform the action with VoiceOver's standard gestures instead of an inaccessible swipe.

## Dynamic Type

Dynamic Type is iOS's user-controlled text scaling. The user sets a preferred text size in Settings; well-behaved apps scale their text with it. The leverage: a user who needs larger text gets it everywhere consistently, and you get nothing if your app hard-codes font sizes.

Two things to do:

- **Use semantic font methods.** `Font.body`, `Font.headline`, `Font.title`, `Font.caption` — these automatically scale with Dynamic Type. Avoid `.system(size: 14)` (fixed size — does not scale). Where you must size, use `@ScaledMetric` to scale a fixed value with the user's setting.

   ```swift
   struct ScaledBadge: View {
       @ScaledMetric private var badgeSize: CGFloat = 14
       var body: some View {
           Text("New")
               .font(.system(size: badgeSize))   // scales with Dynamic Type
               .padding(.horizontal, 6)
               .background(.tint, in: Capsule())
       }
   }
   ```

- **Let layouts grow.** Use `LineLimit(nil)` and `minimumScaleFactor` carefully — `minimumScaleFactor` shrinks text to fit, which fights Dynamic Type. Prefer layouts that wrap and expand (`fixedSize(horizontal: false, vertical: true)`) so text grows to multiple lines instead of shrinking. Test your layouts at the largest accessibility text size (AX5) — if rows overlap or truncate, the layout is brittle.

The mistake to avoid: building the UI at the default size and shipping. Open Settings → Accessibility → Display & Text Size → Larger Text and drag to the largest setting, then run your app. Everything that breaks is an accessibility bug.

## Contrast and focus order

Two more durable Apple-stated areas:

- **Contrast.** Apple's Human Interface Guidelines recommend meeting WCAG contrast ratios (4.5:1 for normal text, 3:1 for large text). Use the Accessibility Inspector (Xcode → Open Developer Tool → Accessibility Inspector) to measure contrast in your UI; it'll flag sub-threshold pairs.
- **Focus order.** VoiceOver reads elements in a default order derived from the layout — usually top-to-bottom, leading-to-trailing. When you re-order visually (e.g. a z-indexed overlay), the VoiceOver order may not follow. `.accessibilitySortPriority(_)` lets you explicitly set the order when the visual order and the reading order diverge.

## Kids and casual apps: the specific mistakes

A few accessibility mistakes that show up specifically in kids' and casual apps:

- **Tiny touch targets.** Apple's minimum recommended touch target is 44×44 pt. Casual games and kids apps often draw smaller buttons (a 24pt icon button looks "clean") that are unreachable for a child's less-precise tap or a user with motor differences. Always hit 44pt minimum, larger for kids.
- **Gesture-only interfaces with no VoiceOver alternative.** A "swipe up to jump" mechanic is invisible to a VoiceOver user. Add an accessibility action (`.accessibilityAction`) so the same jump is available as a double-tap.
- **Audio-only cues.** A game that signals success/failure by sound alone is unusable for a low-vision user without the sound on and for a deaf user always. Pair audio with a visual (and vice versa).
- **No Dynamic Type support because "it's a game."** Even a game has menus, settings, and text. Those should scale. The gameplay HUD can be sized for the game; the text the user reads at length should not.
- **Color as the only signal.** "Green = go, red = stop" fails colorblind users (and is a common child-app accessibility gap). Pair color with a shape, icon, or label.
- **Over-stimulation for neurodivergent kids.** Auto-animating, flashing, high-contrast motion can be overwhelming. Provide a "reduce motion" path (respect `@Environment(\.accessibilityReduceMotion)`) and a calmer default where possible.

## The Accessibility Inspector

The Accessibility Inspector (bundled with Xcode) is the audit tool. Run it against your app; it walks the accessibility tree, reports missing labels, low-contrast pairs, hit-target violations, and elements that aren't reachable. The inspector won't catch everything (semantic correctness needs a human VoiceOver pass), but it catches the cheap, common violations before you ship.

The discipline: run the Accessibility Inspector before every TestFlight build, and do one full VoiceOver pass (navigate the app with VoiceOver on, eyes closed if you can) before every App Store submission. Both are minutes of work that prevent the most common accessibility rejections and the most common post-launch complaints.

## The takeaway

VoiceOver reads accessibility elements (not your view tree) — collapse with `.accessibilityElement(children: .combine)`, label with `.accessibilityLabel`, trait with `.accessibilityAddTraits`, hint with `.accessibilityHint`. Dynamic Type scales text when you use semantic fonts (`Font.body` etc.) and `@ScaledMetric` — test at the largest size. For kids/casual apps, hit 44pt touch targets, give gestures an accessibility action, pair audio with visual cues, never signal by color alone, and respect reduce-motion. Run the Accessibility Inspector and do a VoiceOver pass before every submission.

## Sources & References

- Apple Developer — Accessibility (concepts, overview): https://developer.apple.com/accessibility/
- Apple Developer — SwiftUI Accessibility (modifiers, accessibility elements): https://developer.apple.com/documentation/swiftui/accessibility
- Apple Developer — VoiceOver (screen reader, navigation): https://developer.apple.com/accessibility/vision/
- Apple Developer — Dynamic Type (font scaling, `@ScaledMetric`): https://developer.apple.com/documentation/uikit/uiapplication/1623048-preferredcontentfontsizecategory
- Apple Developer — Accessibility Inspector (audit tool): https://developer.apple.com/accessibility/inspector/
- Apple Developer — Human Interface Guidelines (touch targets 44pt, contrast ratios): https://developer.apple.com/design/human-interface-guidelines/accessibility