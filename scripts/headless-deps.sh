#!/bin/sh
# Headless Chromium (Playwright) needs a few X/GTK libraries and at least one font. On a minimal
# Debian (e.g. Raspberry Pi OS Lite) without root, this unpacks them into .cache/headless/ instead
# of installing them system-wide; scripts/screenshot.ts picks that folder up automatically.
# With root, `sudo bunx playwright install-deps chromium` does the same system-wide.
set -eu
cd "$(dirname "$0")/.."
dest=.cache/headless
mkdir -p "$dest/debs" "$dest/root" "$dest/fontcache"
(cd "$dest/debs" && apt-get download \
  libatk1.0-0t64 libatspi2.0-0t64 libgbm1 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libxrender1 libxi6 fonts-dejavu-core fonts-liberation)
for f in "$dest"/debs/*.deb; do dpkg -x "$f" "$dest/root"; done
root=$(cd "$dest/root" && pwd)
cat > "$dest/fonts.conf" <<CONF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>$root/usr/share/fonts</dir>
  <cachedir>$(cd "$dest/fontcache" && pwd)</cachedir>
</fontconfig>
CONF
echo "Unpacked into $dest"
