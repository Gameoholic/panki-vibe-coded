#!/bin/bash
# Run on the VPS as the panki user from the repo's root: by the deploy key's forced command
# after it has pulled `main`, or by hand (`bash scripts/deploy.sh`). Any failing step stops it
# before the restart, so a broken build leaves the running API as it was.

# A non-interactive SSH shell doesn't read the lines that put an nvm-installed Node on the PATH.
# nvm needs bash (sourced by sh it does nothing), and it isn't safe under `set -u`, so it comes first.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
fi
set -eu

pnpm install --frozen-lockfile
pnpm build
# The new API changes the databases as it starts (its migrations): a copy of them as they were first.
pnpm backup
pm2 restart panki-api
