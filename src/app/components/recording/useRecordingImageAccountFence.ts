"use client";
import { useLayoutEffect, useRef } from "react";
import { useSupabase } from "@/context/SupabaseProvider";

type Ref<T> = { current: T };
export function advanceRecordingImageScope(previous: Ref<string>, owner: string, epoch: Ref<number>): boolean {
  if (previous.current === owner) return false;
  previous.current = owner;
  epoch.current++;
  return true;
}
export function useRecordingImageAccountFence(epochRef: Ref<number>, attemptedRef: Ref<boolean>, clear: () => void) {
  const { user, loading } = useSupabase();
  const owner = loading ? "" : user?.id ?? "";
  const previous = useRef(owner);
  const clearRef = useRef(clear);
  useLayoutEffect(() => { clearRef.current = clear; });
  useLayoutEffect(() => {
    if (!advanceRecordingImageScope(previous, owner, epochRef)) return;
    attemptedRef.current = true;
    const ticket = epochRef.current;
    let active = true;
    queueMicrotask(() => { if (active && epochRef.current === ticket) clearRef.current(); });
    return () => { active = false; };
  }, [owner, epochRef, attemptedRef]);
}
