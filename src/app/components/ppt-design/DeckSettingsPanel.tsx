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
    <div style={{ marginBottom: "1.5rem" }}>
      <div
        onClick={() => onSettingsOpenChange(!settingsOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          marginBottom: "0.5rem",
          padding: "0.5rem",
          borderRadius: "4px",
        }}
      >
        <span style={{ fontSize: "1rem", marginRight: "0.5rem" }}>
          {settingsOpen ? ">" : "v"}
        </span>
        <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>
          Deck settings
        </h3>
      </div>
      <Collapse in={settingsOpen}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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
              <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--field-border)" }}>
                <h4 style={{ margin: "0 0 1rem 0", fontSize: "0.9rem", fontWeight: 600 }}>
                  Theme
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.5rem" }}>
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
                    <div style={{ padding: "0.75rem", backgroundColor: "rgba(0,0,0,0.03)", borderRadius: "4px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      Classic uses the app&apos;s built-in navy styling.
                    </div>
                  ) : (
                    <>
                      <div>
                        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.5rem" }}>
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
                            height: "40px",
                            border: "1px solid var(--field-border)",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        />
                      </div>

                      {selected.theme.backgroundKind === "gradient" && (
                        <>
                          <div>
                            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.5rem" }}>
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
                                height: "40px",
                                border: "1px solid var(--field-border)",
                                borderRadius: "4px",
                                cursor: "pointer",
                              }}
                            />
                          </div>

                          <div>
                            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.5rem" }}>
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
                        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, marginBottom: "0.5rem" }}>
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
                            height: "40px",
                            border: "1px solid var(--field-border)",
                            borderRadius: "4px",
                            cursor: "pointer",
                          }}
                        />
                      </div>

                      <div
                        style={{
                          marginTop: "0.5rem",
                          padding: "1rem",
                          borderRadius: "4px",
                          background: selected.theme.backgroundKind === "gradient"
                            ? `linear-gradient(${selected.theme.gradientAngle}deg, ${selected.theme.backgroundColor}, ${selected.theme.backgroundColor2})`
                            : selected.theme.backgroundColor,
                          color: selected.theme.fontColor,
                          textAlign: "center",
                          fontSize: "0.85rem",
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
