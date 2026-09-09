#!/bin/bash
# Fish View has no production dependencies, but the measurement and capture
# tools need the development-only @napi-rs/canvas package, and `node --test`
# is run constantly. A remote session starts from a fresh clone with no
# node_modules, so install them before the session begins rather than
# discovering it halfway through an audit.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# `npm install` rather than `npm ci`: the container image is cached after this
# hook completes, and install reuses an already-populated node_modules instead
# of deleting and refetching it on every resume.
npm install --no-audit --no-fund
