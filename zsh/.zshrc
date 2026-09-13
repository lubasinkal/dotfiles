# Oh My Zsh — https://ohmyz.sh

export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME=""  # starship handles prompt

# OMZ behavior
DISABLE_AUTO_UPDATE="false"
DISABLE_UPDATE_PROMPT="true"
COMPLETION_WAITING_DOTS="true"
HIST_STAMPS="yyyy-mm-dd"

# Plugins — keep lean, starship/zoxide/atuin/fzf handle the rest outside OMZ
plugins=(
  git
  gh
  eza
  mise
  docker
  bun
  zsh-autosuggestions
  zsh-syntax-highlighting
  fzf
)

# fzf-tab must be after syntax-highlighting if cloned as OMZ custom plugin
# Ensure custom plugins exist (clone on first run)
[[ ! -d "$ZSH/custom/plugins/fzf-tab" ]] && git clone --depth 1 https://github.com/Aloxaf/fzf-tab "$ZSH/custom/plugins/fzf-tab" 2>/dev/null

source "$ZSH/oh-my-zsh.sh"

# --- Completion cache (OMZ already called compinit; ensure cached dump) ---
# OMZ's compinit is fine; no duplicate call needed.

# --- History (OMZ sets some, we enforce) ---
HISTSIZE=50000
SAVEHIST=50000
HISTFILE="$HOME/.zsh_history"
setopt share_history inc_append_history hist_ignore_all_dups hist_ignore_space hist_reduce_blanks hist_verify hist_expire_dups_first
# Don't persist failed commands (non-zero exit) — handled via precmd hook below
export HISTORY_IGNORE="(&|[bf]g|c|clear|history|exit|q|pwd|* --help)"

# Remove failed commands (exit != 0) from history — zshaddhistory can't see exit code, so use precmd
autoload -Uz add-zsh-hook
_zsh_hist_remove_failed() {
  local ret=$?
  (( ret == 0 )) && return
  local histfile="${HISTFILE:-$HOME/.zsh_history}"
  [[ -f "$histfile" ]] || return
  # Drop last line from HISTFILE (just-executed failed command) and reload
  local tmp=$(mktemp)
  head -n -1 "$histfile" > "$tmp" 2>/dev/null && mv "$tmp" "$histfile" && fc -R "$histfile" 2>/dev/null || rm -f "$tmp"
}
add-zsh-hook precmd _zsh_hist_remove_failed

# --- Prompt & tools ---
(( $+commands[starship] )) && eval "$(starship init zsh)"

alias c='clear'
(( $+commands[bun] )) && alias bunupdate='(cd ~/.bun/install/global && bun update --latest)'

[[ -s "$HOME/.bun/_bun" ]] && source "$HOME/.bun/_bun"
(( $+commands[zoxide] )) && eval "$(zoxide init zsh)"
if [[ -r "$HOME/.atuin/bin/env" ]]; then
  . "$HOME/.atuin/bin/env"
  (( $+commands[atuin] )) && eval "$(atuin init zsh --disable-ctrl-r)"
fi
(( $+commands[fzf] )) && eval "$(fzf --zsh)" 2>/dev/null
[[ -r "$HOME/.config/opencode/secrets.sh" ]] && source "$HOME/.config/opencode/secrets.sh"

# Env (PATH, QT_QPA_PLATFORMTHEME) lives in .zshenv.
# pkgfile command-not-found handled by OMZ plugin + fallback
[[ -r /usr/share/doc/pkgfile/command-not-found.zsh ]] && source /usr/share/doc/pkgfile/command-not-found.zsh 2>/dev/null || true
