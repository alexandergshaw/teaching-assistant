"use client";

import { useEffect, useRef, useState } from "react";
import { emptyProject, keepCurrentLectureExports, LectureSaveConflict, loadLectureProject, saveLectureProject, type LecturePart, type LectureProject } from "./lectureProject";

const pendingWrites = new Map<string, Promise<void>>();

export function useLectureProject(account: string) {
  const [project, setProject] = useState<LectureProject>(emptyProject);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "failed" | "conflict">("saved");
  const revision = useRef(0);
  const current = useRef(project);
  const active = useRef(false);

  useEffect(() => {
    let cancelled = false;
    active.current = true;
    void (async () => {
      try {
        await pendingWrites.get(account)?.catch(() => undefined);
        const saved = await loadLectureProject(account);
        if (!cancelled) {
          revision.current = saved.revision;
          current.current = saved.project;
          setProject(saved.project);
        }
      } catch {
        if (!cancelled) setLoadError("The saved video project could not be opened. Reload the page to try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      active.current = false;
    };
  }, [account]);

  function save(next: LectureProject) {
    setSaveStatus("saving");
    const write = Promise.resolve(pendingWrites.get(account))
      .catch(() => undefined)
      .then(async () => {
        revision.current = await saveLectureProject(account, next, revision.current);
      });
    pendingWrites.set(account, write);
    function finish(status: "saved" | "failed" | "conflict") {
      if (pendingWrites.get(account) !== write) return;
      pendingWrites.delete(account);
      if (active.current) setSaveStatus(status);
    }
    void write.then(() => finish("saved"), (cause: unknown) => finish(cause instanceof LectureSaveConflict ? "conflict" : "failed"));
  }

  function update(change: (project: LectureProject) => LectureProject) {
    if (!active.current) return;
    const previous = current.current;
    let next = change(previous);
    if (next.parts !== previous.parts) {
      const previousParts = new Map(previous.parts.map((part) => [part.id, part]));
      next = { ...next, parts: next.parts.map((part) => {
        const old = previousParts.get(part.id);
        return old && old !== part ? keepCurrentLectureExports(old, part) : part;
      }) };
    }
    current.current = next;
    setProject(next);
    save(next);
  }

  function updatePart(id: string, change: (part: LecturePart) => LecturePart) {
    update((previous) => ({
      ...previous,
      parts: previous.parts.map((part) => part.id === id ? change(part) : part),
    }));
  }

  return { project, loading, loadError, saveStatus, update, updatePart, retrySave: () => save(current.current) };
}
