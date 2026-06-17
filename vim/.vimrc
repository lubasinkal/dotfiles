" ============================================================================
" ~/.vimrc — Clean & Improved Minimal Vim Configuration
" ============================================================================

" ---- Leader ----------------------------------------------------------------
let mapleader = ' '
let maplocalleader = ' '

" ---- General ---------------------------------------------------------------
set nocompatible
filetype plugin indent on
syntax enable

" Create necessary directories
let s:vimdir = expand('~/.vim')
if !isdirectory(s:vimdir)
    call mkdir(s:vimdir, 'p')
endif
if !isdirectory(s:vimdir . '/undo')
    call mkdir(s:vimdir . '/undo', 'p')
endif

" ---- Options ---------------------------------------------------------------
" UI
set number relativenumber
set signcolumn=yes
set cursorline
set scrolloff=10
set sidescrolloff=8
set splitright splitbelow
set showcmd
set laststatus=2
set ruler
set list
set listchars=tab:»\ ,trail:·,nbsp:␣
set fillchars=eob:\ ,diff:╱,fold:\ 

" Indentation
set tabstop=4 shiftwidth=4 softtabstop=4 expandtab
set breakindent
set formatoptions-=cro

" Editing
set hidden
set confirm
set autoread
set noswapfile
set undofile
set undodir=~/.vim/undo//
set virtualedit=block
set updatetime=200
set timeoutlen=300
set ttimeoutlen=0

" Search
set ignorecase smartcase
set hlsearch incsearch

" Completion
set completeopt=menu,menuone,noselect
set pumheight=10
set wildmode=longest:full,full
set wildoptions=pum
set wildignore=*.o,*.obj,*.pyc,*.class,*.swp,*.bak,*.cache

" Clipboard & Conceal
set clipboard=unnamedplus
set conceallevel=2
set concealcursor=nc

" Misc
set synmaxcol=300
set whichwrap+=<,>,[,],h,l
set iskeyword+=-,_

" Grep with ripgrep if available
if executable('rg')
    set grepprg=rg\ --vimgrep\ --no-heading\ --smart-case
    set grepformat=%f:%l:%c:%m,%f:%l:%m
endif

" ---- Appearance ------------------------------------------------------------
highlight Normal ctermbg=NONE guibg=NONE
highlight SignColumn ctermbg=NONE guibg=NONE

" ---- Keymaps ---------------------------------------------------------------
nnoremap ; :

" Better escape
nnoremap <silent> <Esc> :nohlsearch<CR><Esc>

" Window navigation
nnoremap <C-h> <C-w>h
nnoremap <C-j> <C-w>j
nnoremap <C-k> <C-w>k
nnoremap <C-l> <C-w>l

" Move lines
nnoremap <A-j> :m .+1<CR>==
nnoremap <A-k> :m .-2<CR>==
vnoremap <A-j> :m '>+1<CR>gv=gv
vnoremap <A-k> :m '<-2<CR>gv=gv

" Visual mode improvements
vnoremap < <gv
vnoremap > >gv
xnoremap p "_dP

" Quick actions
nnoremap <leader>w :w<CR>
nnoremap <leader>q :q<CR>
nnoremap <leader>b :ls<CR>:b<Space>

" Keyword search (fixed)
nnoremap K :grep! "\b<C-R><C-W>\b"<CR>:cwindow<CR>

" ---- Autocommands ----------------------------------------------------------
augroup vimrc_autocmds
    autocmd!

    " Highlight yanked text (fixed & robust)
    autocmd TextYankPost * call s:highlight_yank()

    " Center cursor in insert mode
    autocmd InsertEnter * norm! zz

    " Rebalance windows
    autocmd VimResized * wincmd =

    " Help in vertical split
    autocmd FileType help wincmd L

    " Smart cursorline
    autocmd WinEnter,BufWinEnter * setlocal cursorline
    autocmd WinLeave * setlocal nocursorline

    " Restore cursor position
    autocmd BufReadPost *
        \ if line("'\"") > 1 && line("'\"") <= line("$") |
        \   execute "normal! g`\"" |
        \ endif
augroup END

" ---- Yank Highlight Function (Fixed) --------------------------------------
function! s:highlight_yank() abort
    if v:event.operator !=# 'y' || empty(v:event.regcontents)
        return
    endif

    " Use marks '[ and '] which are more reliable across Vim versions
    let l:pos1 = getpos("'[")
    let l:pos2 = getpos("']")

    if l:pos1[1] == l:pos2[1]  " Single line
        let l:pat = '\%' . l:pos1[1] . 'l\%>' . (l:pos1[2] - 1) . 'c\%<' . (l:pos2[2] + 1) . 'c'
    else  " Multi-line
        let l:pat = '\%>' . (l:pos1[1] - 1) . 'l\%<' . (l:pos2[1] + 1) . 'l'
    endif

    let l:id = matchadd('IncSearch', l:pat, 101)
    call timer_start(250, {-> matchdelete(l:id)})
endfunction

" ---- Statusline ------------------------------------------------------------
set statusline=
set statusline+=%f\ %m%r%h
set statusline+=%=
set statusline+=%{&fileencoding?&fileencoding:&encoding}
set statusline+=\ \|\ 
set statusline+=%l:%-2v\ 
set statusline+=%p%%

" ---- Commands --------------------------------------------------------------
command! Q q
command! W w
