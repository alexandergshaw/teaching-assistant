import { createTheme } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface CssThemeVariables {
    enabled: true;
  }
}

// Project-wide MUI theme with light and dark color schemes.
// Maps to the app's design tokens (see globals.css).
const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: '[data-theme="%s"]',
  },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#2563eb", dark: "#1d4ed8", contrastText: "#ffffff" },
        background: { default: "#ffffff", paper: "#ffffff" },
        text: { primary: "#0f172a", secondary: "#475569" },
        divider: "#cbd5e1",
        error: { main: "#dc2626" },
      },
    },
    dark: {
      palette: {
        primary: { main: "#3b82f6", dark: "#60a5fa", contrastText: "#ffffff" },
        background: { default: "#0b1120", paper: "#1e293b" },
        text: { primary: "#e2e8f0", secondary: "#94a3b8" },
        divider: "rgba(148, 163, 184, 0.25)",
        error: { main: "#f87171" },
      },
    },
  },
  shape: { borderRadius: 8 },
  typography: { fontFamily: "inherit", fontSize: 14 },
  components: {
    // ButtonBase sets `outline: 0` and ships no `.Mui-focusVisible` rule at
    // all, and emotion injects after the Next stylesheet, so the app's
    // global `:focus-visible` rule (0,1,0) loses on source order and NO MUI
    // button has ever shown a keyboard focus ring. A styleOverrides entry
    // compiles to `.css-hash:focus-visible` = (0,2,0), which beats it on
    // specificity so injection order stops mattering. This reaches
    // Checkbox/Radio/Switch via SwitchBase, plus Tab, MenuItem, IconButton
    // and ListItemButton, since each renders a real ButtonBase.
    //
    // CSS layers (`modularCssLayers` in this MUI version) must stay OFF:
    // globals.css has an unlayered `* { padding: 0; margin: 0 }`, and
    // unlayered CSS beats layered regardless of specificity, so enabling
    // layers would strip padding from every MUI component. Placed first in
    // this object (before MuiButton) so the most general override reads
    // first.
    MuiButtonBase: {
      styleOverrides: {
        root: {
          "&:focus-visible": {
            outline: "2px solid var(--focus-ring-color)",
            outlineOffset: 2,
          },
        },
      },
    },
    // Tab is the one ButtonBase descendant the rule above gets WRONG, and it
    // has to be corrected rather than left, because Tabs are this app's
    // primary navigation. `.MuiTabs-scroller` sets `overflow: hidden` and its
    // height equals the tab's, so a ring at `outline-offset: 2px` has nowhere
    // to go: rendered in headless Chrome, the top and bottom edges are clipped
    // away entirely and a focused tab shows only two disconnected vertical
    // bars, which reads as a divider rather than as focus. A NEGATIVE offset
    // draws the ring inside the tab's own border box, where nothing clips it -
    // measured as a complete four-sided ring inside the same scroller. This
    // is the same call `.scrollRegion:focus-visible` in TasksGrid.module.css
    // already made for the same reason, and it stays an `outline` rather than
    // an inset box-shadow so it survives Windows High Contrast mode, which
    // discards box-shadows but preserves outlines.
    MuiTab: {
      styleOverrides: {
        root: {
          "&:focus-visible": {
            outline: "2px solid var(--focus-ring-color)",
            outlineOffset: -2,
          },
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: "none", borderRadius: 8, fontWeight: 600 },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: { root: { borderRadius: 8, fontSize: "0.9rem" } },
    },
    MuiAutocomplete: {
      styleOverrides: { inputRoot: { paddingTop: 2, paddingBottom: 2 } },
    },
    // docs/reply-composition-controls-acceptance-criteria.md C4c: the
    // MuiButtonBase override above does NOT reach the Slider thumb - it is
    // not a ButtonBase - so without this it falls back to MUI's default
    // box-shadow focus ring, which (per this file's own MuiTab comment
    // above, the same fact recorded a second time here because it governs
    // a real decision rather than just being restated) is invisible in
    // Windows High Contrast mode, which discards box-shadows but preserves
    // outlines. An explicit `outline` on the thumb's focus-visible state
    // fixes it the same way MuiTab's does, at the default (non-negative)
    // offset - the thumb is a small circle with plenty of room around it,
    // unlike a Tab clipped by its scroller.
    MuiSlider: {
      styleOverrides: {
        thumb: {
          "&:focus-visible": {
            outline: "2px solid var(--focus-ring-color)",
            outlineOffset: 2,
          },
        },
      },
    },
  },
});

export default theme;
