#
# ~/.bashrc
#

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

alias ls='ls --color=auto'
alias grep='grep --color=auto'
alias c='clear'
alias reload='source ~/.bashrc'
# PS1='[\u@\h \W]\$ '
eval "$(zoxide init bash)"
eval "$(starship init bash)"
# source -- ~/.local/share/blesh/ble.sh


# uv
export PATH="$HOME/.local/bin:$PATH"
# bun
export PATH="$HOME/.bun/bin:$PATH"
