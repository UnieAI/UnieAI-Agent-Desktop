#!/bin/sh
# Install the container's own profile patch before the harness reads it.
#
# The profile directory lives on the /data volume so a person's sessions and
# credentials survive an image upgrade, which means it is created on first run
# rather than baked into the image. The patch is copied in only when absent:
# overwriting it on every start would silently discard whatever the operator
# put there.
set -e

PROFILE="${DSH_HOME:-/data}/profiles/web"
mkdir -p "$PROFILE"
if [ ! -f "$PROFILE/cordis.patch.yml" ] || [ ! -s "$PROFILE/cordis.patch.yml" ] \
   || ! grep -q "action: patch" "$PROFILE/cordis.patch.yml" 2>/dev/null; then
  cp /app/docker/container-profile.patch.yml "$PROFILE/cordis.patch.yml"
fi

exec node /app/apps/cli/lib/bin.js web --no-open "$@"
