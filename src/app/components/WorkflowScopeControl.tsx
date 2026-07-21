"use client";

import { Autocomplete, Checkbox, FormControlLabel, TextField, MenuItem } from "@mui/material";
import Typeahead from "./ui/Typeahead";
import { ALL_SCOPE } from "@/lib/workflows/scope";
import type { WorkflowScope } from "@/lib/workflows/types";

// Decompose canonical days to the largest clean unit for display.
// 14 -> { value: "2", unit: "weeks" }; 30 -> { value: "1", unit: "months" }; 10 -> { value: "10", unit: "days" }
function decomposeCanonicalDays(days: string): { value: string; unit: "days" | "weeks" | "months" } {
  const n = parseInt(days, 10);
  if (isNaN(n) || n <= 0) return { value: "", unit: "days" };
  if (n % 30 === 0) return { value: String(n / 30), unit: "months" };
  if (n % 7 === 0) return { value: String(n / 7), unit: "weeks" };
  return { value: String(n), unit: "days" };
}

// The "This workflow is for" control shown before a workflow's steps: set the
// institution / course tiles / Canvas courses / GitHub orgs the whole workflow
// targets, once. Each list family supports one, several, or all; a blank family
// falls back to asking at run time.
export default function WorkflowScopeControl({
  scope,
  onChange,
  hubCourses,
  institutions,
  orgs,
  lmsCourseOptions,
  activeInstitution,
}: {
  scope: WorkflowScope;
  onChange: (scope: WorkflowScope) => void;
  hubCourses: Array<{ id: string; name: string }> | null;
  institutions: string[];
  orgs: string[] | null;
  lmsCourseOptions: Array<{ url: string; name: string }> | null;
  activeInstitution: string | null;
}) {
  const set = (patch: Partial<WorkflowScope>) => onChange({ ...scope, ...patch });
  const institutionAll = (scope.institution ?? "").trim() === ALL_SCOPE;

  const listPicker = (
    value: string,
    onVal: (v: string) => void,
    options: Array<{ value: string; label: string }>,
    allLabel: string,
    loading: boolean
  ) => {
    const isAll = value.trim() === ALL_SCOPE;
    const selected = isAll ? [] : value.split("\n").map((s) => s.trim()).filter(Boolean);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <FormControlLabel
          control={
            <Checkbox size="small" checked={isAll} onChange={(e) => onVal(e.target.checked ? ALL_SCOPE : "")} />
          }
          label={allLabel}
        />
        {!isAll && (
          <Autocomplete
            multiple
            size="small"
            options={options.map((o) => o.value)}
            getOptionLabel={(v) => options.find((o) => o.value === v)?.label ?? v}
            value={selected}
            onChange={(_, v) => onVal(v.join("\n"))}
            loading={loading}
            renderInput={(params) => (
              <TextField {...params} size="small" placeholder={loading ? "Loading..." : "Select..."} />
            )}
          />
        )}
      </div>
    );
  };

  const cell = { display: "flex", flexDirection: "column" as const, gap: 4, minWidth: 240, flex: 1 };
  const labelStyle = { fontSize: "0.85rem", fontWeight: 500 };

  return (
    <div
      style={{
        border: "1px solid var(--field-border)",
        borderRadius: 10,
        padding: 12,
        marginBottom: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <span style={{ fontWeight: 600, fontSize: "0.9em" }}>This workflow is for</span>
      <p className="fieldHint" style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
        Set the targets once - every step uses them, so a scheduled or triggered run needs no prompt. Leave a field blank to be asked for it at run time.
      </p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={cell}>
          <span style={labelStyle}>Institution</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={institutionAll}
                  onChange={(e) =>
                    set(
                      e.target.checked
                        ? { institution: ALL_SCOPE, lmsCourse: "" }
                        : { institution: "" }
                    )
                  }
                />
              }
              label="All institutions"
            />
            {!institutionAll && (
              <Typeahead
                options={institutions.map((i) => ({ value: i, label: i }))}
                value={scope.institution ?? ""}
                onChange={(v) => set({ institution: v })}
                placeholder="Any (ask when running)"
                noOptionsText="No institutions"
              />
            )}
          </div>
        </div>
        <div style={cell}>
          <span style={labelStyle}>Course tiles</span>
          {listPicker(
            scope.hubCourse ?? "",
            (v) => set({ hubCourse: v }),
            (hubCourses ?? []).map((c) => ({ value: c.id, label: c.name })),
            "All course tiles",
            hubCourses === null
          )}
        </div>
        <div style={cell}>
          <span style={labelStyle}>Canvas courses</span>
          {institutionAll ? (
            <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              Taken from each institution automatically when running for all institutions.
            </p>
          ) : activeInstitution ? (
            listPicker(
              scope.lmsCourse ?? "",
              (v) => set({ lmsCourse: v }),
              (lmsCourseOptions ?? []).map((o) => ({ value: o.url, label: o.name })),
              "All courses at the institution",
              lmsCourseOptions === null
            )
          ) : (
            <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)" }}>
              Pick an institution in the top bar to choose live courses.
            </p>
          )}
        </div>
        <div style={cell}>
          <span style={labelStyle}>GitHub orgs</span>
          {listPicker(
            scope.org ?? "",
            (v) => set({ org: v }),
            (orgs ?? []).map((o) => ({ value: o, label: o })),
            "All organizations",
            orgs === null
          )}
        </div>
        <div style={cell}>
          <span style={labelStyle}>Looking ahead</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(() => {
              const { value: displayValue, unit: displayUnit } = decomposeCanonicalDays(
                scope.lookahead ?? ""
              );
              const handleNumberChange = (newNum: string) => {
                if (!newNum || parseInt(newNum, 10) <= 0) {
                  set({ lookahead: "" });
                } else {
                  const unitFactor =
                    displayUnit === "months" ? 30 : displayUnit === "weeks" ? 7 : 1;
                  set({ lookahead: String(parseInt(newNum, 10) * unitFactor) });
                }
              };
              const handleUnitChange = (newUnit: "days" | "weeks" | "months") => {
                if (!displayValue) {
                  set({ lookahead: "" });
                } else {
                  const numVal = parseInt(displayValue, 10);
                  const unitFactor =
                    newUnit === "months" ? 30 : newUnit === "weeks" ? 7 : 1;
                  set({ lookahead: String(numVal * unitFactor) });
                }
              };
              return (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <TextField
                    type="number"
                    size="small"
                    placeholder="0"
                    value={displayValue}
                    onChange={(e) => handleNumberChange(e.target.value)}
                    slotProps={{ htmlInput: { min: 1 } }}
                    sx={{ width: 80 }}
                  />
                  <TextField
                    select
                    size="small"
                    value={displayUnit}
                    onChange={(e) =>
                      handleUnitChange(e.target.value as "days" | "weeks" | "months")
                    }
                    sx={{ width: 100 }}
                  >
                    <MenuItem value="days">days</MenuItem>
                    <MenuItem value="weeks">weeks</MenuItem>
                    <MenuItem value="months">months</MenuItem>
                  </TextField>
                </div>
              );
            })()}
            <p className="fieldHint" style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Fills every step that looks ahead (deadlines, weekly generators).
            </p>
          </div>
        </div>
        <div style={cell}>
          <span style={labelStyle}>Modules ahead</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <TextField
              type="number"
              size="small"
              placeholder="0"
              value={scope.moduleOffset ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                if (!val || parseInt(val, 10) <= 0) {
                  set({ moduleOffset: "" });
                } else {
                  set({ moduleOffset: String(parseInt(val, 10)) });
                }
              }}
              slotProps={{ htmlInput: { min: 0 } }}
              sx={{ width: 80 }}
            />
            <p className="fieldHint" style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Fills every step that targets a module offset.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
