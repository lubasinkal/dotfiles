# Keep near the top; put anything that prompts for input above this block.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# Install Zinit on first run.
ZINIT_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/zinit/zinit.git"
if [[ ! -d "$ZINIT_HOME/.git" ]]; then
  mkdir -p "${ZINIT_HOME:h}"
  git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
fi
source "$ZINIT_HOME/zinit.zsh"

# Initialize completions before loading plugins.
autoload -Uz compinit
compinit

# Prompt
zinit light romkatv/powerlevel10k
[[ ! -f "$HOME/.p10k.zsh" ]] || source "$HOME/.p10k.zsh"

# Autosuggestions
export DEJA_CYCLE_KEY=''
zinit ice wait"0" lucid depth=1 pick"deja.plugin.zsh"
zinit light Giammarco-Ferranti/deja

zinit snippet OMZP::bun
zinit snippet OMZP::git

HISTSIZE=50000
SAVEHIST=50000
HISTFILE="$HOME/.zsh_history"

# History behavior
setopt share_history
setopt hist_ignore_dups
setopt hist_expire_dups_first
setopt hist_find_no_dups
setopt hist_reduce_blanks
setopt no_beep

export HISTORY_IGNORE="(&|[bf]g|c|clear|history|exit|q|pwd|* --help)"

bindkey -v
bindkey '^p' history-search-backward
bindkey '^n' history-search-forward
bindkey '^[w' kill-region

alias c='clear'
alias reload='exec zsh'

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

# Completion matching and colors.
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
zstyle ':completion:*' menu no
zstyle ':completion:*' list-colors ${(s.:.)LS_COLORS}

# Load syntax highlighting after completion plugins.
zinit light Aloxaf/fzf-tab
zinit light zsh-users/zsh-syntax-highlighting

if [[ -r "$HOME/.config/opencode/secrets.sh" ]]; then
  source "$HOME/.config/opencode/secrets.sh"
fi

if [[ -r /usr/share/doc/pkgfile/command-not-found.zsh ]]; then
  source /usr/share/doc/pkgfile/command-not-found.zsh 2>/dev/null
fi

# Configure the prompt with `p10k configure` or edit ~/.p10k.zsh.
