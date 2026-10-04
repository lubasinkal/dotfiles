# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# Bootstrap Zinit if missing
ZINIT_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/zinit/zinit.git"
if [[ ! -d "$ZINIT_HOME/.git" ]]; then
  mkdir -p "${ZINIT_HOME:h}"
  git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
fi
source "$ZINIT_HOME/zinit.zsh"

# Powerlevel10k prompt
zinit light romkatv/powerlevel10k
[[ ! -f "$HOME/.p10k.zsh" ]] || source "$HOME/.p10k.zsh"

zinit light Giammarco-Ferranti/deja
zinit light zsh-users/zsh-syntax-highlighting

# History
HISTSIZE=50000
SAVEHIST=50000
HISTFILE="$HOME/.zsh_history"

# options
setopt append_history
setopt share_history
setopt hist_ignore_dups
setopt hist_expire_dups_first
setopt hist_find_no_dups
setopt hist_reduce_blanks
setopt no_beep
setopt inc_append_history

export HISTORY_IGNORE="(&|[bf]g|c|clear|history|exit|q|pwd|* --help)"

# Key bindings
bindkey -e
bindkey '^p' history-search-backward
bindkey '^n' history-search-forward
bindkey '^[w' kill-region

# Prompt and tools
alias c='clear'
alias reload='source ~/.zshrc'

if (( $+commands[bun] )); then
  alias bunupdate='(cd ~/.bun/install/global && bun update --latest)'
fi

if [[ -s "$HOME/.bun/_bun" ]]; then
  source "$HOME/.bun/_bun"
fi

if (( $+commands[zoxide] )); then
  eval "$(zoxide init zsh)"
fi

if [[ -r "$HOME/.atuin/bin/env" ]]; then
  source "$HOME/.atuin/bin/env"
  if (( $+commands[atuin] )); then
    eval "$(atuin init zsh --disable-ctrl-r)"
  fi
fi

if (( $+commands[fzf] )); then
  eval "$(fzf --zsh)" 2>/dev/null
fi

# Completion styling
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
zstyle ':completion:*' menu yes select

# Optional integrations
if [[ -r "$HOME/.config/opencode/secrets.sh" ]]; then
  source "$HOME/.config/opencode/secrets.sh"
fi

if [[ -r /usr/share/doc/pkgfile/command-not-found.zsh ]]; then
  source /usr/share/doc/pkgfile/command-not-found.zsh 2>/dev/null
fi

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh

