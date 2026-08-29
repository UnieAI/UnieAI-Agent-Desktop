# Agent Note: four steps before the first sentence

Status: implemented

English | [中文](2026-08-29-four-steps-before-the-first-sentence.zh.md)

## Problem

The shell assumed someone who had used a program like this before. The first screen asked for a "workspace". The composer offered an "access mode" whose options were machine names (`workspace-write`). Nothing said what the agent would do with the folder it was given, or that it could be pointed at another computer at all. For the person this product is now for, that is four unfamiliar decisions before the first sentence — and every one of them is a place to close the window.

The words were half of it and are fixed separately. The other half is that nobody had ever been shown what this program *does*.

## Decision

**Four steps, once, and skippable from the first frame.** Not a feature list: the four things a person has to do in the first minute, in the order they meet them — pick a folder, ask for something in ordinary words, look at what it wants to change before it changes it, and only then that it can run somewhere else.

The fourth is last deliberately. Remote machines are the most interesting thing this product does and the least urgent thing a new person needs; earlier, it would teach the wrong lesson about what this is for.

**Scenes, not icons.** Each step is a small mock of the real interface with a cursor that performs the action. An icon says a feature exists; this has to show someone what to *do*, and a pointer moving to a button that then responds is the shortest way to say "press that". The pattern is copilot-v2's `first-run-scenes.tsx`, which reached the same conclusion — "the tutorial should show HOW to use the feature instead of an abstract icon" — drawn here in this product's own tokens rather than that one's.

**Pure CSS on a shared six-second cycle.** copilot-v2 uses `motion/react` because that application already carries it; adding an animation runtime to this desktop bundle to move eight boxes would be paid for by everyone who never opens the tour, and a stylesheet expresses "opacity and transform at these times" directly. `prefers-reduced-motion` stops all of it and leaves each scene readable as its final frame.

**Closing is the component's own answer; the setting is what stops it coming back.** The write is a round trip that may not settle at all where preferences are held in memory, and a dialog waiting for storage to agree would look like a control that does not work. While the answer is still arriving the tour stays hidden, because `loading` is not `not seen` and re-showing a dismissed tour on every launch is worse than showing it a moment late. Where preferences cannot be kept at all it is shown, because a fresh install is exactly who it is for.

## Alternatives considered

**Tooltips or coach-marks over the real interface.** They point at the actual thing, which is their advantage, and they need the interface to hold still: every one is a selector into another package's markup, and nothing fails when that markup moves. The mocks go stale silently too, but they go stale in one file that is obviously a drawing.

**A video or a GIF.** Heavier to ship, impossible to localize without re-recording, and it cannot respect `prefers-reduced-motion`.

**Show it on every launch until something is done.** It would reach the people who skipped without reading, and it would also punish everybody who understood the first time.

**Do nothing and fix the words only.** The vocabulary change is real and shipped, but no wording on an empty screen answers "what is this program for".

## Consequences

A new person is told what the product does before they are asked to decide anything. The cost is a surface that describes another surface: the mocks are drawings, so a change to the composer or the workspace picker leaves them describing something that no longer looks like that, and no test goes red when it happens.

There is also no way back to it. Once dismissed, nothing in the product offers to show it again — a person who wants it has to clear the setting by hand.

## Verification

Driven end to end in a real browser against a running `rabi web`: the tour opens on a fresh profile, all four steps render and navigate, finishing closes it, and after a reload it stays closed — with `first-run: seen: true` written to the settings document.

Two rules are unit-tested, and the mutation of the first turns it red: the position derivation clamps rather than reading past either end, and the sequence is the four scenes in that order with no scene used twice.

The namespace's own naming rule caught a real error during that verification: `firstRun` was refused by the settings service (`must match /^[a-z][a-z0-9-]*$/`) and the refusal was swallowed by the registration callback, leaving a tour that reappeared on every launch with nothing logged. It is `first-run`.
