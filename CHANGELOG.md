# Changelog

All notable changes from `desktop-v0.1.9` through `desktop-v0.1.13`.

> **Read this first if you install from npm.** `0.1.9` through `0.1.12` were tagged and built, but **never reached the registry** — the release could not be packed at all (see [0.1.13 → Release engineering](#release-engineering)). npm went straight from `0.1.8` to `0.1.13`, so everything listed under 0.1.9–0.1.12 reaches npm users for the first time in **0.1.13**.
>
> Desktop installers are a separate story: they were built and thrown away for every release up to and including `0.1.8`, and first appeared on the Releases page in **0.1.9**.

---

## 0.1.16 — 2026-08-29

**If you picked a remote machine once, this release is the fix.** A remembered machine turned every launch into a stall: startup asked that machine about every remembered session — eleven ssh connections before the window had loaded, on a measured profile — and each was free to ask for a password on whatever terminal the app inherited. For a windowed app that is nobody's terminal, so the harness waited for a keystroke that never came and a conversation could not be started at all.

### Fixed

**Nothing asks for a password on a terminal nobody is watching.** Every ssh invocation except a real terminal session now runs in batch mode. Piping the child's stdin did not prevent this — OpenSSH opens `/dev/tty` — so the failure is now the client's own `Permission denied (publickey)`, which a surface can show and you can act on by adding your key to your agent.

**Startup never reaches a machine nobody asked for.** Indexing remembered sessions no longer canonicalizes their paths through a remote machine. That was also the wrong question: a session's directory was recorded on the machine it ran on, and the machine selected now is not necessarily that one. Measured: eleven ssh invocations at startup before, zero after.

**The packaged desktop app could not start at all.** The vendored Univer bundles imported upstream package names answered by manifest aliases — which resolve inside the workspace and do not survive packaging, because electron-builder resolves a dependency tree by copying it. Every packaged build since Univer landed showed a failure page. The bundles now carry our names, and the sync asserts it.

**New chat did nothing.** It reuses a workspace's blank session rather than minting hidden duplicates, so it usually resolved to the session already open and moved nothing on screen — leaving an unsent draft in the composer, which was the whole difference between "a new chat" and what you were already looking at.

### Added

**A tour, once, the first time you open it.** Four steps for the four things you have to do in the first minute — pick a folder, ask in ordinary words, look at what it wants to change, and that it can run on another computer. Each is a small mock of the real interface with a cursor that performs the action.

**Words a person already knows.** A workspace is a folder, a session is a chat, and the access mode says what the agent may *do* rather than naming the permission: `workspace-write` reads as "Change files in this folder".

**Adding and removing a machine are dialogs**, written for someone who has never heard of SSH: a picture of what connecting means, three fields with a plain sentence each, and port, key file and the configuration preview behind one disclosure. The preview shows exactly the lines that will be appended — a field left empty produces none, which is what the writer has always done and nothing had ever shown.

**Univer Office opens in the right column.** Spreadsheets, docs and slides render in the shell's right sidebar rather than in floating windows over the conversation. The plugin is vendored, so installing this product does not download a second copy of the upstream harness. Three of its runtime dependencies publish no licence at all; they are disclosed as such in `THIRD_PARTY_NOTICES.md` while their terms are confirmed with the publisher.

**The desktop app has real icons.** macOS gets Apple's 824-of-1024 grid baked into the artwork; the other platforms get it full-bleed, because they draw what they are given.

**A connector seam.** `ctx.connectors` holds access to external services: loopback and PKCE, endpoints read from each provider's own metadata, and clients registered on demand where the provider offers it — so Notion, Linear and Sanity connect on a fresh install with no application registered anywhere. Google and Microsoft wait for a client id and say so. There is no UI for it yet.

### Release engineering

**Thirty-two remote tests now run on every e2e run.** The suites proving remote machines work were gated on two environment variables naming a hand-built server, so in every ordinary run — and in CI — they skipped silently, and the remote path shipped with no coverage. They start their own disposable sshd now; the only remaining reason to skip is server software that is not installed, and it says so.

---


## 0.1.15 — 2026-08-28

0.1.14 could not boot from a clean install. This is that fix, plus the two checks that should have caught it.

### Fixed

**An installed tree died before the app started**, with `Cannot find module …/lib/types-Dc6T3R7E.js imported from …/lib/fs.js`. `@unieai/uad-execution-router` has four entries that share a module; the bundler split it into a chunk whose filename carries a content hash, and a hashed name cannot be listed in `files` — so the chunk was never published and the package could not import its own entry. **0.1.13 shipped this too**; it stayed invisible because the forwarder crash 0.1.14 fixed killed the boot first, and because every test here resolves `src` rather than `lib`.

The chunk now has a fixed name and is published. A fixed name rather than one bundle per entry: the shared module exports a class, and duplicating a class across entries gives the two rows two of it — an identity failure instead of a size one.

### Release engineering

- **`verify-published-emitted-files`**: every `.js` a built package emits under `lib/` must be published by its own `files` list. Nothing else could see this — tests read `src`, publint reads the manifest rather than the emitted tree, and the packed-install probe loaded one entry and returned. Wired into `hygiene`.
- **The packed-install probe now boots the tree**, not just the binary: it starts the web profile on port 0 and waits for it to announce an address, which applies every entry in the composition. `--version` had returned before the loader mounted anything, which is how a broken package passed the release twice. The probe also stopped omitting optional dependencies, because a real consumer installs them — omitting them had made the tree stricter than any user's.
- Two of the repository's long-red hygiene gates, publint and built package invariants, are green again: both had been reporting this and had been red long enough that nobody read them.

---

## 0.1.14 — 2026-08-28

A hotfix for a crash 0.1.13 introduced on every `bunx`/`npx` launch, and the packaging change that removes its cause.

### Fixed

**`bunx @unieai/rabi web` died before the app started**, with `dsh: …/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-runtime exists and is not a symlink`. The directory it refused to touch was one the harness itself had written. 0.1.13 added the GenUI plugin, which is published against the upstream harness and declares thirteen `@deepseek-ai/*` **peer** dependencies — and npm 7+ and bun both install missing peers, so installing this product downloaded a second complete harness. The boot's module-fallback walk found those packages and tried to link one over a forwarder's path.

The crash was the visible half. Had the path been free, the plugin would have resolved a `Context` class and a service registry from a harness it was never loaded into: no service resolves, silently. An upstream name is now left to its forwarder unless the app itself declares it, and a forwarder the harness generated is replaced rather than refused — so a machine already in the broken state heals itself on the next launch.

### Changed

**GenUI is vendored, so the second harness is never downloaded.** Installing this product no longer pulls 184 extra packages, 73 of them `@deepseek-ai/*`; `pnpm-lock.yaml` holds none. The plugin is pinned as source under `vendor/genui/` and republished as `@unieai/genui`, and the copy moved from upstream 0.9.3 to **0.9.6** on the way: a template centre and exploration achievements in the panel, plus fixes to quiz string options, table reveal flicker, plot wheel-zoom bleed-through, narrow-card grading layout, and the clipboard fallback.

`pnpm run sync-vendor-genui <version>` owns the update, and asserts the two constants that must name the same package on both sides of the network — get one wrong and the fence still draws while every heavy renderer 404s.

### Release engineering

- The workspace gate `check-workspace-constraints` is green again and, this release, caught nothing: the pre-existing failures it was hiding were fixed in 0.1.13.

---

## 0.1.13 — 2026-08-27

The remote-machine release: the harness can now run on a computer that is not this one, and you pick which one from the composer. Also the first release that actually reaches npm since 0.1.8.

### Added

**Run the work on another machine.** A machine picker beside the composer routes the whole execution world — bash, the file tree, the terminal, the workspace — to the machine you choose, over one SSH connection. Machines are read from the ones you can already reach (`~/.ssh/config`, agent keys); you can add and remove them from the picker itself. The harness is composed *onto* the machine rather than assuming it is local, so a command, a file read and a terminal in the same session all land in the same place.

**Machine gauges.** The picker shows what the machine the work runs on is actually doing — CPU, memory, disk — so "why is this slow" has an answer that is not a guess.

**Skills page.** Lists what this build actually serves, rather than what a config file claims. A skill can be copied from your UnieAI account onto this machine in one click.

**An editor, not just a viewer.** A file opens editable, with syntax highlighting, and `Cmd`/`Ctrl`+`S` saves it.

**Three skills ship with the app.** `find-skill`, `skill-creator` and `brainstorming` are found on every install, no configuration.

**GenUI.** `@changfenhuang/dsh-genui` is in the web-app bundle: the model can answer with a ` ```dsh-ui ` fence — layout, charts, forms, mermaid, 3D — with an action loop back to the model. It is a community plugin published against the upstream harness names, so shipping it is also the proof that upstream plugins run on this fork unmodified.

**Studio knowledge-base citations.** A Studio MCP answer now shows where it came from — which document, which page, how strongly the search matched — under the call's Output.

**A mascot that reacts to the session.** Off by default; it reads the session snapshot you are already looking at, so it reflects the run rather than animating on a timer.

**The product's thinking orb** replaces the static atom glyph while the model is working, and returns to the static mark when it settles.

**Screenshots that prove they caught the page.** `page_screenshot` gained `waitForText` and three siblings: a settle timer answers "has it had time?", never "is it there?", and an app holding a stream open never goes network-idle at all.

### Fixed

- **The file tree was frozen for the life of a session** — it never re-read after the first load.
- **The folder picker showed this computer's folders when browsing another machine.**
- **Usage figures were whatever was true at start-up** and never refreshed.
- **A lost SSH connection was reported as a finished command** — a dropped link now fails loudly instead of looking like success.
- **The router built providers the plugin lifecycle never saw**, so a machine chosen at runtime could be routed to a provider that was never started.
- Workspace paths are canonicalized through the filesystem seam, so a symlinked or relative path resolves the same way on every machine.

### Release engineering

- **The dsh family could not be packed at all.** The publication payload gate rejected every path under `src/`, and `@unieai/uad-client-ui-primitives` deliberately publishes `src/vendor/*/LICENSE` — the notice a vendored component's licence requires the distribution to carry. `release:pack` threw on that package, which is why 0.1.9 through 0.1.12 were tagged and never published. A licence file is not a source file; the exemption matches whole basenames, so `src/LICENSE.ts` is still source.
- **Two packages npm would only accept as private.** `@unieai/uad-client-ui-pet` and `@unieai/uad-studio-kb-sources` carried no `publishConfig.access`, so npm defaulted them to restricted and answered `E402 Payment Required`. The publish run stopped there, 177 of 255 packages in — a release is one unit, and half of it on the registry is the state this failure leaves behind.
- **The workspace gate was unreadable, so nobody read it.** `check-workspace-constraints` printed ~250 errors on every run — one per release member, all of them a repository URL never repointed when this fork rescoped. That is why the missing `publishConfig` above reached a publish run. The constant is fixed and everything it was hiding is fixed with it: six manifests still pointing at upstream, two packages publishing no type declarations, a bundle shipping a `cordis.patch.yml` it never declared, three packages publishing entry bundles the files policy did not know about, and `apps/desktop` — an Electron app that ships as installers — being demanded to be publishable.
- **CI that runs.** The inherited `ci.yml` asked for private runner pools this fork does not own, so it had never run once: fifty commits and four desktop releases with no automated check.

---

## 0.1.12 — 2026-08-26

### Added

**Both kinds of provider on one settings page, and it says which is which.** An **API Provider** row keeps its key on the product's server, is metered by your account, and follows you to every signed-in client. An **On this machine** row keeps its key in this machine's `.credentials.yaml`, calls the endpoint directly, and is metered by nobody. Both ended up in the same model picker, so the composer offered them side by side with nothing saying which one a message would be billed through.

**Choose the vision model in settings**, from the models that declare they can see. The route `image_inspect` delegates to used to live in cordis config — a patch file and a restart. It is a setting now, it swaps live, and only a *declared* image input qualifies: a model whose adapter says nothing stays absent rather than guessed at.

### Fixed

- **The Apple Silicon packaging job failed 34 seconds in and could say nothing about why.** The single `Package` step is now three — verify the runner is the target, build the shell, package and publish — so the next failure names itself. Both Mac jobs moved onto one image, leaving architecture as the only difference between them.

---

## 0.1.11 — 2026-08-26

### Added

**A model that cannot see can ask about the image anyway.** Attaching a picture to a text-only model used to refuse the whole message (`MODEL_DOES_NOT_SUPPORT_IMAGES`) — the exact case `image_inspect` was built for and could never reach, because the refusal happened before the model saw anything. When a vision route is configured, the attachment is admitted and the model receives a stub it can inspect by asking its own question. A vision call happens only if it asks; with no such tool registered, nothing changed.

### Fixed

- **The packaged app could not resolve its own plugins.**

---

## 0.1.10 — 2026-08-26

### Fixed

- **The chromium face the package promised was never built**, and nothing checked that it was. Now built, and gated.
- **Desktop artifacts were named something a filesystem rejects.** Each target carries an artifact-safe `slug` (`mac-arm64`, `win-x64`, …) and the gate checks both that the name comes from it and that every slug is safe. Control-run against the exact name that failed: red.

---

## 0.1.9 — 2026-08-26

The first release whose desktop installers actually reached the Releases page.

### Added

**`page_screenshot`** — the model can take a picture of a page. It launches a browser for one call and discards it: fresh profile, fresh process, torn down before the tool returns, so no session carries one page's cookies into another page's picture. Only `http`/`https` are capturable; every other scheme is refused before a browser starts.

**`image_inspect`** — hand one question about one picture to a configured vision route and get its text back; the turn keeps its own model. Mounts dormant when no route is named, so a deployment with no vision model offers no tool rather than one that fails every call.

### Fixed

- **Four green runs, four times four installers, and no release anywhere.** The Package step appended `-- --publish always` to a script already ending in `--publish never`; pnpm passes the `--` through, and yargs stops parsing options at it — so `publish` stayed `never` and the override sat inertly in `argv._`. Every run from 0.1.5 through 0.1.8 built its installers and threw them away, exiting 0 each time. The flag now comes from the script, the step appends nothing, and the installers are uploaded as run artifacts too — because "where is the output?" could not have been asked with them there.
- **The Intel macOS job waited an hour for a runner that no longer exists.** GitHub retired the macOS 13 image, and a job whose label has no runners behind it does not fail — it queues. 0.1.8 therefore shipped three of its four installers with no error to read.
- **A signed-out window asked permission to go to the sign-in page.** It goes there now. The card survives as the fallback for the two ways that send can fail to land, because a window that throws you back out every time you return is worse than a button.

> **Note for whoever publishes a desktop release:** electron-builder's GitHub provider creates a **draft** release, and `electron-updater` reads its feed from published releases only. A draft means the files are retrievable; it does not mean updates work.

---

## Install

```bash
npm install -g @unieai/rabi@0.1.15
```

Desktop installers for macOS (Intel and Apple Silicon) and Windows are attached to each release.
