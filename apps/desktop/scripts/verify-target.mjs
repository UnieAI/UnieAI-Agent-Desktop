/**
 * Refuse to package for a platform this machine is not.
 *
 * Not caution — a hard requirement of what is being packaged. The closure
 * carries a native module (`koffi`, the Win32 sandbox's FFI) whose binary is
 * chosen per platform and architecture by the package manager at install time,
 * and the harness resolves its own per-platform sandbox the same way. A macOS
 * build produced on Linux would ship Linux binaries inside a `.dmg` and fail
 * only when someone ran it.
 *
 * The four targets are therefore four machines, or four CI runners.
 */
const [, , platform, arch] = process.argv
if (process.platform !== platform || process.arch !== arch) {
  console.error(
    `dsh-desktop: this target must be packaged on ${platform}/${arch};`
    + ` this machine is ${process.platform}/${process.arch}.`
    + ' Native binaries are resolved per platform at install time, so a build from here would ship the wrong ones.',
  )
  process.exit(1)
}
