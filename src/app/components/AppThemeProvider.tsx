"use client";

import { ThemeProvider } from "@mui/material/styles";
import theme from "../theme";
import { useThemePreference } from "@/hooks/useThemePreference";

/** Wraps the app in the project-wide MUI theme. Intentionally omits CssBaseline
 *  so the existing global CSS (globals.css) is preserved.
 *  colorSchemeNode={null} tells MUI not to manage the data-theme attribute;
 *  the app owns it via useThemePreference and the bootstrap script. */
export default function AppThemeProvider({ children }: { children: React.ReactNode }) {
  // Re-assert the stored theme after hydration: MUI's ThemeProvider writes
  // data-theme on the root element during mount, clobbering the bootstrap
  // script's value. This always-mounted hook instance runs its effect after
  // MUI's (parent effects fire last), so the user's preference wins without
  // waiting for the settings menu to mount.
  useThemePreference();

  return (
    <ThemeProvider theme={theme} colorSchemeNode={null}>
      {children}
    </ThemeProvider>
  );
}
