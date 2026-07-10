"use client";

import { ThemeProvider } from "@mui/material/styles";
import theme from "../theme";

/** Wraps the app in the project-wide MUI theme. Intentionally omits CssBaseline
 *  so the existing global CSS (globals.css) is preserved.
 *  colorSchemeNode={null} prevents MUI from writing the data-theme attribute;
 *  the app owns it via useThemePreference and the bootstrap script. */
export default function AppThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={theme} colorSchemeNode={null}>
      {children}
    </ThemeProvider>
  );
}
