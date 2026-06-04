# Dotfiles

Managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Structure

Each directory in this repository represents a "package" that can be stowed into your home directory. The internal structure of each package mirrors the path in your home directory.

- `bash/`: Contains `.bashrc`, `.bash_profile`, etc.
- `doom/`: A git submodule containing `.config/doom/`.
- `git/`: Contains `.gitconfig`.
- `ghostty/`: Contains `.config/ghostty/`.
- `nvim/`: A git submodule containing `.config/nvim/`.
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
   mv ~/.config/tmux ~/dotfiles/tmux/.config/
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

## Deployment (New Machine)

To set up these dotfiles on a new machine:

1. Install `stow` and `git`.
2. Clone this repository recursively (to include submodules):
   ```bash
   git clone --recursive <your-dotfiles-repo-url> ~/dotfiles
   ```
3. Stow each package:
   ```bash
   cd ~/dotfiles
   stow bash doom git ghostty nvim starship walker wezterm zsh
   ```

## Workflow Tip

Always make sure the files are moved to the `dotfiles` directory *before* running `stow`, or `stow` will try to symlink files that don't exist or might cause conflicts.
