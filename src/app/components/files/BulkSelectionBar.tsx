"use client";

import { Button, TextField, MenuItem } from "@mui/material";
import type { CanvasModule } from "@/lib/canvas-modules";
import CoursePicker from "../CoursePicker";
import styles from "../../page.module.css";

interface BulkSelectionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  bulkAdd: boolean;
  onToggleBulkAdd: (open: boolean) => void;
  bulkModuleId: number | "";
  onBulkModuleSelect: (mId: number | "") => void;
  modules: CanvasModule[];
  modulesStatus: "idle" | "loading" | "ready" | "error";
  courseUrl: string;
  courseName: string;
  activeInstitution: string | null;
  onSelectCourse: (url: string) => void;
  onAddToModule: () => void;
  adding: boolean;
  bulkAddStatus: string;
  confirmBulkDelete: boolean;
  onDelete: () => void;
}

export function BulkSelectionBar({
  selectedCount,
  onClearSelection,
  bulkAdd,
  onToggleBulkAdd,
  bulkModuleId,
  onBulkModuleSelect,
  modules,
  modulesStatus,
  courseUrl,
  courseName,
  activeInstitution,
  onSelectCourse,
  onAddToModule,
  adding,
  bulkAddStatus,
  confirmBulkDelete,
  onDelete,
}: BulkSelectionBarProps) {
  return (
    <div className={styles.bulkBar}>
      <div className={styles.bulkBarHead}>
        <span className={styles.bulkCount}>
          {selectedCount} file{selectedCount === 1 ? "" : "s"} selected
        </span>
        <Button
          variant="outlined"
          size="small"
          onClick={onClearSelection}
          sx={{ color: "#fff", borderColor: "rgba(255,255,255,0.4)" }}
        >
          Clear
        </Button>
      </div>
      {!bulkAdd && (
        <div className={styles.bulkRow}>
          <span className={styles.bulkLabel}>Files</span>
          <span className={styles.bulkField}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                onToggleBulkAdd(true);
                if (courseUrl && modulesStatus === "idle") {
                  void onSelectCourse(courseUrl);
                }
              }}
            >
              Add to module...
            </Button>
          </span>
          <Button
            variant="outlined"
            size="small"
            color="error"
            onClick={onDelete}
          >
            {confirmBulkDelete ? "Confirm delete" : "Delete"}
          </Button>
        </div>
      )}
      {bulkAdd && (
        <div className={styles.bulkRow} style={{ flexDirection: "column", alignItems: "flex-start" }}>
          {!activeInstitution ? (
            <div className={styles.fieldHint}>
              Pick an institution in the top bar first.
            </div>
          ) : (
            <>
              <CoursePicker
                activeInstitution={activeInstitution}
                courseUrl={courseUrl}
                onSelect={onSelectCourse}
                courseName={courseName}
              />
              {courseUrl && (
                <>
                  <TextField
                    select
                    value={bulkModuleId}
                    onChange={(e) => onBulkModuleSelect(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="Choose a module..."
                    size="small"
                    sx={{ minWidth: 220, marginTop: 1 }}
                    disabled={modulesStatus !== "ready"}
                  >
                    {modulesStatus === "ready" && modules.length === 0 ? (
                      <MenuItem value="">No modules found</MenuItem>
                    ) : (
                      [
                        <MenuItem key="none" value="">
                          Choose a module...
                        </MenuItem>,
                        ...modules.map((m) => (
                          <MenuItem key={m.id} value={m.id}>
                            {m.name}
                          </MenuItem>
                        )),
                      ]
                    )}
                  </TextField>
                  <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={onAddToModule}
                      disabled={adding || bulkModuleId === ""}
                    >
                      {adding ? `${bulkAddStatus || "Adding..."}` : "Add"}
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => {
                        onToggleBulkAdd(false);
                        onBulkModuleSelect("");
                      }}
                      disabled={adding}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
