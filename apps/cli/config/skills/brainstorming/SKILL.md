---
name: brainstorming
description: Use before building anything whose shape is not settled — a new feature, a component, a change to how something behaves — and when a request could reasonably be built three different ways. Explores the options in a subagent so the exploration does not fill this conversation, and returns a recommendation.
---

# Brainstorm in a subagent, decide here

Exploring options is expensive in exactly the wrong currency: it fills the conversation with paths not taken, and the reasoning that led somewhere is then buried under the reasoning that led nowhere. So the exploring happens in a **subagent**, and what comes back is a short comparison you and the user can act on.

## When this applies

The shape is unsettled: a feature with more than one plausible design, a UI that could sit in three places, a data model that depends on a question nobody has asked yet. If the task has one obvious implementation, skip this — a brainstorm about a settled question is theatre.

## How

Call the `subagent` tool with a prompt that carries three things:

1. **The problem, in the user's terms** — not your first guess at a solution. A subagent told the answer will find reasons for it.
2. **The constraints that are real** — what already exists, what must not change, what the deployment cannot do. Constraints are what make options comparable; without them every option looks fine.
3. **What to bring back**: two to four distinct approaches, each with what it costs and what it forecloses, and a recommendation with its reason.

Ask it to look at what the codebase already does before proposing anything. An approach that contradicts a pattern already in use has a price the proposal must name.

## What to do with the answer

Do not paste it. Read it, and give the user **the recommendation and the one or two live trade-offs**, in a few lines. If two options are genuinely close, say what would decide between them — usually a fact only the user has.

Then ask before building, unless the user already said to proceed. A brainstorm that slides straight into an implementation has skipped the step it existed for.

## What this is not

Not a substitute for reading the code: an option list built from guesses is worse than no list. Not a way to defer a decision either — the point is to reach one faster, with the paths not taken left in the subagent's transcript rather than in this one.
