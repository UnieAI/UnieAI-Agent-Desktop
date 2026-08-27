# @unieai/uad-fs-ssh

English | [中文](README.zh.md)

The filesystem seam, placed on a machine reached over SSH. Mounted beside [`subprocess-ssh`](../subprocess-ssh/README.md) and pointing at the same machine, it completes the execution world: the file tools, search and the language servers all see that machine's files, and none of them knows why.

## Shell commands, not an agent

Everything crosses as POSIX shell commands over the connection the [machine book](../ssh/README.md) already holds open. There is nothing to install on the machine — an `sshd` is enough — and the price is that every operation must be expressible in shell and must survive both userlands.

Two portability facts shape all of it:

- **`stat` has two dialects.** GNU and busybox answer `stat -c '%s %Y'`; BSD and macOS answer `stat -f '%z %m'`. The machine is **probed once** per connection rather than inferred from `uname`, because a Linux host can carry BSD tools and a Mac can carry GNU ones through Homebrew — the answer has to describe the `stat` that will actually run.
- **Canonicalization is `cd` plus `pwd -P`,** not `realpath` or `readlink -f`, which are absent or differently spelled across the same divide. It also names a path that does not exist yet, which every file creation needs: the parent is entered and the basename appended.

Filenames are read back NUL-terminated. A filename may contain any byte except NUL — a newline included — and a line-oriented listing splits such a name into two entries that both refer to nothing.

## What a listing costs

One round trip, whatever the directory holds. Stat-ing each child separately would be one connection round trip per file, and on a link with 30 ms of latency a two-hundred-file directory would take six seconds to open. The shell enumerates and reports type, size and modification time for every entry in a single command.

## Writes

A write stages a file **in the target's own directory** and renames it over the target. `mv` is atomic only within one filesystem, so staging in a temporary directory elsewhere would silently degrade to a copy that a reader can observe half-written. An interrupted transfer leaves the original untouched, and the staging file is removed.

An existing file's permissions are carried across. `chmod --reference` is GNU-only, so the mode is read in the machine's own dialect and applied — a rewritten script that stops being executable, or a rewritten key that becomes world-readable, is a worse outcome than a failed write.

## Versions

The freshness token is derived from size and modification time, which is what a remote reports cheaply. Two writes inside the same second that leave the byte count identical are therefore indistinguishable — the limit every mtime-based guard has. It is also why a write returns the version it produced rather than leaving the caller to re-read.

## Model Experience

Indirectly, through the file tools built on `ctx.fs` — `read`, `write`, the string editor, search — which own every model-facing contract; this package registers no tool, prompt, or schema of its own and only changes which machine their files live on.

#### KV Cache effect

None. No prompt fragment, tool definition, or context entry originates here.

## Known Limitations and Deferred Work

- **No file watching.** The seam does not require it, but consumers that would like it (an editor showing an external change) cannot have it here: there is no inotify over a shell, and polling a remote directory is a per-file round trip.
- **A second-granularity version.** Two writes within one second that preserve the file's size collide, so a stale-write guard can pass when it should not. A content hash would close it at the cost of reading every file twice on every check.
- **`readBytes` refuses late.** The ceiling is enforced while the bytes arrive, so an oversized file costs the transfer up to the limit rather than being refused from its metadata first.
- **The remote must have a POSIX-like login shell**, and one of the two `stat` dialects. A machine with neither is refused at the first operation, naming what is missing.
- **One machine per mount**, as with the subprocess adapter; choosing per workspace needs a router the harness does not have yet.
