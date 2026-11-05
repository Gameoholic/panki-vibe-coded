#!/bin/bash
# Update Panki: the extension in the folder this script is in, replaced with the build the Panki it was set up with
# carries. Chrome won't let an extension change its own files, so this does it from outside; Reload Panki finishes it.
#
# It only ever downloads from that one Panki, over HTTPS (or from this computer itself, for a dev server), writes only
# into this folder, and runs nothing it downloads. Where Panki is, is in update-from.txt beside it: the Panki the zip
# came from writes its own address there as it hands the zip out, and an update never touches it. Without it (a zip
# from before), it's asked for.
#
# It never replaces itself: this script, Update Panki.cmd and update.ps1 are left as they are, whatever the zip holds.
# Someone who took over the repository or the server could change the extension, which Chrome keeps boxed in, but never
# what runs on this computer outside it. A new version of the script is put here by hand, from the zip.
set -euo pipefail
cd "$(dirname "$0")"
here="$(pwd)"
kept="update-from.txt"
itself=("Update Panki.command" "Update Panki.cmd" "update.ps1" "update-from.txt")
https_only='^https://[^/[:space:]]+$'
this_computer='^http://(127\.0\.0\.1|localhost)(:[0-9]+)?$'
typed_here='^(127\.0\.0\.1|localhost)(:[0-9]+)?/?$'

fail() {
  echo
  echo "Panki wasn't updated: $1"
  exit 1
}

if [[ -f "$kept" ]]; then
  address="$(tr -d '[:space:]' < "$kept")"
else
  read -r -p "Where is your Panki? (its address, as you open it in Chrome) " address || true
  address="$(printf '%s' "${address:-}" | tr -d '[:space:]')"
  [[ -n "$address" ]] || fail "No address was typed."
  # Typed without its http:// or https://: this computer's own (a dev server) is plain HTTP, anywhere else HTTPS.
  if [[ ! "$address" =~ ^https?:// ]]; then
    if [[ "$address" =~ $typed_here ]]; then address="http://$address"; else address="https://$address"; fi
  fi
fi
while [[ "$address" == */ ]]; do address="${address%/}"; done
if [[ ! "$address" =~ $https_only && ! "$address" =~ $this_computer ]]; then
  fail "$address isn't an address Panki updates from. Delete update-from.txt to type it again."
fi
printf '%s\n' "$address" > "$kept"

work="$(mktemp -d "${TMPDIR:-/tmp}/panki-update.XXXXXX")" || fail "There's no room to download it."
trap 'rm -rf "$work"' EXIT
echo "Downloading Panki from $address..."
curl -fsSL "$address/api/extension/chrome.zip" -o "$work/panki.zip" || fail "It couldn't be downloaded from $address."
mkdir "$work/files"
unzip -oq "$work/panki.zip" -d "$work/files" || fail "What $address sent couldn't be opened."
[[ -f "$work/files/manifest.json" ]] || fail "What $address sent isn't Panki's extension."

# Copied over what's here but this script itself; nothing is deleted, so a folder Panki was put in by mistake loses nothing.
shopt -s dotglob nullglob
for item in "$work/files"/*; do
  name="$(basename "$item")"
  for own in "${itself[@]}"; do
    if [[ "$name" == "$own" ]]; then continue 2; fi
  done
  cp -R "$item" "$here/" || fail "$name couldn't be copied into $here."
done

echo
echo "Done. Press Reload Panki in Chrome to use it."
