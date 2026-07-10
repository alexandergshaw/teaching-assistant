"use client";

import { useEffect, useState, useCallback, useRef } from "react";

type Preference = "light" | "dark" | "system";

interface ThemePreference {
  preference: Preference;
  resolved: "light" | "dark";
  setPreference: (preference: Preference) => void;
}

const computeResolved = (pref: Preference): "light" | "dark" => {
  if (pref === "system") {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } catch {
      return "light";
    }
  }
  return pref;
};

const initializeTheme = (): {
  preference: Preference;
  resolved: "light" | "dark";
} => {
  // Initialize preference from localStorage
  let storedPreference: Preference = "system";
  try {
    const stored = localStorage.getItem("ta-theme");
    if (stored === "light" || stored === "dark") {
      storedPreference = stored;
    }
  } catch {
    // SSR guard: localStorage may not be available
  }

  const resolvedValue = computeResolved(storedPreference);

  // Apply to DOM
  try {
    document.documentElement.dataset.theme = resolvedValue;
  } catch {
    // SSR guard
  }

  return { preference: storedPreference, resolved: resolvedValue };
};

export function useThemePreference(): ThemePreference {
  const [state, setState] = useState<{
    preference: Preference;
    resolved: "light" | "dark";
  }>({ preference: "system", resolved: "light" });

  const initRef = useRef(false);

  // Initialize theme on mount (once)
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const initialState = initializeTheme();
    setState(initialState);
  }, []);

  // Manage matchMedia listener based on preference
  useEffect(() => {
    if (state.preference !== "system") {
      // No listener needed for explicit light/dark
      return;
    }

    try {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
        const newResolved = e.matches ? "dark" : "light";
        setState((prev) => ({
          ...prev,
          resolved: newResolved,
        }));
        document.documentElement.dataset.theme = newResolved;
      };
      mediaQuery.addEventListener("change", handleChange);
      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    } catch {
      // SSR guard
    }
  }, [state.preference]);

  const setPreference = useCallback((newPreference: Preference) => {
    // Persist to localStorage
    try {
      if (newPreference === "system") {
        localStorage.removeItem("ta-theme");
      } else {
        localStorage.setItem("ta-theme", newPreference);
      }
    } catch {
      // SSR guard
    }

    // Compute and apply resolved value
    const resolvedValue = computeResolved(newPreference);

    try {
      document.documentElement.dataset.theme = resolvedValue;
    } catch {
      // SSR guard
    }

    // Update state (this will trigger the listener useEffect)
    setState({
      preference: newPreference,
      resolved: resolvedValue,
    });
  }, []);

  return {
    preference: state.preference,
    resolved: state.resolved,
    setPreference,
  };
}
