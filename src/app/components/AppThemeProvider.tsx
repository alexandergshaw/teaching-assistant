"use client";

import { ThemeProvider } from "@mui/material/styles";
import theme from "../theme";

/** Wraps the app in the project-wide MUI theme. Intentionally omits CssBaseline
 *  so the existing global CSS (globals.css) is preserved. */
export default function AppThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
