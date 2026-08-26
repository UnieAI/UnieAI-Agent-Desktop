# @unieai/uad-tool-image-inspect

English | [中文](README.zh.md)

`image_inspect`: the turn keeps its own model and hands ONE question about ONE picture to a vision route.

## Delegation, not a model switch

The obvious way to answer a question about an image is to move the turn onto a vision model. This does not, for two reasons that only show up later. Switching mid-turn throws away the prefix cache, and it keeps every subsequent text-only step on the more expensive route — a manual that needs six screenshots would spend its whole remaining length there. A subagent would avoid both and costs a whole loop for one question.

So one tool call goes out carrying the image and the question, and what comes back is text.

**The cost is real and the tool's own description states it: the caller gets a DESCRIPTION, not the picture.** "Is this button blue" survives that. "Click the button" does not — the coordinates in the answer were measured on an image the caller cannot see, and it has no way to check them. A model that needs to act on a position should be looking at the image itself, on a route that accepts one.

## The image is not compressed here

It travels as an attachment REFERENCE. The adapter derives a request version through `attachments.readImageRequest` against the model's own declared `imagePixelBudget` and `imageMaxBytes`, caches it by variant, and sends that. Shrinking here as well would shrink twice, cache neither, and hard-code a budget that belongs to whichever model the deployment named.

## Dormant until a route is named

With no `provider` and `model` in its config, the plugin registers nothing. A deployment with no vision model then offers no `image_inspect` rather than offering one that fails every call — the same posture `llm-pi-ai` takes when its settings name no providers.

Named routes are checked before every call: a route that does not declare `image` input is refused here, with a message about the composition, rather than inside the provider with a message about a malformed request.

## Contract

- One image, one question, one answer. An empty question is refused rather than passed on for the vision model to guess at.
- An empty answer is a failure, not an answer: `""` read as valid would land verbatim in whatever the caller is writing.
- The system prompt given to the vision route tells it to answer only what was asked and to say when the image does not show it. A vision model given a bare question volunteers a paragraph about the rest of the frame, and the caller — which never sees the image — cannot tell the answer from the padding.
- The answer names the route it came from, because an answer about a picture is only as good as the model that looked.

## Model Experience

### System prompt

#### What the model sees

One section at order 113, fixed at registration. Registered only when a vision route is configured; a dormant plugin contributes nothing at all.

##### Inspection guidance

```markdown
Use the image_inspect tool to ask about the contents of an image you cannot see yourself. Pass the image object exactly as the tool that produced it reported, plus one specific question. It answers from a vision model and returns text, so ask for the fact you need — the text on a button, whether an element rendered, what a chart shows — rather than for a general description.
```

#### Token effect

About 70 tokens of fixed guidance, and none when no vision route is configured.

#### KV Cache effect

Fixed text in the stable prefix; it does not move across turns.

### Inspection result

#### What the model sees

The vision route's answer, named with the route that produced it.

##### Answer envelope

```markdown
<model>unieai-cloud/gemini-2.5-pro</model>
<answer>
The primary button reads "Get started" and is blue.
</answer>
```

#### Token effect

Only the answer, capped by `maxTokens`. The image is spent on the OTHER route's request and never enters this turn.

#### KV Cache effect

Appended after the prompt. The delegated request goes out on a different route and does not disturb this turn's prefix.

## Known Limitations and Deferred Work

- **The caller never sees the image.** Every answer is one model's reading of it, and a wrong reading is indistinguishable from a right one downstream.
- One image per call. Comparing two pictures is two calls and a caller that holds both answers as text.
- The route is fixed by configuration; the tool cannot pick a cheaper or a stronger vision model per question.
- No conversation with the vision route: each call is a fresh single-turn request, so a follow-up question re-sends the image.
