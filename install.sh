#!/usr/bin/env bash
# Stow every package in this repo into $HOME.
# Usage:
#   ./install.sh           restow all packages
#   ./install.sh --delete  unstow all packages
set -euo pipefail

cd "$(dirname "$0")"

action="restow"
if [[ "${1:-}" == "--delete" ]]; then
  action="delete"
fi

for pkg in */; do
  pkg="${pkg%/}"

  echo "==> stow --$action $pkg"
  stow "--$action" "$pkg"
done

echo "Done. Don't forget:"
echo "  - git submodule update --init --recursive   (nvim, doom)"
echo "  - clone TPM: git clone https://github.com/tmux-plugins/tpm ~/.config/tmux/plugins/tpm"
