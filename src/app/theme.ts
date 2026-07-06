import { createTheme } from "@mui/material/styles";

// Project-wide MUI theme mapped to the app's design tokens (see globals.css).
// Light and dark color schemes switch automatically with the OS preference
// (colorSchemeSelector "media"), matching the app's CSS-variable dark mode.
const theme = createTheme({
  cssVariables: { colorSchemeSelector: "media" },
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
        primary: { main: "#60a5fa", dark: "#3b82f6", contrastText: "#0f172a" },
        background: { default: "#0a0a0a", paper: "#1e293b" },
        text: { primary: "#e2e8f0", secondary: "#94a3b8" },
        divider: "rgba(148, 163, 184, 0.25)",
        error: { main: "#f87171" },
      },
    },
  },
  shape: { borderRadius: 8 },
  typography: { fontFamily: "inherit", fontSize: 14 },
  components: {
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
  },
});

export default theme;
