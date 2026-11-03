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

# Live shared history (zshrc's share_history): flush ours each prompt, import other sessions'.
PROMPT_COMMAND="history -a; history -n${PROMPT_COMMAND:+;$PROMPT_COMMAND}"

# Keys — vi mode, silent bell, ^P/^N prefix history search, case-insensitive list-on-tab, coloured list.
set -o vi
bind 'set bell-style none'
bind -m vi-insert  '"\C-p":history-search-backward'
bind -m vi-insert  '"\C-n":history-search-forward'
bind -m vi-command '"\C-p":history-search-backward'
bind -m vi-command '"\C-n":history-search-forward'
bind 'set completion-ignore-case on'
bind 'set show-all-if-ambiguous on'
bind 'set colored-stats on'

# Editor (zshrc parity).
if command -v nvim >/dev/null; then
  export EDITOR=nvim VISUAL=nvim
  alias v='nvim'
fi

_bash_path_prepend() { case ":$PATH:" in *":$1:"*) ;; *) export PATH="$1:$PATH" ;; esac; }
_bash_path_prepend "$HOME/.local/bin"
_bash_path_prepend "$HOME/.bun/bin"

alias ls='ls --color=auto'
alias grep='grep --color=auto'
alias c='clear'
alias reload='exec bash'
command -v bun >/dev/null && alias bunupdate='(cd ~/.bun/install/global && bun update --latest)'

# Launch Yazi; `q` exits into the directory you were viewing.
if command -v yazi >/dev/null; then
  y() {
    local tmp cwd
    tmp="$(mktemp -t yazi-cwd.XXXXXX)"
    yazi "$@" --cwd-file="$tmp"
    if cwd="$(command cat -- "$tmp")" && [[ -n "$cwd" && "$cwd" != "$PWD" ]]; then
      builtin cd -- "$cwd"
    fi
    command rm -f -- "$tmp"
  }
fi
command -v zoxide >/dev/null && eval "$(zoxide init bash)"
command -v fzf >/dev/null && eval "$(fzf --bash)" 2>/dev/null   # native widgets (C-t/C-r/M-c) + **<Tab> completion
