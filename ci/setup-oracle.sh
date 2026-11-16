#!/usr/bin/env bash
set -euo pipefail

: "${RUNNER_TEMP:?RUNNER_TEMP must be set}"
: "${GITHUB_ENV:?GITHUB_ENV must be set}"

# Cargo may relocate test executables; install the client independently of their paths.
export DATASTUDIO_DATA="$RUNNER_TEMP/datastudio-oracle-contract"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

sudo apt-get update -qq
sudo apt-get install -y -qq libaio1t64
sudo ln -sf /usr/lib/x86_64-linux-gnu/libaio.so.1t64 /usr/lib/x86_64-linux-gnu/libaio.so.1
(
  cd "$repo_root/src-tauri"
  cargo test --no-default-features --features web,engines-all live_oracle_instant_client_download -- --ignored --nocapture
)

shopt -s nullglob
clients=("$DATASTUDIO_DATA/oracle"/instantclient_*)
if [[ ${#clients[@]} -ne 1 || ! -d "${clients[0]}" ]]; then
  echo "::error::Expected exactly one downloaded Oracle Instant Client directory."
  exit 1
fi
client="${clients[0]}"
for library in libclntsh.so libnnz.so; do
  if [[ ! -f "$client/$library" ]]; then
    echo "::error::Oracle Instant Client is missing $library in $client."
    exit 1
  fi
done

# Linux's loader needs this path before the contract test process starts.
printf 'DATASTUDIO_DATA=%s\nLD_LIBRARY_PATH=%s\n' \
  "$DATASTUDIO_DATA" "$client${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" >> "$GITHUB_ENV"
