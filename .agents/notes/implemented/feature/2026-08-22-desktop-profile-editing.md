# Agent Note: Two-way profile sync between the desktop and UnieAI Copilot

Status: implemented

English | [中文](2026-08-22-desktop-profile-editing.zh.md)

## Problem

The desktop's Account section drew the person's name from `/auth/account` and drew no photo at all, and its Profile card said in so many words that both are changed on the web. The owner wants the profile editable from the desktop, with both surfaces showing the same values.

Everything needed for the read already existed — a device-code session, an API key that only the host holds, and `/api/desktop/*` routes that `resolveIdentity` guards. What did not exist was a write path that keeps that key on the host, an avatar anywhere in the desktop's picture of an account, and a profile route on the product's desktop surface at all.

The constraint that shaped the design is that `copilot-v2` could only be added to: the existing `app/api/user/profile/route.ts` owns the validation rules and keeps them module-private, so they could not be imported.

## Decision

**The product gains one additive route.** `app/api/desktop/profile` (`GET`/`PATCH`) over `lib/desktop/profile.ts`, following the pattern `lib/desktop/usage.ts` set: the browser route's rules are copied verbatim into a module that says, rule by rule, that it is a copy and why it must not drift. The avatar store is the same store — `user_photos.image`, one row per user, a `data:` URL in a text column — so nothing new was invented to hold an image, and a photo set on either surface is the photo the other shows.

The copied rules are exactly the browser route's: the name is required after trimming and has **no** length cap; a non-empty image must match an accepted MIME type **or** an accepted extension, must declare the MIME type it claims, and must be a `data:` URL; and there is **no** byte bound, because that route has none. `image` keeps three distinct intents — a string sets, `null` clears, absent leaves alone — and the desktop depends on all three: collapsing absent into null would delete an avatar on every name-only save.

**The write takes the read's path, in the same direction.** `packages/unieai/web-gate` gains `GET`/`POST /auth/profile` over `src/profile.ts`. The browser posts to its own origin, the host resolves the session and spends the API key, and the key appears in no answer — the same property `/auth/account` already holds, and the suite checks it against the whole serialized body rather than against the fields it expects. A save that the product accepts is followed by a read-back, so the page is told what was stored rather than what it asked for. `fetchAccountSnapshot` gained the same profile call, which is where `user.avatarUrl` now comes from; `/api/desktop/me` reports no photo.

The host's only rule of its own is a 12 MiB buffering limit on the request body, and it is documented as a transport limit rather than a validation rule, because the product bounds no image size.

**The gateway gains `saveProfile`, and the contract gains the seam for it.** `UnieAiAccountGateway` is now `getSnapshot`/`subscribe` plus `signIn`/`signOut`/`saveProfile`. A `saved` result means the published snapshot already carries the stored values, because the gateway re-reads `/auth/account` before answering — so the section never merges its own edit into the account it is drawing. The avatar is part of the state key, or a save that changed only the photo would publish nothing.

`UnieAiProfileSaveResult` deliberately carries **no** message. Every other supplier-owned string in the contract names something only the supplier knows — an allowance, a plan, why an account could not be read. A failed profile save is instead one line of the section's own form copy, and splitting one form's wording across two packages would guarantee it drifts.

**The form reproduces the reference, and holds no copy of what it edits.** `ProfileForm` and `AvatarEditorDialog` follow `copilot-v2/components/settings/profile-form.tsx` in structure and in copy, taken verbatim from the product's `Settings` messages in all four shipped locales. The field and the avatar fall back to the account being rendered and are overridden only by an edit actually made, so a save that lands anywhere is adopted the moment the snapshot moves, and no local mirror can disagree with it.

The crop is reproduced because it is not cosmetic: the avatar travels and is stored inline as base64, so an uncropped phone photo would put megabytes into the account row and into every later read on both surfaces. Everything but an animated GIF becomes a centred 512px PNG; a GIF is passed through, because a canvas re-encode would keep one frame of it.

Tailwind is resolved to values, not copied: `border-zinc-200`/`white/10` becomes `--dsw-alias-border-l2`, `text-zinc-400` becomes `--dsw-alias-label-tertiary`, the avatar plate becomes `--dsw-alias-bg-module-platform`. The sheet writes no literal colour.

## Alternatives considered

**Validate in the browser or on the host.** Both were rejected for the same reason: the product owns what a legal name and a legal avatar are, and a second copy of those rules can only decide differently. The one local check is the blank name, because the field is required and saying so without a round trip is faster — the product still refuses it.

**Forward the product's rejection reason.** `app/api/desktop/profile` refuses with English prose written for a direct caller (`Name is required`, `Unsupported avatar format`). Only the browser knows the reader's language, so the form shows the reference's own *update failed, please try again* for every refusal. Forwarding a structured reason code, as `/auth/providers` does, would need the product to publish one.

**Answer the save from the `PATCH` response alone.** It carries the name and the image but not the address, so the page would receive a partial profile. The read-back costs one call and gives the page what the product actually kept.

**Add a "remove avatar" control.** The reference form has none, so this one has none. The seam and the host route can both express a clear (`image: null`), because that is a distinction the product's own route draws; a button would be its only consumer.

## Consequences

- A profile save costs two product calls, and `/auth/account` now makes four rather than three.
- An avatar is re-sent inline on every account read. The 512px crop is what keeps that a few hundred kilobytes.
- A document that grants no 2D drawing context cannot produce the square; the dialog reports a failed avatar rather than storing the uncropped original.
- The `copilot-v2` half is additive but **not deployed** — the desktop's profile route answers `failed` against any deployment that predates `app/api/desktop/profile`, which is the same posture as an account the product will not describe.
