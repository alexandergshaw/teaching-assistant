"use client";

import { useState } from "react";
import { TextField } from "@mui/material";

interface ListFieldEditorProps {
  label: string;
  helperText: string;
  items: string[];
  disabled: boolean;
  onChange: (items: string[]) => void;
}

function toItems(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * A string-list field edited as one item per line.
 *
 * The raw text is held locally rather than re-derived from `items` on every
 * render: filtering blank lines straight back into the value would delete the
 * empty line the moment the user pressed Enter, making it impossible to start
 * a new item. Dropping blanks on the way out matches the spec coercion
 * (`deliverables` / `allowedResources` keep only non-empty trimmed strings),
 * so what is saved is exactly what a reload shows.
 *
 * There is deliberately NO effect syncing local text back from props - callers
 * pass a `key` tied to the selected template so switching templates remounts
 * this field with fresh initial text instead.
 */
export default function ListFieldEditor({
  label,
  helperText,
  items,
  disabled,
  onChange,
}: ListFieldEditorProps) {
  const [text, setText] = useState(() => items.join("\n"));

  return (
    <TextField
      label={label}
      size="small"
      fullWidth
      multiline
      minRows={3}
      disabled={disabled}
      value={text}
      onBlur={() => setText(toItems(text).join("\n"))}
      onChange={(e) => {
        setText(e.target.value);
        onChange(toItems(e.target.value));
      }}
      helperText={helperText}
    />
  );
}
