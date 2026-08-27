# machines/ — where work happens

English | [中文](README.zh.md)

A person's work happens somewhere: on this computer, or on a machine they can already reach. This group makes that a choice rather than a composition decision made at boot.

| Package | ctx key | Role |
|---|---|---|
| [`machines`](machines/README.md) (`@unieai/uad-machines`) | `ctx.machines` | The machines a person can pick, and the one they are working on now |
| [`execution-router`](execution-router/README.md) (`@unieai/uad-execution-router`) | `ctx.fs`, `ctx.subprocess` | One execution world per machine, with every call routed to the right one |

The two providers must be mounted together: `ctx.fs` and `ctx.subprocess` define one execution world, and routing them to different machines would break that in a way no consumer above the seams could detect. The [portable execution-world decision](../../.agents/notes/implemented/architecture/2026-07-28-portable-execution-world-consumers.md) owns why every capability above them stays provider-neutral.
