# @unieai/uad-tool-page-capture

English | [中文](README.zh.md)

`page_screenshot`: the model asks what a web page looks like, and a browser that exists only for that call takes the picture.

## Why not the operator browser

`ctx.operatorBrowsers` ([`browser-operator`](../browser-operator/README.md)) already drives a real Chrome, and this deliberately does not use it. That one is the browser a PERSON drives: loopback-pinned, workspace-scoped, and it outlives the panel showing it — a page left open on a dashboard is the point. None of that belongs to a model-facing screenshot, and one property of it is actively wrong here: a long-lived browser carries one call's cookies into the next call's picture, which is how one site's signed-in session ends up rendered into another site's screenshot.

So this launches a browser with a throwaway profile, photographs one page, and kills it. The two share the launch and CDP plumbing (`@unieai/uad-browser-operator/chromium`) and nothing else.

## Why a tool and not a capability seam

There is one way to photograph a page — drive a real browser — and one consumer, the tool itself. A Service Definition with a single provider and a single consumer would be ceremony around a function. If a second way ever exists (a remote rendering service, say), that is when the roles have started to evolve independently and the seam is worth drawing.

## Photographing the page, not a page that has not arrived

Four options exist because a picture can be taken correctly and still answer the wrong question.

**`waitForText`** is the one that matters most. A settle timer answers "has it had time?", never "is it there?", and a page holding a stream or a poll open never goes network-idle at all — so without a marker the capture is a race against the app's own data. Given one, the tool polls the rendered text and, if it never appears, **fails with `CONTENT_NOT_FOUND` instead of returning the skeleton**. A skeleton that answers the question wrongly is worse than no answer.

**`clipSelector`** photographs one element at its own size, measured in page space so an element scrolled out of view still comes out. A selector that matches nothing, or matches a zero-sized box, is `ELEMENT_NOT_FOUND` rather than a silent fall back to the whole page — widening the shot would answer a different question than the one asked.

**`hideSelectors`** hides what happened to be on screen. It sets `visibility`, not `display`, so removing a toast does not reflow the page underneath it.

**`theme`** emulates `prefers-color-scheme`, applied BEFORE navigation: a scheme switched after first paint photographs a page mid-repaint, and some pages read the preference once at startup.

## Contract

- **`http` and `https` only.** `file:` would turn a tool parameter into a reader for the host filesystem, and the schemes a browser treats specially reach the browser rather than a page. Here the caller is a MODEL, which makes it the stronger of the two cases for the fence.
- The picture leaves as an **attachment reference**, never as inline bytes: a megabyte of base64 in the session log for every call would be paid on every later turn that replays it.
- `settleMs` waits before shooting. A load event is not a painted page — fonts swap, images decode, and a framework's first render lands after it — so the wait is a deployment choice that trades a slower tool against blank screenshots.
- `fullPage` is asked for, never guessed. A manual usually wants the whole page; a "what does this look like" question usually wants the fold, and neither is a safe default for the other.
- A page that shadows `document.title` with an object gets an empty caption rather than `[object Object]`.

## Model Experience

### System prompt

#### What the model sees

One section at order 112, fixed at registration; it does not interpolate per turn.

##### Screenshot guidance

```markdown
Use the page_screenshot tool to see what a web page looks like. It renders the address in a real browser and returns the picture, which is what to use when the ANSWER depends on layout, styling, or what is visible — a manual that needs an illustration, a check that a page renders. For the page's text or data, web_fetch is cheaper and more accurate.
```

#### Token effect

About 60 tokens of fixed guidance.

#### KV Cache effect

Fixed text in the stable prefix; it does not move across turns.

### Screenshot result

#### What the model sees

An envelope naming the address, the page's own title and the pixel size, followed by an image block carrying the attachment reference.

##### Screenshot envelope

```markdown
<url>https://example.org/</url>
<title>Example Domain</title>
<content>
PNG screenshot, 1280x800 px
</content>
```

#### Token effect

Three short lines, plus the image itself — whose cost is the model's own per-image accounting for a picture of the configured viewport, not anything this package meters.

#### KV Cache effect

Appended after the prompt, so earlier turns keep their prefix. The image rides as a reference, so replaying a turn does not re-send its bytes.

## Known Limitations and Deferred Work

- No interaction before the shot. It navigates and photographs; a page that needs a click, a login, or a dismissed cookie banner is photographed with the banner.
- No device emulation beyond width and height — no mobile user agent, no touch, no device scale factor above 1.
- The wait is a fixed duration, not a readiness signal. A slow page yields a half-painted picture and a fast one wastes the remainder.
- One page per call. A flow across several pages is several calls, and nothing carries state between them, by design.
