import { Chip, SvgIcon } from "@mui/material";

const icons = {
  danger: "M9 9l6 6m0-6-6 6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  warning: "M12 8v5m0 3h.01M12 3 2 21h20L12 3Z",
  accent: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  success: "m8 12 3 3 5-6m5 3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  neutral: "M8 12h8m5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
} as const;

export function StartupStatusChip({ label, tone }: { label: string; tone: keyof typeof icons }) {
  return (
    <Chip size="small" variant="outlined" label={label}
      icon={
        <SvgIcon aria-hidden="true" focusable="false">
          <path d={icons[tone]} fill="none" stroke="currentColor" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" />
        </SvgIcon>
      }
      sx={{
        height: "auto",
        minHeight: 24,
        fontWeight: 700,
        color: tone === "neutral" ? "var(--text-secondary)" : `var(--${tone}-ink)`,
        bgcolor: tone === "neutral" ? "var(--surface-subtle)" : `var(--${tone}-surface)`,
        borderColor: "currentColor",
        "& .MuiChip-label": { whiteSpace: "normal" },
        "& .MuiChip-icon": { color: "inherit", fontSize: 16 },
      }}
    />
  );
}
