# @unieai/uad-client-ui-first-run

English | [中文](README.zh.md)

Four steps, the first time somebody opens this, and never again.

## Why it exists

Everything else in this shell assumes someone who has used a program like this before. The first screen asked for a "workspace"; the composer offers an access mode; nothing said what the agent would do with the folder it was given. For the person this product is now for, that is four unfamiliar decisions before the first sentence.

## What it teaches, and what it leaves out

Not the feature list — the four things a person has to do in the first minute, in the order they meet them: **pick a folder**, **ask for something in ordinary words**, **look at what it wants to change before it changes it**, and only then **that it can run somewhere else**.

The fourth is last on purpose. Remote machines are the most interesting thing this product does and the least urgent thing a new person needs; putting it earlier would teach the wrong lesson about what this is for.

## Scenes, not icons

Each step is a small **mock of the real interface with a cursor that performs the action**. An icon says a feature exists; this has to show someone what to *do*, and a pointer moving to a button that then responds is the shortest way to say "press that".

They are pure CSS on a shared six-second cycle. Pulling an animation runtime into the desktop bundle to move eight boxes would be paid for by everyone who never opens this, and a stylesheet expresses "opacity and transform at these times" directly. `prefers-reduced-motion` stops all of it and leaves each scene readable as its final frame.

## Shown once, dismissible from the first frame

`Skip` sits beside the step counter rather than at the end of the sequence: a tour that cannot be left is worse than none. Finishing and skipping are the same durable answer, kept in the `first-run` settings section.

**Closing is this component's own answer, not the setting's.** The write is a round trip and may not settle at all where preferences are held in memory; a dialog that waited for storage to agree would look like a control that does not work.

**While the answer is still arriving, the tour stays hidden.** `loading` is not `not seen`, and showing a tour to somebody who already dismissed it — every launch, until their preferences load — is worse than showing it a moment late. Where preferences cannot be kept at all, it is shown, because a person on a fresh install is exactly who it is for and it can always be skipped.

## Model Experience

None, as this package registers no tool, prompt, schema, or context that reaches a model request. Its node half exists only to own the durable section; everything else is drawn in the browser.

#### KV Cache effect

None. Nothing here contributes a prompt fragment, a tool definition, or a context entry, so no reuse boundary can move because of it.

## Known Limitations and Deferred Work

- **No way back to it.** Once dismissed there is no "show me that again" anywhere in the product; someone who wants it has to clear the setting by hand.
- **It cannot point at the real interface.** The scenes are mocks, so a change to the composer or the workspace picker leaves them describing something that no longer looks like that, and nothing fails when it happens.
- **One tour for everybody.** A person who arrives having already connected a remote machine still meets the step explaining that machines exist.
- **English text inside the scenes is localized, but their layout is not.** A language with much longer words can overflow a mock sized for the shipped four.
