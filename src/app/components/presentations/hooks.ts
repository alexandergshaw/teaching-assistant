// Persistence hooks for the Presentations panel's controls (PRES-1 wave 3).
//
// Thin React-hook wrapper around panel-logic.ts's pure
// readPersistedJSON/writePersistedJSON so every textbox/select/checkbox here
// survives a reload (project rule: persist-ui-control-state, ta- keys). This
// file is a .ts (not .tsx) but deliberately untested: it is a stateful React
// hook (useState/useEffect), and vitest here renders no component - the pure
// read/write functions it calls are exercised by panel-logic.test.ts instead.

import { useEffect, useState } from "react";
import { readPersistedJSON, writePersistedJSON, type KeyValueStorage } from "./panel-logic";

function browserStorage(): KeyValueStorage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function usePersistedJSON<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const storage = browserStorage();
    if (!storage) return defaultValue;
    return readPersistedJSON(storage, key, defaultValue);
  });

  useEffect(() => {
    const storage = browserStorage();
    if (!storage) return;
    writePersistedJSON(storage, key, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  return [value, setValue];
}
