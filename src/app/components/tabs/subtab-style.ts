export const subtabSx = {
  maxWidth: "100%",
  minHeight: 44,
  borderBottom: "1px solid var(--border-soft)",
  "& .MuiTab-root": {
    minWidth: 0,
    minHeight: 44,
    paddingInline: "var(--space-4)",
    fontFamily: "inherit",
    fontSize: "var(--font-size-md)",
    fontWeight: 600,
    textTransform: "none",
    color: "var(--text-secondary)",
    "&.Mui-selected": { color: "var(--accent-ink)" },
  },
  "& .MuiTabs-indicator": { backgroundColor: "var(--accent)" },
} as const;
