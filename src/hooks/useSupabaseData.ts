"use client";

import { useEffect, useState } from "react";
import { useSupabase } from "@/context/SupabaseProvider";
import type { PostgrestError } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Query<T> = (supabase: SupabaseClient<Database>) => PromiseLike<{
  data: T | null;
  error: PostgrestError | null;
}>;

/**
 * Run a Supabase query against the browser client and track loading/error state.
 *
 *   const { data, error, loading } = useSupabaseData((sb) =>
 *     sb.from("syllabi").select("*").eq("user_id", userId)
 *   );
 */
export function useSupabaseData<T>(query: Query<T>, deps: unknown[] = []) {
  const { supabase } = useSupabase();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<PostgrestError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // `loading` is seeded true by useState, so the only state transition needed
    // is to false once the query resolves (inside the async callback below).

    Promise.resolve(query(supabase)).then((result) => {
      if (!active) return;
      setData(result.data);
      setError(result.error);
      setLoading(false);
    });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, ...deps]);

  return { data, error, loading };
}
