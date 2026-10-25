# History.
HISTSIZE=50000
HISTFILESIZE=50000
HISTFILE="$HOME/.bash_history"
HISTCONTROL=ignoreboth:erasedups
HISTIGNORE='&:bg:fg:c:clear:history:exit:q:pwd:* --help'
shopt -s histappend checkwinsize cmdhist autocd

# Prompt (starship optional; plain fallback).
if command -v starship >/dev/null; then
  eval "$(starship init bash)"
else
  PS1='[\u@\h \W]\$ '
fi

_bash_path_prepend() { case ":$PATH:" in *":$1:"*) ;; *) export PATH="$1:$PATH" ;; esac; }
_bash_path_prepend "$HOME/.local/bin"
_bash_path_prepend "$HOME/.bun/bin"

alias ls='ls --color=auto'
alias grep='grep --color=auto'
alias c='clear'
command -v bun >/dev/null && alias bunupdate='(cd ~/.bun/install/global && bun update --latest)'
command -v zoxide >/dev/null && eval "$(zoxide init bash)"
command -v fzf >/dev/null && eval "$(fzf --bash)" 2>/dev/null
