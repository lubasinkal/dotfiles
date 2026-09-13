# Bootstrap OMZ on fresh devices
export ZSH="${ZSH:-$HOME/.oh-my-zsh}"
if [[ ! -f "$ZSH/oh-my-zsh.sh" ]]; then
  git clone --depth 1 https://github.com/ohmyzsh/ohmyzsh.git "$ZSH" 2>/dev/null
fi
# Bootstrap custom plugins if missing
for p in zsh-autosuggestions zsh-syntax-highlighting; do
  [[ -d "$ZSH/custom/plugins/$p" ]] || git clone --depth 1 "https://github.com/zsh-users/$p" "$ZSH/custom/plugins/$p" 2>/dev/null
done
unset p

ZSH_THEME=""
DISABLE_AUTO_UPDATE="false"
DISABLE_UPDATE_PROMPT="true"
COMPLETION_WAITING_DOTS="true"

plugins=(git gh eza mise docker bun fzf zsh-autosuggestions zsh-syntax-highlighting)
source "$ZSH/oh-my-zsh.sh"

# History — drop failed commands (exit != 0)
HISTSIZE=50000; SAVEHIST=50000; HISTFILE="$HOME/.zsh_history"
setopt share_history inc_append_history hist_ignore_all_dups hist_ignore_space hist_reduce_blanks hist_verify hist_expire_dups_first
export HISTORY_IGNORE="(&|[bf]g|c|clear|history|exit|q|pwd|* --help)"
autoload -Uz add-zsh-hook
_zsh_no_failed() { local r=$?; ((r==0)) && return; local f="${HISTFILE:-$HOME/.zsh_history}" t; t=$(mktemp); head -n -1 "$f" >"$t" 2>/dev/null && mv "$t" "$f" && fc -R "$f" 2>/dev/null || rm -f "$t"; }
add-zsh-hook precmd _zsh_no_failed

# Prompt & tools — all guarded
(( $+commands[starship] )) && eval "$(starship init zsh)"
alias c='clear'
(( $+commands[bun] )) && alias bunupdate='(cd ~/.bun/install/global && bun update --latest)'
[[ -s "$HOME/.bun/_bun" ]] && source "$HOME/.bun/_bun"
(( $+commands[zoxide] )) && eval "$(zoxide init zsh)"
[[ -r "$HOME/.atuin/bin/env" ]] && { source "$HOME/.atuin/bin/env"; (( $+commands[atuin] )) && eval "$(atuin init zsh --disable-ctrl-r)"; }
(( $+commands[fzf] )) && eval "$(fzf --zsh)" 2>/dev/null
[[ -r "$HOME/.config/opencode/secrets.sh" ]] && source "$HOME/.config/opencode/secrets.sh"
[[ -r /usr/share/doc/pkgfile/command-not-found.zsh ]] && source /usr/share/doc/pkgfile/command-not-found.zsh 2>/dev/null || true
