# Portable + fast: every dep guarded.

# History.
HISTSIZE=50000
HISTFILESIZE=50000
HISTFILE="$HOME/.bash_history"
HISTCONTROL=ignoreboth:erasedups
HISTIGNORE='&:bg:fg:c:clear:history:exit:q:pwd:* --help'
shopt -s histappend checkwinsize cmdhist

# pkgfile command-not-found (Arch path).
[[ -r /usr/share/doc/pkgfile/command-not-found.bash ]] && \
  source /usr/share/doc/pkgfile/command-not-found.bash

# fzf key bindings + completion.
command -v fzf >/dev/null && eval "$(fzf --bash)" 2>/dev/null

# Prompt.
command -v starship >/dev/null && eval "$(starship init bash)"

_bash_path_prepend() { case ":$PATH:" in *":$1:"*) ;; *) export PATH="$1:$PATH" ;; esac; }
_bash_path_prepend "$HOME/.local/bin"
_bash_path_prepend "$HOME/.bun/bin"

alias c='clear'
alias make='make -j$(nproc)'
alias ninja='ninja -j$(nproc)'
alias n='ninja'
command -v bun >/dev/null && alias bunupdate='(cd ~/.bun/install/global && bun update --latest)'

command -v zoxide >/dev/null && eval "$(zoxide init bash)"
if [[ -r "$HOME/.atuin/bin/env" ]]; then
  . "$HOME/.atuin/bin/env"
  command -v atuin >/dev/null && eval "$(atuin init bash)"
fi
[[ -r "$HOME/.config/opencode/secrets.sh" ]] && source "$HOME/.config/opencode/secrets.sh"
