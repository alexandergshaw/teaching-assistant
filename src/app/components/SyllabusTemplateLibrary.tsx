"use client";

import { useEffect, useRef, useState } from "react";
import {
  listSyllabusTemplatesAction,
  getSyllabusTemplateAction,
  createSyllabusTemplateAction,
  updateSyllabusTemplateAction,
  deleteSyllabusTemplateAction,
} from "../actions";
import type { SyllabusTemplateMeta } from "@/lib/supabase/syllabus-templates";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import styles from "../page.module.css";

// Read a File as a bare base64 string (without the data: prefix).
function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

interface SyllabusTemplateLibraryProps {
  activeTemplateId: string | null;
  onUse: (t: { id: string; name: string; fileName: string; base64: string }) => void;
}

export default function SyllabusTemplateLibrary({ activeTemplateId, onUse }: SyllabusTemplateLibraryProps) {
  const [templates, setTemplates] = useState<SyllabusTemplateMeta[]>([]);
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const createFileRef = useRef<HTMLInputElement>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setState("loading");
    const r = await listSyllabusTemplatesAction();
    if ("error" in r) {
      setState("error");
      setError(r.error);
      return;
    }
    setTemplates(r.templates);
    setState("idle");
  };

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    void load();
  }, []);

  const handleCreate = async () => {
    const file = createFileRef.current?.files?.[0];
    if (!newName.trim()) {
      setError("Enter a template name.");
      return;
    }
    if (!file) {
      setError("Choose a .docx file.");
      return;
    }
    if (!/\.docx$/i.test(file.name)) {
      setError("The template must be a Word .docx file.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const base64 = await readFileBase64(file);
      const r = await createSyllabusTemplateAction(newName.trim(), file.name, base64);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setNewName("");
      if (createFileRef.current) createFileRef.current.value = "";
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (t: SyllabusTemplateMeta) => {
    const name = typeof window !== "undefined" ? window.prompt("Rename template", t.name) : null;
    if (name === null || !name.trim() || name.trim() === t.name) return;
    setBusyId(t.id);
    setError(null);
    const r = await updateSyllabusTemplateAction(t.id, { name: name.trim() });
    setBusyId(null);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    await load();
  };

  const handleReplace = async (t: SyllabusTemplateMeta, file: File) => {
    if (!/\.docx$/i.test(file.name)) {
      setError("The template must be a Word .docx file.");
      return;
    }
    setBusyId(t.id);
    setError(null);
    try {
      const base64 = await readFileBase64(file);
      const r = await updateSyllabusTemplateAction(t.id, { fileName: file.name, base64 });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (t: SyllabusTemplateMeta) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete template "${t.name}"?`)) return;
    setBusyId(t.id);
    setError(null);
    const r = await deleteSyllabusTemplateAction(t.id);
    setBusyId(null);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    await load();
  };

  const handleUse = async (t: SyllabusTemplateMeta) => {
    setBusyId(t.id);
    setError(null);
    const r = await getSyllabusTemplateAction(t.id);
    setBusyId(null);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    onUse({ id: r.template.id, name: r.template.name, fileName: r.template.fileName, base64: r.template.content });
  };

  return (
    <div style={{ border: "1px solid var(--field-border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      {state === "loading" && (
        <div style={{ display: "flex", justifyContent: "center", padding: 12 }}>
          <CircularProgress size={20} />
        </div>
      )}
      {state === "error" && <p className={styles.error}>{error}</p>}
      {state === "idle" && templates.length === 0 && (
        <p className={styles.fieldHint}>No saved templates yet. Upload a .docx below to start your library.</p>
      )}
      {state === "idle" &&
        templates.map((t) => {
          const active = t.id === activeTemplateId;
          const replaceId = `syllabus-template-replace-${t.id}`;
          return (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                padding: "6px 0",
                borderTop: "1px solid var(--field-border)",
                background: active ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{t.name}</span>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>{t.fileName}</div>
              </div>
              <Button variant="contained" size="small" disabled={busyId === t.id} onClick={() => handleUse(t)}>
                {active ? "In use" : "Use"}
              </Button>
              <Button variant="text" size="small" disabled={busyId === t.id} onClick={() => handleRename(t)}>Rename</Button>
              <Button variant="text" size="small" disabled={busyId === t.id} onClick={() => document.getElementById(replaceId)?.click()}>Replace</Button>
              <input
                id={replaceId}
                type="file"
                accept=".docx"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleReplace(t, f);
                  e.target.value = "";
                }}
              />
              <Button variant="text" size="small" color="error" disabled={busyId === t.id} onClick={() => handleDelete(t)}>Delete</Button>
            </div>
          );
        })}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--field-border)", paddingTop: 10 }}>
        <TextField size="small" placeholder="New template name" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={creating} sx={{ flex: "1 1 180px" }} />
        <input ref={createFileRef} type="file" accept=".docx" disabled={creating} />
        <Button variant="outlined" size="small" onClick={handleCreate} disabled={creating || !newName.trim()}>
          {creating ? "Saving..." : "Save template"}
        </Button>
      </div>
      {state === "idle" && error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
