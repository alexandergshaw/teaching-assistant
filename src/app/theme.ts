import { createTheme } from "@mui/material/styles";

// Project-wide MUI theme, pinned to light theme.
// Maps to the app's design tokens (see globals.css).
const theme = createTheme({
  palette: {
    primary: { main: "#2563eb", dark: "#1d4ed8", contrastText: "#ffffff" },
    background: { default: "#ffffff", paper: "#ffffff" },
    text: { primary: "#0f172a", secondary: "#475569" },
    divider: "#cbd5e1",
    error: { main: "#dc2626" },
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
