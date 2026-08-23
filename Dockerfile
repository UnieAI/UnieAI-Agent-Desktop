# UnieAI Agent as a container: one `docker run` and a browser tab.
#
# WHY THIS EXISTS AND NOT A HOSTED INSTANCE. The harness runs an agent holding
# bash and the filesystem tools, and it runs them where the harness runs. One
# shared deployment would therefore give every colleague a shell on one machine
# — which is why the web-gate can pin a host to a single account at all. A
# container per person restores what the desktop model gives for free: the
# agent's reach ends at that person's own container and the directories they
# chose to mount.
#
# WHY IT DOES NOT INSTALL FROM npm. A profile lists bundles by package name and
# a `dsh` installed from a registry fetches them on first run. Nothing in this
# fork is published, so the image carries the built workspace instead and the
# profile resolves against it, exactly as a developer's checkout does.

# ── build ──────────────────────────────────────────────────────────────────
# The repository's own engines range. Older Node fails in ways that name
# neither the version nor the cause; see docs/unieai-development.md.
FROM node:22-bookworm AS build

WORKDIR /src
RUN corepack enable

# The whole context, with `.dockerignore` deciding what stays out.
#
# Enumerating the root files the build needs was tried and failed three times:
# `.git` (the client build stamps the commit), `website/` (the build typechecks
# `scripts/`, one of which imports it), and `tsdown.config.ts` (without it
# tsdown reads package.json as its config and finds no inputs). Each was a
# separate five-minute round trip to learn one filename. An exclusion list is
# the honest shape here: it fails loudly when it is wrong, and what it excludes
# is what the build regenerates.
COPY . .

RUN pnpm install --frozen-lockfile --ignore-scripts

# The client build stamps the source commit into its browser metadata and reads
# it from git. `.git` is deliberately not in the build context — it is large and
# the build does not otherwise need it — so the hash is passed in instead, which
# is what `DSH_CLIENT_COMMIT_HASH` exists for. A build without one is not
# refused for pedantry: the value ends up in artifacts people compare.
ARG DSH_CLIENT_COMMIT_HASH
ENV DSH_CLIENT_COMMIT_HASH=${DSH_CLIENT_COMMIT_HASH}

# `build` is what produces the frontend `dist` the web app serves and the
# `lib/` every plugin is loaded from. Running the harness from sources would
# need the TypeScript toolchain in the runtime image.
RUN pnpm run build

# ── runtime ────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

# The agent runs shell commands, reads files and clones repositories. These are
# the tools it assumes exist; without them its first command fails in a way
# that reads as the agent being broken rather than the image being thin.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git curl ripgrep procps \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /src /app

# Profiles, credentials and sessions. Declared a volume so they outlive the
# container: a person who upgrades the image keeps their conversations.
ENV DSH_HOME=/data
VOLUME /data

# The workspace mounted from the host. It is the working directory on purpose:
# the agent's file tools open relative paths, and a person who mounts their
# project at /workspace should find it without saying so.
WORKDIR /workspace

EXPOSE 3080

# The bind is stated in the profile patch the entrypoint installs, not on the
# command line: `dsh web` refuses `--host 0.0.0.0` and is right to. See
# docker/container-profile.patch.yml for why a container is the case that
# reaches for it anyway, and for what actually contains the exposure — which is
# how you publish the port, not anything this image can decide.
ENTRYPOINT ["/app/docker/entrypoint.sh"]
