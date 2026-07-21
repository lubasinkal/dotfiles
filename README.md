# Dotfiles

Managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Structure

Each directory in this repository represents a "package" that can be stowed into your home directory. The internal structure of each package mirrors the path in your home directory.

- `bash/`: Contains `.bashrc`, `.bash_profile`, etc.
- `doom/`: A git submodule containing `.config/doom/`.
- `git/`: Contains `.gitconfig`.
- `ghostty/`: Contains `.config/ghostty/`.
- `herdr/`: Contains `.config/herdr/` — agent multiplexer config.
- `nvim/`: A git submodule containing `.config/nvim/`.
- `pi/`: Contains `.pi/` — opencode agent configurations.
- `starship/`: Contains `.config/starship.toml`.
- `tmux/`: Contains `.config/tmux/tmux.conf` — opinionated config with Vesper-inspired theme, mouse support, vim-style navigation, and TPM plugin manager.
- `vim/`: Contains `.vimrc` — minimal Vim config inspired by nvim.
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
   stow bash doom git ghostty herdr nvim pi starship tmux vim walker wezterm zsh
   ```

## Tmux Setup

After stowing, the config references [TPM (Tmux Plugin Manager)](https://github.com/tmux-plugins/tpm) for plugins. On a new machine:

```bash
# Clone TPM
git clone https://github.com/tmux-plugins/tpm ~/.config/tmux/plugins/tpm

# Start tmux and install plugins (prefix + I, capital i)
tmux
# Then press: Ctrl-b, then Shift-i
```

## Workflow Tip

Always make sure the files are moved to the `dotfiles` directory *before* running `stow`, or `stow` will try to symlink files that don't exist or might cause conflicts.
