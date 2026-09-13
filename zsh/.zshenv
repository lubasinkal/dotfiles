# .zshenv — sourced for ALL shells (login, non-login, scripts).
# Keep minimal and fast; no output, no interactive-only setup.

# Deduplicating prepend helper (needed for PATH below).
_zsh_path_prepend() { case ":$PATH:" in *":$1:"*) ;; *) export PATH="$1:$PATH" ;; esac; }

_zsh_path_prepend "$HOME/.local/bin"
_zsh_path_prepend "$HOME/.bun/bin"
_zsh_path_prepend "$HOME/.local/share/pi-node/node-v22.23.2-linux-x64/bin"

export QT_QPA_PLATFORMTHEME=kvantum
