# @unieai/uad-client-ui-machine-gauges

English | [中文](README.zh.md)

Two or three small bars in the session header saying what the machine this conversation runs on is doing, and a panel with the rest of the reading.

## Where it sits, and why there

Immediately **before the view switch**, in the header's right-hand cluster. That is where a person's eye already goes when the question is about the session rather than about the message in front of them.

The order is the contract, not a preference. A gauge describes the MACHINE; the switch beside it names what the column is showing. A reading drawn after the switch would read as a property of the view, so this package registers into `conversation.session.header.gauges`, which [`ui-conversation`](../ui-conversation/README.md) renders before the switch and a test pins in that order.

The header hides itself while a session is blank, so the strip appears with the rest of the session chrome and not before.

## Small, and honest about what it measured

Three bars, no numbers, no chart. A header is a place to notice that a build box is pinned, not a place to study it; everything with a figure attached is in the panel behind the strip.

**A reading that was not taken draws no bar.** The first poll after a machine is selected reports no processor percentage — it is a difference between two readings — and a machine with no `/proc` never reports one. An empty bar there would say the machine is idle, which is a different claim from "not measured", so the strip simply has one fewer bar. The same rule drops a memory bar when only half the fraction was read, and an accelerator that reported no utilization.

The order is what changes fastest first: processor, memory, accelerator, disk. Disk last because it moves in hours.

## Polled while it is on screen

Each reading is a command run on someone's machine, so it happens while a person is looking at it and stops when they are not: polling starts when the strip mounts, stops when it unmounts, and skips while the tab is hidden. A push would mean running that command forever on every machine anyone ever selected.

The lifecycle is the view's rather than the component's, and it counts its readers — a remount must not leave a timer behind, and a second strip must not start a second one. A poll that lands after the view stopped is discarded by comparing the generation it started in, because a boolean the compiler has already narrowed reads as dead code after an `await`.

**A failed poll keeps the last reading** and dims the strip. What was true a moment ago is still the best answer anyone has, and blanking on a dropped connection would make a hiccup look like a machine that went away. Opening the panel then says the figures are from before the failure.

**A move to another machine drops the reading and reads again at once.** That is the one event the paragraph above does not cover: the figures on screen are not stale, they describe somewhere else, and keeping them would say the new machine looks exactly like the old one. The strip hears it as `machines/changed` (declared by the client runtime, so this package still knows nothing about machines) and re-reads instead of finishing out its interval under the wrong name. Nobody watching means nothing to do — the next mount reads fresh anyway.

**A deployment that cannot measure anything draws nothing and stops asking.** `metrics-unavailable` is answered once, and the strip returns null rather than standing in the header as a control that never answers.

## Model Experience

None, as this package contributes browser presentation only; it reaches no model request.

#### KV Cache effect

None; this package assembles and sends nothing.

## Known Limitations and Deferred Work

- **The strip shows the first accelerator only.** A machine with eight GPUs draws one bar, and the panel behind it lists all of them. Eight bars in a header is a chart, and the header is not where that belongs.
- **No history, so no trend.** Every reading replaces the last one; a strip that showed the past minute would need this package to keep a series, and the point of it is to be glanceable rather than to be a monitor.
- **Four seconds is not configurable.** The interval is a constant, chosen so a remote machine on a slow link is not asked faster than it can answer. A deployment that wanted another number has nowhere to say so.
- **Nothing names which machine a bar describes until the panel is open.** The strip has no room for it, and the machine picker in the composer already says where work runs; the panel repeats it because a reading in front of someone should say what it measured.
