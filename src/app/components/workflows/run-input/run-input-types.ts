// Shared, dependency-free shapes for the run-input table split (DEFECT 3:
// RunInputPrompt.tsx's ~585-line `table` branch broken into sibling modules
// under this directory, mirroring the RuntimeFieldInput.tsx / RuntimeFieldInputEntityPickers.tsx
// / RuntimeFieldInputTemplates.tsx split - MECHANICAL only, no behavior
// change). Kept in one place so RunInputPrompt.tsx (the entry point),
// RunInputTableSection.tsx, RunInputTable.tsx and RunInputTableToolbar.tsx
// all describe a table column the same way instead of four slightly
// different inline object types.
export interface RunInputColumn {
  key: string;
  label: string;
  width?: number;
  link?: boolean;
  editable?: boolean;
  multiline?: boolean;
}
