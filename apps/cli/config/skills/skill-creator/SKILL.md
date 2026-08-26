---
name: skill-creator
description: Use when writing a new skill or repairing an existing one — when a procedure has traps worth recording, when the same correction has been given twice, or when the user asks to capture how something is done. Covers where a skill lives, what its frontmatter must say, and what belongs in the body.
---

# Writing a skill

A skill is a procedure someone will follow without you there. It earns its place when the task has an order that matters, a trap that is not obvious, or a decision that people get wrong the same way twice.

## Where it goes

Three roots, in the order the catalog reads them:

- **Project** — `.agents/skills/<name>/SKILL.md` in the repository being worked on. For anything specific to that codebase.
- **User** — the user's own skill directory. For personal habits across projects.
- **Bundled** — shipped with the application. For skills every install should have; this one lives there.

Put it where its *audience* is. A skill about one repository's release process in the user root will follow someone into a project where it is wrong.

## The frontmatter is the whole discovery mechanism

```markdown
---
name: kebab-case-name
description: Use when …
---
```

`name` must match the directory. `description` is the only thing a model reads before deciding to load the skill, so write it as **triggers, not a summary**: the situations in which it should be opened, in the words someone would use while in them. "Use when a release fails to publish and the job exited 0" finds itself; "Release tooling documentation" does not.

## What belongs in the body

Write for the person mid-task, not for someone browsing.

- **The order that matters**, and why it matters — an order with no reason gets rearranged.
- **The traps**, each with the symptom that reveals it. A trap without its symptom cannot be recognised in time.
- **What "done" looks like**, concretely enough to check.

Leave out what the code, the CLI's own help, or a good error message already says. A skill that restates the obvious teaches readers to skim the parts that were not obvious.

Prefer one worked example to three abstract rules. If the skill needs a script to be useful, put the script beside `SKILL.md` and say what its exit codes mean.

## Before you call it finished

Read it as someone who has not done the task. Can they follow it without asking you a question you did not answer? If a step says "configure appropriately", that step is not written yet.

Test the trigger too: if you had this description in a list of twenty, would you open it for the task it is for?
