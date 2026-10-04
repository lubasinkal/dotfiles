# Dotfiles

Managed with [GNU Stow](https://www.gnu.org/software/stow/). Each top-level directory is a "package" whose internal structure mirrors your home directory.

## Packages

| Package | Contents |
|---|---|
| `doom/` | `.config/doom/` — Doom Emacs config (git submodule → [lubasinkal/doom](https://github.com/lubasinkal/doom)) |
| `ghostty/` | `.config/ghostty/` — terminal emulator config + theme |
| `git/` | `.gitconfig` |
| `herdr/` | `.config/herdr/config.toml` — agent multiplexer config |
| `niri/` | `.config/niri/config.kdl` — Wayland compositor config |
| `nvim/` | `.config/nvim/` — Neovim config (git submodule → [lubasinkal/nvim](https://github.com/lubasinkal/nvim)) |
| `opencode/` | `.config/opencode/opencode.json` — global opencode config (MCP servers, LSP) |
| `pi/` | `.pi/` — pi coding agent configuration (agents, extensions, prompts) |
| `starship/` | `.config/starship.toml` |
| `tmux/` | `.config/tmux/tmux.conf` — Vesper-inspired theme, vim navigation, TPM plugins |
| `vicinae/` | `.config/vicinae/settings.json` + themes — launcher |
| `zsh/` | `.zshrc` |

## Install

On a new machine:

```bash
git clone --recursive https://github.com/lubasinkal/dotfiles.git ~/dotfiles
cd ~/dotfiles
./install.sh
```

The script previews every package before changing anything and asks you to confirm. To undo the links, run `./install.sh --delete` and type `DELETE` at the confirmation prompt.

If the preview reports a conflict, a real file already exists at the target path — move or back it up first, then re-run. The installer only manages dotfile links; it does not install system packages or applications.

After Stow succeeds, the installer initializes Git submodules and installs TPM if it is not already present. To install tmux plugins, open tmux and press prefix (Ctrl-b) + Shift-i.

If you use Opencode secrets, create the untracked `~/.config/opencode/secrets.sh` file with your real values. `.zshrc` sources it automatically if present. Sensitive values in `opencode.json` are referenced as `{env:VAR}` placeholders.

## Adding a new tool

1. Move its config into a new package, mirroring the home path:
   ```bash
   mkdir -p tool/.config/tool
   mv ~/.config/tool/* tool/.config/tool/
   ```
2. Stow it:
   ```bash
   cd ~/dotfiles && stow tool
   ```

To remove one: `stow -D tool`, then delete the directory if desired.
