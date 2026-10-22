#!/bin/sh
# Run on the VPS as the panki user from the repo's root: by the deploy key's forced command
# after it has pulled `main`, or by hand (`sh scripts/deploy.sh`). Any failing step stops it
# before the restart, so a broken build leaves the running API as it was.
set -eu

# A non-interactive SSH shell doesn't read the lines that put an nvm-installed Node on the PATH.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
fi

pnpm install --frozen-lockfile
pnpm build
# The API runs any new migration as it starts: the data as it stood before, every deploy.
pnpm backup
pm2 restart panki-api
