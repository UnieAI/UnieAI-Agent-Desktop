---
name: find-skill
description: Use when you suspect a skill exists for the task at hand but do not know its name, when a request mentions a workflow this deployment might already have written down, or before inventing a procedure that someone may have already captured. Also use when asked what skills are available.
---

# Find the skill before writing the procedure

A skill that exists and is not used is worse than no skill: the work gets done a second way, and the two answers drift. This skill is the habit of looking first.

## Look

Call the `skill` tool with no name to list what this deployment carries. The catalog is merged from several roots — the ones shipped with the app, the ones this project carries, and the user's own — so it differs per machine and per project. **Read the list rather than assuming**; a name you remember from another checkout may not be here, and one you have never seen may be.

Match on what the description says the skill is FOR, not on its title. A title compresses; the description is where the trigger lives.

## Judge

Load a skill when the task is the one it names. Do not load three to see which fits — each one costs context, and a skill loaded "just in case" competes with the instructions that actually apply.

If two look plausible, prefer the more specific one. If nothing matches, say so and proceed with the task directly; announcing that no skill applies is a real answer, and it is what stops the next reader from searching again.

## After

When you finish a task that had no skill and clearly should have one — a procedure with traps, an order of steps that matters, a thing you had to discover — say so at the end and offer to write it. `skill-creator` is the skill for that.
