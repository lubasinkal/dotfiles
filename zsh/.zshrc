# Portable + fast: every dep guarded.

# History.
HISTSIZE=50000
SAVEHIST=50000
HISTFILE="$HOME/.zsh_history"
setopt share_history hist_ignore_all_dups hist_ignore_space hist_reduce_blanks hist_verify
export HISTORY_IGNORE="(&|[bf]g|c|clear|history|exit|q|pwd|* --help)"

# System plugins (Arch path).
[[ -r /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh ]] && \
  source /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
[[ -r /usr/share/zsh/plugins/zsh-history-substring-search/zsh-history-substring-search.zsh ]] && \
  source /usr/share/zsh/plugins/zsh-history-substring-search/zsh-history-substring-search.zsh
[[ -r /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]] && \
  source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
[[ -r /usr/share/doc/pkgfile/command-not-found.zsh ]] && \
  source /usr/share/doc/pkgfile/command-not-found.zsh

# fzf key bindings + completion.
(( $+commands[fzf] )) && eval "$(fzf --zsh)" 2>/dev/null

# Prompt.
(( $+commands[starship] )) && eval "$(starship init zsh)"

_zsh_path_prepend() { case ":$PATH:" in *":$1:"*) ;; *) export PATH="$1:$PATH" ;; esac; }
_zsh_path_prepend "$HOME/.local/bin"
_zsh_path_prepend "$HOME/.bun/bin"

alias c='clear'
alias make='make -j$(nproc)'
alias ninja='ninja -j$(nproc)'
alias n='ninja'
(( $+commands[bun] )) && alias bunupdate='(cd ~/.bun/install/global && bun update --latest)'

[[ -s "$HOME/.bun/_bun" ]] && source "$HOME/.bun/_bun"
(( $+commands[zoxide] )) && eval "$(zoxide init zsh)"
if [[ -r "$HOME/.atuin/bin/env" ]]; then
  . "$HOME/.atuin/bin/env"
  (( $+commands[atuin] )) && eval "$(atuin init zsh)"
fi
[[ -r "$HOME/.config/opencode/secrets.sh" ]] && source "$HOME/.config/opencode/secrets.sh"
