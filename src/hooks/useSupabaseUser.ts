"use client";

import { useSupabase } from "@/context/SupabaseProvider";

export function useSupabaseUser() {
  const { user, loading } = useSupabase();
  return { user, loading };
}
