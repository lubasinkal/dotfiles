#!/usr/bin/env bash
# Preview and stow every dotfiles package into $HOME.
# Usage:
#   ./install.sh           preview and install all packages
#   ./install.sh --delete  preview and remove all package links
set -euo pipefail

cd "$(dirname "$0")"

usage() {
  echo "Usage: $0 [--delete]" >&2
}

action="restow"
case "$#" in
  0) ;;
  1)
    if [[ "$1" == "--delete" ]]; then
      action="delete"
    else
      usage
      exit 2
    fi
    ;;
  *)
    usage
    exit 2
    ;;
esac

packages=()
for path in */; do
  [[ -d "$path" ]] || continue
  packages+=("${path%/}")
done

if ((${#packages[@]} == 0)); then
  echo "No Stow packages found." >&2
  exit 1
fi

run_stow() {
  local package
  for package in "${packages[@]}"; do
    echo "==> stow --$action $package"
    stow "--$action" "$@" "$package"
  done
}

echo "Plan: $([[ "$action" == restow ]] && echo 'restow' || echo 'delete') ${packages[*]} into $HOME"
echo "Preview (no files will be changed):"
run_stow --simulate

if [[ ! -t 0 ]]; then
  echo "Refusing to make changes without an interactive confirmation." >&2
  exit 1
fi

if [[ "$action" == delete ]]; then
  read -r -p 'Type DELETE to remove these Stow links: ' confirmation
  [[ "$confirmation" == DELETE ]] || { echo "Cancelled."; exit 1; }
else
  read -r -p 'Apply this plan? [y/N] ' confirmation
  [[ "$confirmation" == [yY] || "$confirmation" == [yY][eE][sS] ]] || { echo "Cancelled."; exit 1; }
fi

run_stow

echo "Dotfiles linked successfully."

echo "==> Linking pi extension test deps"
pi_version_file="$HOME/.pi/agent/install/current-version"
if [[ -f "$pi_version_file" ]]; then
  read -r pi_version < "$pi_version_file"
  pi_modules="$HOME/.pi/agent/install/releases/$pi_version/node_modules"
  if [[ -d "$pi_modules" ]]; then
    ln -sfn "$pi_modules" "$HOME/.pi/agent/node_modules"
    echo "    ~/.pi/agent/node_modules -> $pi_modules (for node test-*.ts)"
  else
    echo "    skipped: $pi_modules is missing" >&2
  fi
fi

echo "==> Initializing Git submodules"
git submodule update --init --recursive

tpm_dir="$HOME/.config/tmux/plugins/tpm"
if [[ -d "$tpm_dir/.git" ]]; then
  echo "==> TPM already installed at $tpm_dir"
else
  echo "==> Installing TPM"
  mkdir -p "${tpm_dir%/*}"
  git clone https://github.com/tmux-plugins/tpm "$tpm_dir"
fi

echo "Setup complete. Create ~/.config/opencode/secrets.sh manually if you use Opencode secrets."
