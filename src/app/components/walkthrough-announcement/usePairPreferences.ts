"use client";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPairPreferenceStore, pairRole, preferenceChoice } from "./pair-preferences";
import type { TemplateChoice } from "./announcement-draft-slots";
import { recordWalkthroughDiagnostic } from "./walkthrough-diagnostics";
export function usePairPreferences(scope: string, enabled: boolean, apply: (id: string, choice: TemplateChoice) => void) {
  const store = useRef<ReturnType<typeof createPairPreferenceStore> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useLayoutEffect(() => {
    store.current = null;
    if (!enabled) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      let result;
      try {
        const next = createPairPreferenceStore(scope, window.localStorage);
        result = next.load();
        store.current = next;
      } catch { result = { value: { weekly: null, midweek: null }, error: "storage-unavailable" as const }; }
      apply("wta-slot-1", preferenceChoice(result.value.weekly));
      apply("wta-slot-2", preferenceChoice(result.value.midweek));
      setNotice(result.error ? "Saved pair choices could not be restored. Choose each format explicitly; browser storage may be unavailable." : null);
      if (result.error) recordWalkthroughDiagnostic("preferences", result.error, 0);
    });
    return () => { cancelled = true; store.current = null; };
  }, [scope, enabled, apply]);
  const choose = useCallback((id: string, choice: TemplateChoice) => {
    apply(id, choice);
    const role = pairRole(id);
    if (role && !store.current?.choose(role, choice)) {
      setNotice("This choice applies now but could not be saved in this browser. Choose it again after reloading.");
      recordWalkthroughDiagnostic("preferences", "storage-unavailable", 0, role);
    }
  }, [apply]);
  return { choose, notice };
}
