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

# Completion definitions must land in fpath before compinit scans it.
zinit light zsh-users/zsh-completions

# Initialize completions before loading plugins.
autoload -Uz compinit
compinit

# Prompt
zinit light romkatv/powerlevel10k
[[ ! -f "$HOME/.p10k.zsh" ]] || source "$HOME/.p10k.zsh"

HISTSIZE=50000
SAVEHIST=50000
HISTFILE="$HOME/.zsh_history"

# History behavior
setopt share_history
setopt hist_ignore_dups
setopt hist_ignore_space
setopt no_beep

export HISTORY_IGNORE="(&|[bf]g|c|clear|history|exit|q|pwd|* --help)"

bindkey -v
bindkey '^p' history-search-backward
bindkey '^n' history-search-forward

alias c='clear'
alias reload='exec zsh'

if (( $+commands[nvim] )); then
  export EDITOR='nvim'
  export VISUAL='nvim'
  alias v='nvim'
fi

# Launch Yazi; `q` exits into the directory you were viewing.
if (( $+commands[yazi] )); then
  function y() {
    local tmp cwd
    tmp="$(mktemp -t yazi-cwd.XXXXXX)"
    yazi "$@" --cwd-file="$tmp"
    if cwd="$(command cat -- "$tmp")" && [[ -n "$cwd" && "$cwd" != "$PWD" ]]; then
      builtin cd -- "$cwd"
    fi
    command rm -f -- "$tmp"
  }
fi

if (( $+commands[bun] )); then
  alias bunupdate='(cd ~/.bun/install/global && bun update --latest)'
fi

if [[ -s "$HOME/.bun/_bun" ]]; then
  source "$HOME/.bun/_bun"
fi

if (( $+commands[zoxide] )); then
  unalias zi 2>/dev/null  # zinit defines `zi`, freeing it for zoxide's interactive jump
  eval "$(zoxide init zsh)"
fi

if (( $+commands[fzf] )); then
  eval "$(fzf --zsh)" 2>/dev/null
fi

# Completion matching and colors.
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
zstyle ':completion:*' menu no
zstyle ':completion:*' list-colors ${(s.:.)LS_COLORS}
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'ls --color $realpath'
zstyle ':fzf-tab:complete:__zoxide_z:*' fzf-preview 'ls --color $realpath'

# fzf-tab must load before plugins that wrap completion widgets.
zinit light Aloxaf/fzf-tab

# Fish-like autosuggestions (ghost text), then syntax highlighting last.
zinit light zsh-users/zsh-autosuggestions
ZSH_AUTOSUGGEST_STRATEGY=('history' 'completion')
ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE='fg=8'

zinit light zsh-users/zsh-syntax-highlighting
