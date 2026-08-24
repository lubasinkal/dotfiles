local wezterm = require("wezterm")
local config = wezterm.config_builder()
config.font = wezterm.font_with_fallback({
	{ family = "SpaceMono Nerd Font Mono", weight = "Regular" },
	"Symbols Nerd Font Mono",
})
config.wayland_window_background_blur = true
config.font_size = 14.0
config.window_background_opacity = 0.4
-- config.window_decorations = "RESIZE"
config.enable_scroll_bar = false
config.hide_tab_bar_if_only_one_tab = true
config.window_padding = {
	left = 0,
	right = 0,
	top = 0,
	bottom = 0,
}
return config
