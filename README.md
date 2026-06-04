# Dotfiles

Managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Structure

Each directory in this repository represents a "package" that can be stowed into your home directory. The internal structure of each package mirrors the path in your home directory.

- `bash/`: Contains `.bashrc`, `.bash_profile`, etc.
- `git/`: Contains `.gitconfig`.
- `ghostty/`: Contains `.config/ghostty/`.
- `nvim/`: Contains `.config/nvim/`.
- `starship/`: Contains `.config/starship.toml`.
- `walker/`: Contains `.config/walker/`.
- `wezterm/`: Contains `.wezterm.lua`.
- `zsh/`: Contains `.zshrc`.

## How to use

### To add a new tool (e.g., `tmux`)

1. Create a new directory for the tool:
   ```bash
   mkdir -p tmux/.config/tmux
   ```
2. Move your existing config files into that directory:
   ```bash
   mv ~/.config/tmux ~/.config/tmux ~/dotfiles/tmux/.config/
   ```
3. Stow the new package:
   ```bash
   cd ~/dotfiles
   stow tmux
   ```

### To remove a tool

1. Unstow the package:
   ```bash
   cd ~/dotfiles
   stow -D tmux
   ```
2. (Optional) Delete the directory in `dotfiles` if you no longer want to manage it.

## Workflow Tip

Always make sure the files are moved to the `dotfiles` directory *before* running `stow`, or `stow` will try to symlink files that don't exist or might cause conflicts.
