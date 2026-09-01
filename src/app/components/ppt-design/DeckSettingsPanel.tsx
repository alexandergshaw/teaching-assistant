"use client";

import { TextField, Collapse, Select, MenuItem, Slider } from "@mui/material";
import type { DeckTemplate } from "@/lib/decks/types";

interface DeckSettingsPanelProps {
  selected: DeckTemplate;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  onUpdateField: (key: keyof DeckTemplate, value: string) => void;
  onUpdateTheme: (updates: Record<string, string | number>) => void;
  isReadOnly: boolean;
}

export default function DeckSettingsPanel({
  selected,
  settingsOpen,
  onSettingsOpenChange,
  onUpdateField,
  onUpdateTheme,
  isReadOnly,
}: DeckSettingsPanelProps) {
  return (
    <div style={{ marginBottom: "var(--space-6)" }}>
      <div
        onClick={() => onSettingsOpenChange(!settingsOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          marginBottom: "var(--space-2)",
          padding: "var(--space-2)",
          borderRadius: "var(--radius-xs)",
        }}
      >
        <span style={{ fontSize: "var(--font-size-lg)", marginRight: "var(--space-2)", color: "var(--text-secondary)" }} aria-hidden="true">
          {settingsOpen ? ">" : "v"}
        </span>
        <h3
          style={{
            margin: 0,
            fontSize: "var(--font-size-2xs)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-secondary)",
          }}
        >
          Deck settings
        </h3>
      </div>
      <Collapse in={settingsOpen}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <TextField
            label="Name"
            value={selected.name}
            onChange={(e) => onUpdateField("name", e.target.value)}
            disabled={isReadOnly}
            fullWidth
            size="small"
          />
          <TextField
            label="Description"
            value={selected.description}
            onChange={(e) => onUpdateField("description", e.target.value)}
            disabled={isReadOnly}
            fullWidth
            multiline
            rows={2}
            size="small"
          />
          <TextField
            label="Audience"
            value={selected.audience}
            onChange={(e) => onUpdateField("audience", e.target.value)}
            disabled={isReadOnly}
            fullWidth
            size="small"
          />
          <TextField
            label="Tone"
            value={selected.tone}
            onChange={(e) => onUpdateField("tone", e.target.value)}
            disabled={isReadOnly}
            fullWidth
            size="small"
          />
          {!isReadOnly && (
            <>
              <div style={{ marginTop: "var(--space-6)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--field-border)" }}>
                <h4
                  style={{
                    margin: "0 0 var(--space-4) 0",
                    fontSize: "var(--font-size-2xs)",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-secondary)",
                  }}
                >
                  Theme
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: 500, marginBottom: "var(--space-2)" }}>
                      Background
                    </label>
                    <Select
                      value={selected.theme.backgroundKind}
                      onChange={(e) => {
                        onUpdateTheme({
                          backgroundKind: e.target.value as "solid" | "gradient" | "classic",
                        });
                      }}
                      fullWidth
                      size="small"
                    >
                      <MenuItem value="solid">Solid color</MenuItem>
                      <MenuItem value="gradient">Gradient</MenuItem>
                      <MenuItem value="classic">Classic (navy)</MenuItem>
                    </Select>
                  </div>

                  {selected.theme.backgroundKind === "classic" ? (
                    <div style={{ padding: "var(--space-3)", backgroundColor: "var(--surface-muted)", borderRadius: "var(--radius-xs)", fontSize: "var(--font-size-sm)", color: "var(--text-secondary)" }}>
                      Classic uses the app&apos;s built-in navy styling.
                    </div>
                  ) : (
                    <>
                      <div>
                        <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: 500, marginBottom: "var(--space-2)" }}>
                          {selected.theme.backgroundKind === "gradient" ? "Gradient start" : "Background color"}
                        </label>
                        <input
                          type="color"
                          value={selected.theme.backgroundColor}
                          onChange={(e) => {
                            onUpdateTheme({
                              backgroundColor: e.target.value,
                            });
                          }}
                          style={{
                            width: "100%",
                            height: "var(--control-height-lg)",
                            border: "1px solid var(--field-border)",
                            borderRadius: "var(--radius-xs)",
                            cursor: "pointer",
                          }}
                        />
                      </div>

                      {selected.theme.backgroundKind === "gradient" && (
                        <>
                          <div>
                            <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: 500, marginBottom: "var(--space-2)" }}>
                              Gradient end
                            </label>
                            <input
                              type="color"
                              value={selected.theme.backgroundColor2}
                              onChange={(e) => {
                                onUpdateTheme({
                                  backgroundColor2: e.target.value,
                                });
                              }}
                              style={{
                                width: "100%",
                                height: "var(--control-height-lg)",
                                border: "1px solid var(--field-border)",
                                borderRadius: "var(--radius-xs)",
                                cursor: "pointer",
                              }}
                            />
                          </div>

                          <div>
                            <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: 500, marginBottom: "var(--space-2)" }}>
                              Angle: {selected.theme.gradientAngle}°
                            </label>
                            <Slider
                              value={selected.theme.gradientAngle}
                              onChange={(e, val) => {
                                onUpdateTheme({
                                  gradientAngle: typeof val === "number" ? val : val[0],
                                });
                              }}
                              min={0}
                              max={360}
                              step={15}
                            />
                          </div>
                        </>
                      )}

                      <div>
                        <label style={{ display: "block", fontSize: "var(--font-size-sm)", fontWeight: 500, marginBottom: "var(--space-2)" }}>
                          Text color
                        </label>
                        <input
                          type="color"
                          value={selected.theme.fontColor}
                          onChange={(e) => {
                            onUpdateTheme({
                              fontColor: e.target.value,
                            });
                          }}
                          style={{
                            width: "100%",
                            height: "var(--control-height-lg)",
                            border: "1px solid var(--field-border)",
                            borderRadius: "var(--radius-xs)",
                            cursor: "pointer",
                          }}
                        />
                      </div>

                      <div
                        style={{
                          marginTop: "var(--space-2)",
                          padding: "var(--space-4)",
                          borderRadius: "var(--radius-xs)",
                          background: selected.theme.backgroundKind === "gradient"
                            ? `linear-gradient(${selected.theme.gradientAngle}deg, ${selected.theme.backgroundColor}, ${selected.theme.backgroundColor2})`
                            : selected.theme.backgroundColor,
                          color: selected.theme.fontColor,
                          textAlign: "center",
                          fontSize: "var(--font-size-sm)",
                        }}
                      >
                        Preview
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </Collapse>
    </div>
  );
}
