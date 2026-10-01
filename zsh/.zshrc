# Bootstrap Oh My Zsh on fresh devices
export ZSH="${ZSH:-$HOME/.oh-my-zsh}"

if [[ ! -f "$ZSH/oh-my-zsh.sh" ]]; then
  git clone --depth 1 https://github.com/ohmyzsh/ohmyzsh.git "$ZSH" 2>/dev/null
fi

# Bootstrap custom plugins if missing
for plugin in zsh-autosuggestions zsh-syntax-highlighting; do
  if [[ ! -d "$ZSH/custom/plugins/$plugin" ]]; then
    git clone --depth 1 "https://github.com/zsh-users/$plugin" "$ZSH/custom/plugins/$plugin" 2>/dev/null
  fi
done

ZSH_THEME="refined"
DISABLE_AUTO_UPDATE="false"
DISABLE_UPDATE_PROMPT="true"
COMPLETION_WAITING_DOTS="true"

plugins=(
  git
  gh
  eza
  mise
  docker
  bun
  fzf
  zsh-autosuggestions
  zsh-syntax-highlighting
)

source "$ZSH/oh-my-zsh.sh"

# History
HISTSIZE=50000
SAVEHIST=50000
HISTFILE="$HOME/.zsh_history"

setopt share_history
setopt inc_append_history
setopt hist_ignore_all_dups
setopt hist_ignore_space
setopt hist_reduce_blanks
setopt hist_verify
setopt hist_expire_dups_first
setopt hist_save_no_dups
setopt hist_find_no_dups

export HISTORY_IGNORE="(&|[bf]g|c|clear|history|exit|q|pwd|* --help)"

# Key bindings
bindkey -e
bindkey '^p' history-search-backward
bindkey '^n' history-search-forward
bindkey '^[w' kill-region

# Remove failed commands from history
autoload -Uz add-zsh-hook

_zsh_no_failed() {
  local status=$?
  (( status == 0 )) && return

  local history_file="${HISTFILE:-$HOME/.zsh_history}"
  local temp_file
  temp_file=$(mktemp)

  if head -n -1 "$history_file" >"$temp_file" 2>/dev/null; then
    mv "$temp_file" "$history_file"
    fc -R "$history_file" 2>/dev/null
  else
    rm -f "$temp_file"
  fi
}

add-zsh-hook precmd _zsh_no_failed

# Prompt and tools
if (( $+commands[starship] )); then
  eval "$(starship init zsh)"
fi

alias c='clear'
alias reload='source ~/.zshrc'

if (( $+commands[bun] )); then
  alias bunupdate='(cd ~/.bun/install/global && bun update --latest)'
fi

if [[ -s "$HOME/.bun/_bun" ]]; then
  source "$HOME/.bun/_bun"
fi

if (( $+commands[zoxide] )); then
  eval "$(zoxide init --cmd cd zsh)"
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
zstyle ':completion:*' menu no

# Optional integrations
if [[ -r "$HOME/.config/opencode/secrets.sh" ]]; then
  source "$HOME/.config/opencode/secrets.sh"
fi

if [[ -r /usr/share/doc/pkgfile/command-not-found.zsh ]]; then
  source /usr/share/doc/pkgfile/command-not-found.zsh 2>/dev/null
fi

# bun completions
if [[ -s "$HOME/.bun/_bun" ]]; then
  source "$HOME/.bun/_bun"
fi
