# Update Panki: the extension in the folder this script is in, replaced with the build the Panki it was set up with
# carries. Chrome won't let an extension change its own files, so this does it from outside; Reload Panki finishes it.
#
# It only ever downloads from that one Panki, over HTTPS (or from this computer itself, for a dev server), writes only
# into this folder, and runs nothing it downloads. Where Panki is, is in update-from.txt beside it: the Panki the zip
# came from writes its own address there as it hands the zip out, and an update never touches it. Without it (a zip
# from before), it's asked for.
#
# It never replaces itself: this script and Update Panki.cmd are left as they are, whatever the
# zip holds. Someone who took over the repository or the server could change the extension, which Chrome keeps boxed
# in, but never what runs on this computer outside it. A new version of the script is put here by hand, from the zip.
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$kept = Join-Path $here 'update-from.txt'
$itself = @('update.ps1', 'Update Panki.cmd', 'update-from.txt')

try {
  if (Test-Path $kept) {
    $address = (Get-Content -Path $kept -Raw).Trim()
  } else {
    $address = (Read-Host 'Where is your Panki? (its address, as you open it in Chrome)').Trim()
    if (-not $address) { throw 'No address was typed.' }
    # Typed without its http:// or https://: this computer's own (a dev server) is plain HTTP, anywhere else HTTPS.
    if ($address -notmatch '^https?://') { $address = if ($address -match '^(127\.0\.0\.1|localhost)(:\d+)?/?$') { "http://$address" } else { "https://$address" } }
  }
  $address = $address.TrimEnd('/')
  if ($address -notmatch '^https://[^/\s]+$' -and $address -notmatch '^http://(127\.0\.0\.1|localhost)(:\d+)?$') {
    throw "$address isn't an address Panki updates from. Delete update-from.txt to type it again."
  }
  Set-Content -Path $kept -Value $address -Encoding ascii

  $work = Join-Path ([IO.Path]::GetTempPath()) ('panki-update-' + [guid]::NewGuid())
  $zip = "$work.zip"
  Write-Host "Downloading Panki from $address..."
  Invoke-WebRequest -Uri "$address/api/extension/chrome.zip" -OutFile $zip -UseBasicParsing
  Expand-Archive -Path $zip -DestinationPath $work -Force
  if (-not (Test-Path (Join-Path $work 'manifest.json'))) { throw "What $address sent isn't Panki's extension." }
  # Copied over what's here but this script itself; nothing is deleted, so a folder Panki was put in by mistake loses nothing.
  Get-ChildItem -Path $work | Where-Object { $itself -notcontains $_.Name } | Copy-Item -Destination $here -Recurse -Force
  Remove-Item -Path $zip, $work -Recurse -Force
  Write-Host ''
  Write-Host 'Done. Press Reload Panki in Chrome to use it.'
} catch {
  Write-Host ''
  Write-Host "Panki wasn't updated: $($_.Exception.Message)"
}
