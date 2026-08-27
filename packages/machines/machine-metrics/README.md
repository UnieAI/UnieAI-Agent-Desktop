# @unieai/uad-machine-metrics

English | [中文](README.zh.md)

What the machine a session runs on is doing right now: processor, memory, disk, and whatever accelerators its own vendor tools report.

## One service, one method

`ctx.machineMetrics.sample(signal)` runs one shell command through `ctx.subprocess` and parses what comes back. Nothing is pushed, nothing is polled here, and no state survives a call except the one reading a percentage needs.

**Through `ctx.subprocess`, not through Node.** `os.cpus()` and `/proc` read from the process that calls them, which is always this computer. A person who pointed a session at a GPU host and watched their laptop's gauges would be reading a lie that looks exactly like the truth. The subprocess seam is what [`execution-router`](../execution-router/README.md) already aims at the machine someone picked, so a remote reading and a local one are the same code path and this package never learns that machines exist.

**One command, not five.** Each reading is one round trip, and a machine on a 30 ms link would spend a quarter of a second per poll if processor, memory, disk and accelerators were asked for separately. The command emits every section behind a `@dsh:` marker and the parser splits it.

**Every stage is guarded.** A machine with no `/proc`, no `nvidia-smi` and no `npu-smi` runs the same command and emits those sections empty. So the command exits 0 on a bare container and on a GPU host alike, and a failure that reaches the caller is the connection rather than a missing tool.

## What is not measured is absent

Every field is optional, and one that could not be read comes back `undefined` — never zero. A gauge showing 0% for a reading nobody took is a lie someone acts on: it says the machine is idle, which is a different claim from "not measured".

That rule decides several details:

- **The first sample of a machine reports no processor percentage.** `/proc/stat` is cumulative, so a percentage is a difference between two readings. The service keeps the previous one and subtracts, which is what `top` does; the alternative is a command that sleeps a second on the machine, on every poll, holding a connection open to do nothing.
- **A counter that did not advance, or went backwards, reports nothing** rather than dividing by zero or reporting a negative — two polls inside one clock tick, and a machine rebooted between polls.
- **A world that changed invalidates the difference.** Subtracting one machine's counters from another's produces a number that means nothing, so a reading taken after the router moved starts over.
- **Memory is read as `MemAvailable`, not `MemFree`.** Free memory excludes the page cache, so a healthy Linux machine reports single digits and a gauge built on it reads as permanently full.

## Portability, and where it stops

`df -Pk` is the one `df` form GNU and BSD agree on. The Mach path (`hw.memsize` plus `vm_stat`) covers macOS memory; macOS processor percentages are not read at all, because `top` costs a full sample of every process to ask, so a Mac reports its core count and its load averages and no percentage.

GPUs are read from `nvidia-smi`'s CSV. NPUs have no equivalent, so the two forms that exist on machines people actually attach are read — Ascend's `npu-smi info` table and Rockchip's `/sys/kernel/debug/rknpu/load` — and anything else reports no NPU, which is the same answer a machine without one gives.

## Model Experience

None, as this package registers no tool, prompt, schema, or context: it answers one host route for a surface a person looks at, and no reading reaches a model request.

#### KV Cache effect

None. Nothing here contributes a prompt fragment, a tool definition, or a context entry.

## Known Limitations and Deferred Work

- **A Mac reports no processor percentage.** The Mach form has no cumulative counter this command can read cheaply; `top -l 2` would sample every process twice and take a second to answer. A Mac's cores and load averages are read, and the strip simply draws one fewer bar.
- **Only NVIDIA GPUs are read.** AMD (`rocm-smi`), Intel (`xpu-smi`) and Apple's own GPU each have a different tool and a different output; adding one is a section and a parser, and none is here because nobody has run this against that hardware.
- **NPU coverage is two vendors, and both are pattern-matched.** Ascend's table and Rockchip's debugfs line are what this recognises. A vendor that renames a column moves to reporting no NPU rather than a wrong number, which is the intended failure but is still a failure nobody is told about.
- **The reading has no history.** Each sample is what the machine is doing now; a surface that wanted a sparkline would have to keep its own, and nothing here retains more than the one processor reading a difference needs.
- **Disk is one filesystem.** The one holding the configured path — the harness's own working directory by default. A machine whose work spans several mounts reports the one it was asked about, and a surface has no way to ask for another.
