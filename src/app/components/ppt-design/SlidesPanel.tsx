"use client";

import { TextField, Select, MenuItem, FormControlLabel, Checkbox, Button, Card, CardContent, FormHelperText } from "@mui/material";
import { SECTION_BREADTHS, SLIDE_ROLES, SLIDE_DEPTHS, getSlideRole } from "@/lib/decks/types";
import type { DeckTemplate, SlideRole, LoopSourceKind, DeckSlide, DeckLoopGroup } from "@/lib/decks/types";

interface SlidesPanelProps {
  selected: DeckTemplate;
  isReadOnly: boolean;
  onUpdateSlide: (slideId: string, updates: Partial<DeckSlide>) => void;
  onRemoveSlide: (slideId: string) => void;
  onMoveSlide: (index: number, direction: "up" | "down") => void;
  onWrapSlideInLoop: (slideId: string) => void;
  onUpdateLoopGroup: (loopId: string, updates: Partial<DeckLoopGroup>) => void;
  onAddSlideToLoop: (gid: string) => void;
  onMoveLoop: (gid: string, dir: "up" | "down") => void;
  onUngroupLoop: (gid: string) => void;
}

export default function SlidesPanel({
  selected,
  isReadOnly,
  onUpdateSlide,
  onRemoveSlide,
  onMoveSlide,
  onWrapSlideInLoop,
  onUpdateLoopGroup,
  onAddSlideToLoop,
  onMoveLoop,
  onUngroupLoop,
}: SlidesPanelProps) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <h3 style={{ margin: "0 0 1rem 0", fontSize: "0.95rem", fontWeight: 600 }}>
        Slides ({selected.slides.length})
      </h3>

      {(() => {
        const items: React.ReactNode[] = [];
        const processed = new Set<number>();

        for (let idx = 0; idx < selected.slides.length; idx++) {
          if (processed.has(idx)) continue;

          const slide = selected.slides[idx];
          if (slide.loopGroupId) {
            const gid = slide.loopGroupId;
            let endIdx = idx;
            while (endIdx < selected.slides.length && selected.slides[endIdx].loopGroupId === gid) {
              processed.add(endIdx);
              endIdx++;
            }

            const members = selected.slides.slice(idx, endIdx);
            const group = selected.loops.find((g) => g.id === gid);

            const canMoveLoopUp = idx > 0;
            const canMoveLoopDown = endIdx < selected.slides.length;

            items.push(
              <div
                key={`loop-${gid}-${idx}`}
                style={{
                  border: "1px solid var(--field-border)",
                  borderRadius: "4px",
                  backgroundColor: "var(--field-bg)",
                  marginBottom: "1rem",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "1rem", borderBottom: "1px solid var(--field-border)" }}>
                  <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                    <TextField
                      label="Label"
                      value={group?.label || ""}
                      onChange={(e) => onUpdateLoopGroup(gid, { label: e.target.value })}
                      disabled={isReadOnly}
                      size="small"
                      sx={{ flex: "1 1 200px", minWidth: "150px" }}
                    />
                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", paddingTop: "0.75rem" }}>
                      Repeats these {members.length} slides for each item
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                    <Select
                      value={group?.source || "runtime"}
                      onChange={(e) => onUpdateLoopGroup(gid, { source: e.target.value as LoopSourceKind })}
                      disabled={isReadOnly}
                      size="small"
                      sx={{ flex: "1 1 200px", minWidth: "150px" }}
                    >
                      <MenuItem value="runtime">Ask at generate time</MenuItem>
                      <MenuItem value="literal">Fixed list</MenuItem>
                      <MenuItem value="courseTopics">Course topics</MenuItem>
                    </Select>
                    <Select
                      value={group?.breadth || "standard"}
                      onChange={(e) => onUpdateLoopGroup(gid, { breadth: e.target.value as "core" | "standard" | "full" })}
                      disabled={isReadOnly}
                      size="small"
                      sx={{ flex: "1 1 200px", minWidth: "150px" }}
                    >
                      {SECTION_BREADTHS.map((b) => (
                        <MenuItem key={b.breadth} value={b.breadth}>
                          {b.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </div>
                  {group && (
                    <FormHelperText style={{ marginBottom: "0.75rem" }}>
                      {SECTION_BREADTHS.find((b) => b.breadth === group.breadth)?.hint}
                    </FormHelperText>
                  )}

                  {group?.source === "literal" && (
                    <TextField
                      label="Items (one per line)"
                      value={group.items.join("\n")}
                      onChange={(e) => onUpdateLoopGroup(gid, { items: e.target.value.split("\n").filter(Boolean) })}
                      disabled={isReadOnly}
                      fullWidth
                      multiline
                      rows={3}
                      size="small"
                      style={{ marginBottom: "0.75rem" }}
                    />
                  )}

                  {group?.source === "runtime" && (
                    <TextField
                      label="Prompt label"
                      value={group.runtimeLabel || ""}
                      onChange={(e) => onUpdateLoopGroup(gid, { runtimeLabel: e.target.value })}
                      disabled={isReadOnly}
                      fullWidth
                      size="small"
                      style={{ marginBottom: "0.75rem" }}
                      placeholder="e.g., Concepts"
                    />
                  )}

                  {group?.source === "courseTopics" && (
                    <FormHelperText style={{ marginBottom: "0.75rem" }}>
                      You will pick a course when you generate.
                    </FormHelperText>
                  )}

                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => onMoveLoop(gid, "up")}
                      disabled={isReadOnly || !canMoveLoopUp}
                      sx={{ textTransform: "none" }}
                    >
                      Move loop up
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => onMoveLoop(gid, "down")}
                      disabled={isReadOnly || !canMoveLoopDown}
                      sx={{ textTransform: "none" }}
                    >
                      Move loop down
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => onUngroupLoop(gid)}
                      disabled={isReadOnly}
                      sx={{ textTransform: "none" }}
                    >
                      Ungroup
                    </Button>
                  </div>
                </div>

                <div style={{ padding: "0.75rem" }}>
                  {members.map((member, memberIdx) => (
                    <Card key={member.id} style={{ marginBottom: "0.75rem" }}>
                      <CardContent>
                        <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                          <Select
                            value={member.role}
                            onChange={(e) => onUpdateSlide(member.id, { role: e.target.value as SlideRole })}
                            disabled={isReadOnly}
                            fullWidth
                            size="small"
                            sx={{ flex: "1 1 200px" }}
                          >
                            {SLIDE_ROLES.map((r) => (
                              <MenuItem key={r.role} value={r.role}>
                                {r.label}
                              </MenuItem>
                            ))}
                          </Select>
                          <Select
                            value={member.depth || "standard"}
                            onChange={(e) => onUpdateSlide(member.id, { depth: e.target.value as "intro" | "standard" | "challenge" })}
                            disabled={isReadOnly}
                            size="small"
                            sx={{ flex: "1 1 180px" }}
                          >
                            {SLIDE_DEPTHS.map((d) => (
                              <MenuItem key={d.depth} value={d.depth}>
                                {d.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </div>

                        <TextField
                          label="Title (optional)"
                          value={member.title}
                          onChange={(e) => onUpdateSlide(member.id, { title: e.target.value })}
                          disabled={isReadOnly}
                          fullWidth
                          size="small"
                          style={{ marginBottom: "1rem" }}
                        />

                        <TextField
                          label="Notes - what should be on this slide"
                          value={member.notes}
                          onChange={(e) => onUpdateSlide(member.id, { notes: e.target.value })}
                          disabled={isReadOnly}
                          fullWidth
                          multiline
                          rows={3}
                          size="small"
                          style={{ marginBottom: "1rem" }}
                          placeholder={getSlideRole(member.role)?.hint}
                        />

                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={member.includeCode}
                              onChange={(e) => {
                                const willInclude = e.target.checked;
                                const lang = willInclude ? (member.codeLanguage || "python") : "";
                                onUpdateSlide(member.id, {
                                  includeCode: willInclude,
                                  codeLanguage: lang,
                                });
                              }}
                              disabled={isReadOnly}
                            />
                          }
                          label="Include code"
                          style={{ marginBottom: "1rem" }}
                        />

                        {member.includeCode && (
                          <TextField
                            label="Language"
                            value={member.codeLanguage}
                            onChange={(e) => onUpdateSlide(member.id, { codeLanguage: e.target.value })}
                            disabled={isReadOnly}
                            fullWidth
                            size="small"
                            style={{ marginBottom: "1rem" }}
                            placeholder="python"
                          />
                        )}

                        <TextField
                          label="Max bullets"
                          type="number"
                          value={member.maxBullets}
                          onChange={(e) => onUpdateSlide(member.id, { maxBullets: parseInt(e.target.value) || 0 })}
                          disabled={isReadOnly}
                          fullWidth
                          size="small"
                          style={{ marginBottom: "1rem" }}
                          slotProps={{ htmlInput: { min: 0 } }}
                          helperText={`Role default: ${getSlideRole(member.role)?.maxBulletsDefault ?? "N/A"}`}
                        />

                        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1rem" }}>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => onMoveSlide(idx + memberIdx, "up")}
                            disabled={isReadOnly || memberIdx === 0}
                            sx={{ textTransform: "none" }}
                          >
                            Move up
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => onMoveSlide(idx + memberIdx, "down")}
                            disabled={isReadOnly || memberIdx === members.length - 1}
                            sx={{ textTransform: "none" }}
                          >
                            Move down
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => onRemoveSlide(member.id)}
                            disabled={isReadOnly}
                            sx={{ textTransform: "none" }}
                          >
                            Remove
                          </Button>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => onUpdateSlide(member.id, { loopGroupId: null })}
                            disabled={isReadOnly}
                            sx={{ textTransform: "none" }}
                          >
                            Remove from loop
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div style={{ padding: "0.75rem", borderTop: "1px solid var(--field-border)", backgroundColor: "rgba(0,0,0,0.01)" }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => onAddSlideToLoop(gid)}
                    disabled={isReadOnly}
                    sx={{ textTransform: "none" }}
                  >
                    Add slide to this loop
                  </Button>
                </div>
              </div>
            );
          } else {
            processed.add(idx);
            const canMoveUp = idx > 0 && !selected.slides[idx - 1].loopGroupId;
            const canMoveDown = idx < selected.slides.length - 1 && !selected.slides[idx + 1].loopGroupId;

            items.push(
              <Card key={slide.id} style={{ marginBottom: "1rem" }}>
                <CardContent>
                  <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                    <Select
                      value={slide.role}
                      onChange={(e) => onUpdateSlide(slide.id, { role: e.target.value as SlideRole })}
                      disabled={isReadOnly}
                      fullWidth
                      size="small"
                      sx={{ flex: "1 1 200px" }}
                    >
                      {SLIDE_ROLES.map((r) => (
                        <MenuItem key={r.role} value={r.role}>
                          {r.label}
                        </MenuItem>
                      ))}
                    </Select>
                    <Select
                      value={slide.depth || "standard"}
                      onChange={(e) => onUpdateSlide(slide.id, { depth: e.target.value as "intro" | "standard" | "challenge" })}
                      disabled={isReadOnly}
                      size="small"
                      sx={{ flex: "1 1 180px" }}
                    >
                      {SLIDE_DEPTHS.map((d) => (
                        <MenuItem key={d.depth} value={d.depth}>
                          {d.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </div>

                  <TextField
                    label="Title (optional)"
                    value={slide.title}
                    onChange={(e) => onUpdateSlide(slide.id, { title: e.target.value })}
                    disabled={isReadOnly}
                    fullWidth
                    size="small"
                    style={{ marginBottom: "1rem" }}
                  />

                  <TextField
                    label="Notes - what should be on this slide"
                    value={slide.notes}
                    onChange={(e) => onUpdateSlide(slide.id, { notes: e.target.value })}
                    disabled={isReadOnly}
                    fullWidth
                    multiline
                    rows={3}
                    size="small"
                    style={{ marginBottom: "1rem" }}
                    placeholder={getSlideRole(slide.role)?.hint}
                  />

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={slide.includeCode}
                        onChange={(e) => {
                          const willInclude = e.target.checked;
                          const lang = willInclude ? (slide.codeLanguage || "python") : "";
                          onUpdateSlide(slide.id, {
                            includeCode: willInclude,
                            codeLanguage: lang,
                          });
                        }}
                        disabled={isReadOnly}
                      />
                    }
                    label="Include code"
                    style={{ marginBottom: "1rem" }}
                  />

                  {slide.includeCode && (
                    <TextField
                      label="Language"
                      value={slide.codeLanguage}
                      onChange={(e) => onUpdateSlide(slide.id, { codeLanguage: e.target.value })}
                      disabled={isReadOnly}
                      fullWidth
                      size="small"
                      style={{ marginBottom: "1rem" }}
                      placeholder="python"
                    />
                  )}

                  <TextField
                    label="Max bullets"
                    type="number"
                    value={slide.maxBullets}
                    onChange={(e) => onUpdateSlide(slide.id, { maxBullets: parseInt(e.target.value) || 0 })}
                    disabled={isReadOnly}
                    fullWidth
                    size="small"
                    style={{ marginBottom: "1rem" }}
                    slotProps={{ htmlInput: { min: 0 } }}
                    helperText={`Role default: ${getSlideRole(slide.role)?.maxBulletsDefault ?? "N/A"}`}
                  />

                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1rem" }}>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => onMoveSlide(idx, "up")}
                      disabled={isReadOnly || !canMoveUp}
                      sx={{ textTransform: "none" }}
                    >
                      Move up
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => onMoveSlide(idx, "down")}
                      disabled={isReadOnly || !canMoveDown}
                      sx={{ textTransform: "none" }}
                    >
                      Move down
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => onRemoveSlide(slide.id)}
                      disabled={isReadOnly}
                      sx={{ textTransform: "none" }}
                    >
                      Remove
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => onWrapSlideInLoop(slide.id)}
                      disabled={isReadOnly}
                      sx={{ textTransform: "none" }}
                    >
                      Make loop
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          }
        }
        return items;
      })()}
    </div>
  );
}
