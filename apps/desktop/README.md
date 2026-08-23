# @unieai/uad-desktop

English | [中文](README.zh.md)

An Electron window over a harness this app starts and owns. It is UnieAI Agent as an installable application rather than a URL in a browser.

## Why it exists

The web GUI already is the product. What a desktop build adds is not features but reach: something a person installs, keeps in a dock, and launches without remembering a command or a port.

So this package deliberately holds no product behaviour. It starts `dsh web`, waits for the address that server reports, and loads it. Everything a person then does is the same code the rest of this repository tests — a shell that grew its own features would be a second product with nothing behind it.

## How it starts the harness

Three choices carry most of the design.

**Readiness is the URL line, not a timer.** `dsh web` prints `dsh web: http://127.0.0.1:<port>` only after the Loader settles, and [`packages/bundle/web-app`](../../packages/bundle/web-app/README.md) documents that line as the signal supervisors wait on. A shell that slept and hoped would show an error page on a slow machine and a blank window on a broken one.

**The port is the OS's choice.** `--port 0` binds an ephemeral loopback port and the URL line reports the one taken. A fixed port collides with a developer already running `dsh web`; picking a random number here would only move that collision somewhere less visible.

**The home directory is the app's own.** `DSH_HOME` points at the packaged app's data directory, so an installed copy and a checkout never write into each other's profiles, credentials or sessions.

The harness runs in Electron's utility process — the Node environment Electron already carries. A packaged app ships no separate `node` binary to spawn.

Two things about that environment are not obvious, and both cost a long diagnosis:

**Electron's Node resolves modules with preserve-symlinks semantics, and pnpm's `node_modules` is built entirely from symlinks.** A shell started against the workspace tree therefore cannot find the harness's plugins, and says so with `Cannot find package '@unieai/cordis-plugin-timer'`. Proven by elimination: system `node` runs the same entry and prints its URL; `ELECTRON_RUN_AS_NODE=1` on Electron's own Node fails identically, which rules out the utility process; and system `node --preserve-symlinks` reproduces it exactly. An npm-installed tree — real directories, no symlinks — resolves cleanly, which is why packaging installs rather than links.

**`--expose-internals` is passed to the harness on purpose.** The harness watches the user's own patch layer through Cordis HMR, and HMR needs Node's internal module loader. `vendor/loader` reaches it two ways: that flag, or the `node-addon-require-builtin` native addon. The addon is built for Node's ABI and does not load inside Electron, so without the flag both routes are closed — and the failure arrives AFTER the URL line, because the server binds first and the process then exits 1. The flag is the documented first route in that same function, not a way around it.

## Failure is shown

A harness that cannot start would otherwise leave a blank window and no way to find out why. The window renders what the harness wrote before it stopped, from a data URL rather than a bundled page: a failure page that itself has to load from somewhere is one more thing that can fail at the moment nothing else works.

## Running it

```sh
pnpm --filter @unieai/uad-desktop run start
```

`pnpm run build` at the repository root must have run first: the shell packages and launches the harness's built `lib/`, not its sources.

## Packaging

```sh
pnpm --filter @unieai/uad-desktop run package:mac:arm64   # on an Apple Silicon Mac
pnpm --filter @unieai/uad-desktop run package:mac:x64     # on an Intel Mac
pnpm --filter @unieai/uad-desktop run package:win:x64     # on Windows x64
pnpm --filter @unieai/uad-desktop run package:win:arm64   # on Windows arm64
```

**Each target must be packaged on that platform**, and `scripts/verify-target.mjs` refuses anything else. This is a property of what is being packaged, not caution: the closure carries native binaries the package manager chooses per platform and architecture at install time — `koffi`, the Win32 sandbox's FFI, is the clearest case — so a macOS build produced on Linux would ship Linux binaries inside a `.dmg` and fail only when someone ran it. Four targets means four machines, or the four runners in [`desktop-release.yml`](../../.github/workflows/desktop-release.yml).

## Updates

The app checks a GitHub Releases feed on launch. What makes that work is not the tag: `electron-updater` reads the `latest.yml` and `latest-mac.yml` that electron-builder writes **when it publishes**, which is why the workflow passes `--publish always` and the local scripts pass `--publish never`. macOS additionally updates from the `zip` target rather than the `.dmg`, so a release carrying only the disk image gives people something to install by hand and nothing to update from.

**Windows installs updates itself. macOS tells and opens the download page.** That split is not a preference: Electron's documentation states that an application must be signed for automatic updates on macOS, because Squirrel.Mac requires it. An unsigned build that promised an install would fail after downloading, which is worse than not offering. `src/updates.ts` names exactly what to delete when a Developer ID exists.

Being unsigned also costs a warning at install time — SmartScreen on Windows, and on macOS a trip through System Settings → Privacy & Security, since the right-click-to-open bypass was removed in Sequoia.

## Model Experience

None. This package contributes an application shell; nothing here reaches a model request, and no prompt, tool or message is registered.

#### KV Cache effect

None; this package assembles and sends nothing.

## Known Limitations and Deferred Work

- **macOS builds cannot update themselves**, for the reason above. The only fix is an Apple Developer ID; nothing in this package can substitute for one.
- **No Linux target.** The window works there and the harness is developed there, but nobody has asked for an installable Linux build, and adding one means choosing between AppImage, deb and Flatpak on evidence this package does not have.
- **Windows arm64 is packaged but untested.** Every dependency publishes an arm64 binary, which is why the target exists; no arm64 Windows machine has run the result.
- **The shell has no tests.** Its two seams — the URL line and the utility process — are Electron APIs that cannot run under `vitest`, and a test double for both would assert this package's own mocks. What protects the contract instead is that the URL line is documented and tested where it is produced.
