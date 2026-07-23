"use client";

// Composite editor for the "sourcePolicy" workflow value type: a checkbox
// list of the five material sources (checking one appends it to the order),
// up/down buttons to reorder the checked sources, and a strategy select.
// Shared by RuntimeFieldInput (run-time binding) and LiteralEditor (builder
// preset binding) - the lookahead/moduleOffset bespoke-editor precedent.
// Renders the default policy's state when `value` is empty; writes the
// user's edits as an encoded SourcePolicy string.

import { Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import {
  ALL_SOURCE_KINDS,
  ALL_SOURCE_STRATEGIES,
  SOURCE_KIND_LABELS,
  SOURCE_STRATEGY_LABELS,
  encodeSourcePolicy,
  resolveSourcePolicy,
  type SourceKind,
} from "@/lib/workflows/source-policy";

export default function SourcePolicyEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const policy = resolveSourcePolicy(value);
  const isDefaultShown = !value.trim();

  const commit = (order: SourceKind[], strategy: typeof policy.strategy) => {
    onChange(encodeSourcePolicy({ order, strategy }));
  };

  const toggle = (kind: SourceKind, checked: boolean) => {
    const order = checked
      ? [...policy.order.filter((k) => k !== kind), kind]
      : policy.order.filter((k) => k !== kind);
    commit(order, policy.strategy);
  };

  const move = (kind: SourceKind, direction: -1 | 1) => {
    const idx = policy.order.indexOf(kind);
    if (idx === -1) return;
    const target = idx + direction;
    if (target < 0 || target >= policy.order.length) return;
    const order = [...policy.order];
    [order[idx], order[target]] = [order[target], order[idx]];
    commit(order, policy.strategy);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 260 }}>
      {isDefaultShown && (
        <p style={{ margin: 0, fontSize: "0.78rem", opacity: 0.65 }}>
          Default: live LMS, then the course export, then tile topics/description - first source that yields material.
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {policy.order.map((kind, i) => (
          <div key={kind} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <FormControlLabel
              control={<Checkbox size="small" checked onChange={() => toggle(kind, false)} />}
              label={SOURCE_KIND_LABELS[kind]}
              sx={{ flex: 1 }}
            />
            <Button size="small" disabled={i === 0} onClick={() => move(kind, -1)} sx={{ minWidth: 0, padding: "2px 6px" }}>
              Up
            </Button>
            <Button
              size="small"
              disabled={i === policy.order.length - 1}
              onClick={() => move(kind, 1)}
              sx={{ minWidth: 0, padding: "2px 6px" }}
            >
              Down
            </Button>
          </div>
        ))}
        {ALL_SOURCE_KINDS.filter((kind) => !policy.order.includes(kind)).map((kind) => (
          <FormControlLabel
            key={kind}
            control={<Checkbox size="small" checked={false} onChange={() => toggle(kind, true)} />}
            label={SOURCE_KIND_LABELS[kind]}
          />
        ))}
      </div>
      <TextField
        select
        size="small"
        label="Strategy"
        value={policy.strategy}
        onChange={(e) => commit(policy.order, e.target.value as (typeof ALL_SOURCE_STRATEGIES)[number])}
        sx={{ maxWidth: 320 }}
      >
        {ALL_SOURCE_STRATEGIES.map((s) => (
          <MenuItem key={s} value={s}>
            {SOURCE_STRATEGY_LABELS[s]}
          </MenuItem>
        ))}
      </TextField>
      {!isDefaultShown && (
        <button
          type="button"
          onClick={() => onChange("")}
          style={{
            alignSelf: "flex-start",
            background: "none",
            border: "none",
            padding: 0,
            font: "inherit",
            color: "var(--link-color, #2563eb)",
            cursor: "pointer",
            fontSize: "0.78rem",
          }}
        >
          Reset to default
        </button>
      )}
    </div>
  );
}
