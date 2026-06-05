-- wezterm.lua: Matches ghostty + walker "minimal" (slate-zinc + violet) aesthetic

local wezterm = require("wezterm")

local config = {}

-- Custom scheme mirrors the ghostty palette exactly.
-- Registered via config.color_schemes (the supported inline API).
config.color_schemes = {
    ["slate-violet"] = {
        foreground = "#fafafa",
        background = "#18181b",
        cursor_bg = "#a855f7",
        cursor_border = "#a855f7",
        cursor_fg = "#18181b",
        selection_bg = "#a855f7",
        selection_fg = "#18181b",
        ansi = {
            "#27272a", -- 0  black       (zinc-800)
            "#ef4444", -- 1  red         (red-500)
            "#22c55e", -- 2  green       (green-500)
            "#eab308", -- 3  yellow      (yellow-500)
            "#3b82f6", -- 4  blue        (blue-500)
            "#a855f7", -- 5  magenta     (violet-500 — accent)
            "#06b6d4", -- 6  cyan        (cyan-500)
            "#a1a1aa", -- 7  white       (zinc-400)
        },
        brights = {
            "#3f3f46", -- 8  bright black  (zinc-700)
            "#f87171", -- 9  bright red    (red-400)
            "#4ade80", -- 10 bright green  (green-400)
            "#facc15", -- 11 bright yellow (yellow-400)
            "#60a5fa", -- 12 bright blue   (blue-400)
            "#c084fc", -- 13 bright violet (violet-400 — selected text)
            "#22d3ee", -- 14 bright cyan   (cyan-400)
            "#d4d4d8", -- 15 bright white  (zinc-300)
        },
    },
}

-- ========= Appearance =========
config.color_scheme = "slate-violet"
config.colors = {
    cursor_bg = "#a855f7",
    cursor_border = "#a855f7",
    cursor_fg = "#18181b",
    selection_bg = "#a855f7",
    selection_fg = "#18181b",
    tab_bar = {
        background = "#18181b", -- matches ghostty background
        new_tab = {
            bg_color = "#18181b",
            fg_color = "#a1a1aa",
        },
        active_tab = {
            bg_color = "#27272a",       -- zinc-800 (walker zone tint)
            fg_color = "#c084fc",       -- violet-400 (selected-text accent)
            intensity = "Bold",
            underline = "Single",
            underline_color = "#a855f7",
        },
        inactive_tab = {
            bg_color = "#18181b",
            fg_color = "#71717a",       -- zinc-500 (subdued)
        },
        inactive_tab_hover = {
            bg_color = "#27272a",
            fg_color = "#a1a1aa",
        },
    },
}
config.command_palette_bg_color = "#18181b"
config.command_palette_rows = 10
config.font_family = "JetBrains Mono"
config.font_size = 13
config.window_background_opacity = 0.85
-- config.win32_system_backdrop = "Mica"
config.window_decorations = "TITLE"
config.hide_tab_bar_if_only_one_tab = true
config.use_fancy_tab_bar = false
config.tab_max_width = 25
config.window_padding = { left = 8, right = 8, top = 0, bottom = 0 }

-- ========= Cursor =========
config.default_cursor_style = "BlinkingBar"
-- ========= Behavior =========
config.automatically_reload_config = true
config.use_resize_increments = true
config.window_close_confirmation = "NeverPrompt"
config.inactive_pane_hsb = { saturation = 0.9, brightness = 0.6 }

-- ========= Launch Menu =========

local act = wezterm.action

config.keys = {
    -- Pane splitting
    { key = "d", mods = "ALT",  action = act.SplitHorizontal({ domain = "CurrentPaneDomain" }) },
    { key = "v", mods = "ALT",  action = act.SplitVertical({ domain = "CurrentPaneDomain" }) },
    -- Turn off the default ctrl+v "input the next character literally",
    -- because it works badly with the Windows Clipboard Manager Win+v.
    { key = "v", mods = "CTRL", action = wezterm.action.Nop },
    -- Pane navigation
    { key = "h", mods = "ALT",  action = act.ActivatePaneDirection("Left") },
    { key = "l", mods = "ALT",  action = act.ActivatePaneDirection("Right") },
    { key = "k", mods = "ALT",  action = act.ActivatePaneDirection("Up") },
    { key = "j", mods = "ALT",  action = act.ActivatePaneDirection("Down") },

    -- Tab management
    { key = "c", mods = "ALT",  action = act.SpawnTab("CurrentPaneDomain") },
    { key = "x", mods = "ALT",  action = act.CloseCurrentPane({ confirm = false }) },
    { key = "q", mods = "ALT",  action = act.CloseCurrentTab({ confirm = false }) },
    { key = "n", mods = "ALT",  action = act.ActivateTabRelative(1) },
    { key = "p", mods = "ALT",  action = act.ActivateTabRelative(-1) },

    -- Reload config
    { key = "r", mods = "ALT",  action = act.ReloadConfiguration },
}

-- No prompts on closing panes
wezterm.on("mux-is-process-stateful", function(_)
    return false
end)

return config
