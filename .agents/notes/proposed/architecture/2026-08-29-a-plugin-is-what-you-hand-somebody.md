# Agent Note: a plugin is what you hand somebody

Status: proposed

English | [中文](2026-08-29-a-plugin-is-what-you-hand-somebody.zh.md)

## Problem

This repository already has every piece an extension needs, and no name for the thing a person would actually install.

`ctx.skills` registers documents that teach the model a procedure. `ctx.tools` registers capability with a schema. `ctx.connectors` (new) holds access to an external service. `ctx.slots` lets a package contribute UI. `ctx.mcp` connects to an MCP server. Cordis mounts all of it from `cordis.yml`. Someone who wanted to ship "Rabi, but for legal contracts" would have to hand over five unrelated artifacts and a paragraph of instructions about where each one goes.

The word "plugin" is already taken here, and it means the smallest thing: one cordis unit with `apply` and `inject`. Every package is one. That is the right word for the mechanism and the wrong word for the product.

## Proposal

**A bundle: one directory that names skills, connectors, agents and a surface, installed as a unit.** Cordis plugins stay exactly what they are — the mechanism a bundle is assembled from — and the bundle is what a person chooses.

The industry has converged on this shape and it is worth matching rather than inventing:

| Role | Anthropic | This repository today |
|---|---|---|
| Teach the model a procedure | `skills/` in a plugin | `ctx.skills`, and `vendor/univer-office` already ships eight |
| Reach an external service | `.mcp.json` in a plugin | `ctx.connectors` + `packages/mcp/mcp-client` |
| A specialist worker | `agents/` in a plugin | `ctx.subagent` + agent presets |
| Invoke by name | `commands/` in a plugin | `ctx.commands` |
| The unit installed | `.claude-plugin/plugin.json` | **missing** |

Google's Gemini Enterprise for Legal ships the same four parts under different names — "purpose-built Skills, MCP Connectors, pre-built Agents, and a governed control plane" — as one vertical product rather than a format anyone can publish. The format is the more useful half to copy.

**The manifest is the whole proposal.** A bundle is a directory with a manifest naming what it contains; installing it mounts each part through the seam that already owns it. Nothing new runs — the manifest is a composition, and cordis already composes.

**A bundle contributes UI through the slot system, not through a template.** `vendor/univer-office` is the proof that a third-party surface can occupy a shell seat: it took the right column and its dock renders inside it. A bundle that wants a chart of an optimization run says which seat it wants and ships a client half, exactly as the packages here do.

### What a first bundle would be

Office automation, because it needs one of each and is honest about the boundary between them.

The **skill** is the whole of it today: driving Excel, Word and PowerPoint is `osascript` on macOS and PowerShell COM on Windows, and both already reach the model through the shell tools. What is missing is not capability but knowledge — which dictionary, how to address a range, how to save without a dialog, how not to leave a hidden process running. A `SKILL.md` is exactly that.

It earns the other parts when someone wants a **tool** with a schema instead of the model writing AppleScript each time, a **connector** that remembers which machine's Office, and a **surface** that shows which cells changed before anything is saved. Each of those is a reason, and none of them is a reason to start there.

## Alternatives considered

**Call the bundle a plugin and rename the cordis unit.** The mechanism is called a plugin in cordis' own vocabulary, in every file here, and in the loader's errors. Renaming it to free the word would touch every package to win a word.

**Ship bundles as npm packages.** They resolve, version and install already. But `bunx @unieai/rabi` demonstrated what installing a package means when peers are involved, an npm install is a poor fit for something a non-technical person picks from a list, and it makes every bundle a publishing event.

**Make the bundle a preset.** `packages/preset` composes an agent from a `cordis.yml`, which is most of the mechanism. It is the wrong noun for a person: a preset configures the agent, while a bundle brings capability, access and a surface with it.

**Adopt Anthropic's plugin format verbatim.** Tempting for compatibility, and it assumes their runtime — `commands/`, `agents/` and hooks are theirs, and the shapes do not line up with the seams here. Matching the *structure* is what pays; matching the file format buys an import path we have no consumer for.

## Acceptance criteria

- A bundle directory with a manifest installs, and its skills, connector declarations and UI seat all take effect without any other file being edited.
- Uninstalling removes every contribution and leaves stored grants alone — a person's approval is not the installer's to discard.
- A bundle that names a connector the deployment cannot satisfy installs anyway and says which part is inert, because a bundle that vanishes looks like one that does not exist.
- The Office bundle is real: its skill drives a document on a real machine, and the parts it does not need are absent rather than stubbed.

## Risks

**A bundle is arbitrary code with the harness's reach.** Skills are documents and connectors are declarations, but a client half is code in the shell and a tool is code on the machine. Distribution needs an answer to "who wrote this" before it needs a marketplace, and this repository has no signing story.

**The seams are not equally ready.** Skills, tools and slots are mature. Connectors are two days old, have no UI, and no host route. A bundle format that assumes all four are finished would document capability that is not there.

**One directory, four ways to disappoint.** A bundle whose skill loads, whose connector cannot authenticate, whose agent needs a model this deployment lacks, and whose panel wants a seat this shell does not declare, has to explain four partial failures without reading as broken.
