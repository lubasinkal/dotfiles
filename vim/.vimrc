" ============================================================================
" Minimal Vim Configuration — mirrors nvim setup
" ============================================================================

" ---- Leader ----------------------------------------------------------------
let mapleader = ' '
let maplocalleader = ' '

" ---- General ---------------------------------------------------------------
set nocompatible
filetype plugin indent on
syntax enable

let s:vimdir = expand('~/.vim')
if !isdirectory(s:vimdir)
    call mkdir(s:vimdir, 'p')
endif
if !isdirectory(s:vimdir . '/undo')
    call mkdir(s:vimdir . '/undo', 'p')
endif

" ---- Options ---------------------------------------------------------------
set number relativenumber
set signcolumn=yes
set cursorline
set scrolloff=10
set sidescrolloff=8
set splitright splitbelow
set list
set listchars=tab:\ \ ,trail:·
set fillchars=eob:\ ,diff:╱

set tabstop=4 shiftwidth=4 softtabstop=4 expandtab
set breakindent
set formatoptions-=cro

set confirm
set autoread
set noswapfile
set undofile
set undodir=~/.vim/undo//
set virtualedit=block
set updatetime=200
set timeoutlen=300
set ttimeoutlen=0

set ignorecase smartcase
set hidden

set completeopt=menu,menuone,noselect
set pumheight=10
set wildmode=longest:full,full
set wildoptions=pum

set clipboard=unnamedplus
set conceallevel=2
set concealcursor=nc

set synmaxcol=200
set whichwrap+=<,>,[,],h,l
set iskeyword+=-

if executable('rg')
    set grepprg=rg\ --vimgrep\ --no-heading\ --smart-case
    set grepformat=%f:%l:%c:%m
endif

" ---- Appearance ------------------------------------------------------------
highlight Normal ctermbg=NONE guibg=NONE
highlight SignColumn ctermbg=NONE guibg=NONE

" ---- Keymaps ---------------------------------------------------------------
nnoremap ; :

nnoremap <silent> <Esc> :nohlsearch<CR><Esc>

nnoremap <C-h> <C-w>h
nnoremap <C-j> <C-w>j
nnoremap <C-k> <C-w>k
nnoremap <C-l> <C-w>l

nnoremap <A-j> :m .+1<CR>==
nnoremap <A-k> :m .-2<CR>==
vnoremap <A-j> :m '>+1<CR>gv=gv
vnoremap <A-k> :m '<-2<CR>gv=gv

vnoremap < <gv
vnoremap > >gv
xnoremap p "_dP

nnoremap K :call <SID>grep_word()<CR>

function! s:grep_word() abort
    let l:word = expand('<cword>')
    if empty(l:word)
        return
    endif
    execute 'silent grep! "\b' . l:word . '\b"'
    cwindow
endfunction

" ---- Autocommands ----------------------------------------------------------
augroup vimrc_autocmds
    autocmd!

    autocmd TextYankPost * call s:highlight_yank()

    autocmd InsertEnter * norm! zz

    autocmd VimResized * wincmd =

    autocmd FileType help wincmd L

    autocmd WinEnter,BufWinEnter * setlocal cursorline
    autocmd WinLeave * setlocal nocursorline

    autocmd BufReadPost *
        \ if line("'\"") > 1 && line("'\"") <= line("$") |
        \   execute "normal! g`\"" |
        \ endif
augroup END

" ---- Yank Highlight --------------------------------------------------------
function! s:highlight_yank() abort
    if v:event.operator !=# 'y' || empty(v:event.regcontents)
        return
    endif

    let l:pos1 = getpos("'[")
    let l:pos2 = getpos("']")
    let l:id = 0

    if l:pos1[1] == l:pos2[1]
        let l:len = l:pos2[2] - l:pos1[2] + 1
        if l:len > 0
            let l:id = matchaddpos('IncSearch', [[l:pos1[1], l:pos1[2], l:len]], 101)
        endif
    else
        let l:first = max([line('w0'), l:pos1[1]])
        let l:last = min([line('w$'), l:pos2[1]])
        let l:pat = '\%>' . (l:first - 1) . 'l\%<' . (l:last + 1) . 'l'
        let l:id = matchadd('IncSearch', l:pat, 101)
    endif

    if l:id
        call timer_start(250, {-> matchdelete(l:id)})
    endif
endfunction
