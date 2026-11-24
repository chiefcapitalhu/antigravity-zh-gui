#!/usr/bin/env bash
set -euo pipefail

# Run from the repository root. A fresh directory keeps old builds out of the manifest.
out=${1:?Usage: bash scripts/build-release.sh NEW_DIRECTORY [VERSION]}
version=${2-}
if [[ $# -gt 2 || ( $# -eq 2 && ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][A-Za-z0-9.-]+)?$ ) ]]; then
  echo "Invalid release version" >&2
  exit 2
fi
mkdir -- "$out"
export CGO_ENABLED=0 GOPROXY=off GOSUMDB=off GOTOOLCHAIN=local GOTELEMETRY=off
for os in darwin windows; do
  for arch in arm64 amd64; do
    name="antigravity-zh-gui-$os-$arch"
    flags="-s -w"
    if [[ $os == darwin ]]; then
      flags+=" -B=gobuildid"
    else
      name+=".exe"
    fi
    if [[ -n $version ]]; then
      flags+=" -X antigravity-zh-gui/internal/app.Version=$version"
    fi
    GOOS="$os" GOARCH="$arch" go build -trimpath -buildvcs=false -ldflags "$flags" -o "$out/$name" ./cmd/antigravity-zh-gui
  done
done
cd -- "$out"
if command -v sha256sum >/dev/null; then
  sha256sum antigravity-zh-gui-* > SHA256SUMS.txt
  sha256sum -c SHA256SUMS.txt
else
  shasum -a 256 antigravity-zh-gui-* > SHA256SUMS.txt
  shasum -a 256 -c SHA256SUMS.txt
fi
