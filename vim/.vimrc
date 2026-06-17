" ============================================================================
" ~/.vimrc — Minimal Vim config inspired by nvim config
" ============================================================================

" ---- Leader ----
let mapleader = ' '
let maplocalleader = ' '

" ---- Options ---------------------------------------------------------------
set nocompatible
filetype plugin indent on
syntax enable

" UI
set number                        " Line numbers
set relativenumber                " Relative line numbers
set signcolumn=yes                " Always show sign column
set cursorline                    " Highlight current line
set scrolloff=10                  " Lines of context around cursor
set sidescrolloff=8
set splitright                    " Splits open to the right
set splitbelow                    " Splits open below
set showcmd                       " Show command in status line
set laststatus=2                  " Always show status line
set ruler                         " Show cursor position
set list                          " Show invisible characters
set listchars=tab:>\ ,trail:·    " Tab >, trailing spaces
set fillchars=eob:\ ,diff:╱      " Clean end-of-buffer, diff char

" Indentation
set tabstop=4
set shiftwidth=4
set softtabstop=4
set expandtab                     " Spaces over tabs
set breakindent                   " Continue indentation on wrapped lines
set formatoptions-=cro            " Don't auto-comment on Enter/O/o

" Editing
set hidden                        " Allow unsaved hidden buffers
set confirm                       " Ask instead of failing
set autoread                      " Auto-reload changed files
set noswapfile                    " No swap files
set undofile                      " Persistent undo
set undodir=~/.vim/undo//         " Undo directory
set virtualedit=block             " Free cursor in visual block mode
set updatetime=200                " Faster update for swap/status
set timeoutlen=300                " Timeout for mapped sequences
set ttimeoutlen=0                 " No delay after Esc in terminal

" Searching
set ignorecase                    " Case-insensitive search
set smartcase                     " ... unless uppercase used
set hlsearch                      " Highlight matches
set incsearch                     " Incremental search

" Completion
set completeopt=menu,menuone,noselect
set pumheight=10
set wildmode=longest:full,full
set wildoptions=pum
set wildignore=*.o,*.obj,*.pyc,*.class,*.swp,*.bak

" Clipboard
set clipboard=unnamedplus         " Use system clipboard

" Conceal (markdown etc.)
set conceallevel=2
set concealcursor=nc

" Misc
set synmaxcol=200                 " Don't highlight past 200 columns
set whichwrap+=<,>,[,],h,l       " Cursor wraps past line boundaries
set iskeyword+=-                  " Treat hyphen as part of word

" Grep via ripgrep (falls back to vim's grep)
if executable('rg')
  set grepprg=rg\ --vimgrep\ --no-heading\ --smart-case
  set grepformat=%f:%l:%c:%m
endif

" ---- Colorscheme -----------------------------------------------------------
" Transparent background
highlight Normal ctermbg=NONE guibg=NONE

" ---- Keymaps ---------------------------------------------------------------
" Semicolon as command-line shortcut
nnoremap ; :

" Escape clears search highlights
nnoremap <silent> <Esc> :nohlsearch<CR>

" Window navigation (Ctrl + hjkl)
nnoremap <C-h> <C-w><C-h>
nnoremap <C-j> <C-w><C-j>
nnoremap <C-k> <C-w><C-k>
nnoremap <C-l> <C-w><C-l>

" Move lines up/down (Alt + j/k)
nnoremap <A-j> :m .+1<CR>==
nnoremap <A-k> :m .-2<CR>==
vnoremap <A-j> :m '>+1<CR>gv=gv
vnoremap <A-k> :m '<-2<CR>gv=gv

" Keep visual selection on indent
vnoremap < <gv
vnoremap > >gv

" Paste without yanking replaced text (visual mode)
xnoremap p "_dP

" ---- Autocommands ----------------------------------------------------------
augroup vimrc
  autocmd!

  " Highlight yanked text for 200ms
  autocmd TextYankPost * call s:highlight_yank()

  " Center cursor on entering insert mode
  autocmd InsertEnter * normal! zz

  " Rebalance windows on terminal resize
  autocmd VimResized * redraw! | wincmd =

  " Open help in a vertical split
  autocmd FileType help wincmd L

  " Cursorline only in active window
  autocmd WinEnter,BufWinEnter * setlocal cursorline
  autocmd WinLeave * setlocal nocursorline

  " Enable cursorline when starting from the command line
  autocmd VimEnter * setlocal cursorline
augroup END

" ---- Yank Highlight Helper -------------------------------------------------
function! s:highlight_yank() abort
  " Only highlight yank operations
  if v:event.operator !=# 'y' || empty(v:event.regcontents)
    return
  endif
  let l:pos1 = getpos("'[")
  let l:pos2 = getpos("']")

  " Build a pattern covering the yanked region
  if l:pos1[1] == l:pos2[1]
    " Single-line yank
    let l:pat = '\%' . l:pos1[1] . 'l\%>' . (l:pos1[2] - 1) . 'c\%<' . (l:pos2[2] + 1) . 'c'
  else
    " Multi-line yank
    let l:pat = '\%>' . (l:pos1[1] - 1) . 'l\%<' . (l:pos2[1] + 1) . 'l'
  endif

  let l:id = matchadd('IncSearch', l:pat, 101)
  call timer_start(200, { -> matchdelete(l:id) })
endfunction

" ---- Statusline (minimal, matches mini.statusline) -------------------------
set statusline=%f\ %m\ %=%l:%-2v\ %p%%

" ---- Convenience -----------------------------------------------------------
" Remember cursor position when reopening files
autocmd BufReadPost *
  \ if line("'\"") > 1 && line("'\"") <= line("$") |
  \   execute "normal! g`\"" |
  \ endif

" ---- Trusted projects ------------------------------------------------------
" By default, vim uses ~/.vim/viminfo for viminfo. Ensure that directory
" exists so that the command history, marks, etc. are preserved.
if !isdirectory($HOME . '/.vim')
  call mkdir($HOME . '/.vim', 'p')
endif
if !isdirectory($HOME . '/.vim/undo')
  call mkdir($HOME . '/.vim/undo', 'p')
endif
