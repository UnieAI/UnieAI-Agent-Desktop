# unieai/ — UnieAI product layer

English | [中文](README.zh.md)

Packages that make this harness the UnieAI desktop product rather than a generic composition. They live in their own group so that upstream, which will never create this directory, cannot conflict with them on a rebase.

| Package | Role | ctx key |
|---|---|---|
| [`web-gate/`](web-gate/README.md) | Browser sign-in gate: `/auth/*`, the sign-in page, and the request guard | no service; claims the `webServer` guard seat |
