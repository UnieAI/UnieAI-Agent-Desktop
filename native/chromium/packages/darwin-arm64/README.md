# @unieai/rabi-chromium-darwin-arm64

English | [中文](README.zh.md)

The open-source Chromium build for **macOS on Apple Silicon**, carried so the operator browser works on a machine that has no browser of its own.

Chromium snapshot revision: `1685241` — BSD-3-Clause, and the LICENSE beside the payload is the text it is published under.

## Chromium, deliberately, and not Chrome for Testing

Chrome for Testing is the obvious thing to download and the wrong thing to redistribute: it is a **Google-branded** build carrying the proprietary Widevine CDM, published under Chrome's Terms of Service rather than an open licence. `scripts/verify-payload.mjs` asserts the absence of both before a release, per platform, rather than trusting the URL in the pin to still point where it did.

The trade is that Chromium's snapshot archives are a build OUTPUT directory rather than a curated distribution, so they carry artefacts a browser does not need — `interactive_ui_tests.exe` alone is 342MB. `scripts/fetch-chromium.mjs` drops those on the way in.

## Nothing imports this

`@unieai/uad-browser-operator` resolves `chromium.json` from this package and launches the executable it names. There is no JavaScript here to load — the payload is a browser, and the manifest beside it says where inside `browser/` the executable is.

npm installs exactly one of these: the `os` and `cpu` fields are what make the other three skip on your machine, and what makes an install on an unlisted platform succeed with none of them rather than fail.

## Why the four revisions differ

Chromium uploads snapshots per platform at whichever commit positions its builders happened to finish, so a position built for all four is rare — the revisions here span about sixty commits. Pinning one shared number would mean pinning an old one, or none at all. What a bug report needs is a build the next person can fetch, and a per-platform revision names one exactly.
