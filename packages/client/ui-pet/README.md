# @unieai/uad-client-ui-pet

English | [中文](README.zh.md)

A small companion in the corner of the window that reacts to what the agent is doing, and a card in the plugins section for choosing it or turning it off.

Off by default. A companion that appears uninvited on first launch is a surprise in the corner of someone's workspace; the person who wants one goes and turns it on.

## What it reacts to

The session the person is looking at, and nothing else. `running` is the harness's own answer to "is a turn in flight", and `runningCalls` separates a model that is thinking from one that has dispatched something:

| Session | Reaction | Animation |
| --- | --- | --- |
| settled | `idle` | idle |
| a turn open, nothing dispatched | `thinking` | review |
| a tool call in flight | `working` | running |
| waiting on a person | `waiting` | waiting |

Nothing here reads model output. A mascot that inferred meaning from text would be wrong in a way nobody could correct — and it would be wrong most visibly at the moment someone was reading the text themselves.

`waiting` is deliberately not `idle`: the person being waited on is exactly who should be able to tell the difference at a glance.

## Sprites

The pets are [OpenPets](https://github.com/alvinunreal/openpets) "Codex" sheets (MIT — `apps/web/public/pets/LICENSE`). A sheet is a fixed 1536×1872 grid: eight columns by nine rows of 192×208 frames, one animation per row. Pets carry no per-sheet metadata, so those numbers ARE the contract, stated once in `src/codex.ts` and read by both the renderer and its tests; a sheet that does not match renders as garbage rather than failing.

They are static files under `apps/web/public/pets/`, not assets this package imports. A 1.7 MB grid imported by the browser half would sit base64 inside `client.js` and be paid for on every load, mascot or not; this way a browser fetches the one pet in use and caches it.

## Drawing

One canvas, one `drawImage` per frame change. Canvas rather than stepping `background-position` from a timer: that costs a style recalculation per frame on an element sitting above the whole app. The frame index comes from a clock rather than a counter, so a tab that was hidden resumes where the animation actually is, and a hidden tab is not animated at all.

The dock and the sprite are both `pointer-events: none`. An overlay seat spans the whole app box, and a transparent box that swallows clicks is indistinguishable from a broken page.

## Services consumed

`sessions` for the activity signal, `settingsScope` for the preference, `slots` for both seats, `locale` for copy.

## Model Experience

None, as this package registers no tool, prompt, schema, or context: it is a drawing in the corner of a window, and the model is never told it exists.

#### KV Cache effect

None. Nothing here contributes a prompt fragment, a tool definition, or a context entry, so no reuse boundary can move because of it.

## Known Limitations and Deferred Work

- **Two pets ship.** The catalogue upstream is much larger; each sheet is ~1.7 MB and every one ships to every install, so the bundled set is a deliberate two rather than a folder someone forgot to prune. Adding one is a file drop plus an entry in `src/pets.ts`.
- **No idle behaviour.** Upstream pets stroll, sleep and wave on their own; this one only mirrors the session. The strolling rows (`running-left`, `running-right`) exist in every sheet and nothing drives them yet.
- **One session at a time.** The mascot follows the current session; a background session finishing its turn does not show here.
