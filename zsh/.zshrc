# Portable + fast: every dep guarded, self-contained plugins pre-compiled to bytecode.
[[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]] && \
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"

_zsh_zwc_dir="${XDG_CACHE_HOME:-$HOME/.cache}/zsh-zwc"
_zsh_zwc_source() {
  local src="$1" dst
  [[ -r "$src" ]] || return 0
  mkdir -p "$_zsh_zwc_dir" 2>/dev/null || return 0
  dst="$_zsh_zwc_dir/$(basename "$src")"
  if [[ ! -r "$dst" || "$src" -nt "$dst" ]]; then
    cp -f "$src" "$dst" 2>/dev/null && zcompile "$dst" 2>/dev/null
  fi
  source "$dst"
}

if [[ -r /usr/share/oh-my-zsh/oh-my-zsh.sh ]]; then
  export ZSH=/usr/share/oh-my-zsh
  plugins=(git fzf extract)
  _zsh_zwc_source /usr/share/oh-my-zsh/oh-my-zsh.sh
  _zsh_zwc_source /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
  _zsh_zwc_source /usr/share/zsh/plugins/zsh-history-substring-search/zsh-history-substring-search.zsh
  [[ -r /usr/share/zsh-theme-powerlevel10k/powerlevel10k.zsh-theme ]] && \
    source /usr/share/zsh-theme-powerlevel10k/powerlevel10k.zsh-theme
  [[ -r /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]] && \
    source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
  [[ -r /usr/share/doc/pkgfile/command-not-found.zsh ]] && \
    source /usr/share/doc/pkgfile/command-not-found.zsh
  export FZF_BASE=/usr/share/fzf
fi

export HISTCONTROL=ignoreboth
export HISTORY_IGNORE="(\&|[bf]g|c|clear|history|exit|q|pwd|* --help)"
export PROMPT_COMMAND="history -a; ${PROMPT_COMMAND:-}"

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
[[ -r "$HOME/.p10k.zsh" ]] && source "$HOME/.p10k.zsh"
