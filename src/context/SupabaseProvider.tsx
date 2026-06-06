"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

type SupabaseContextValue = {
  supabase: SupabaseClient<Database>;
  session: Session | null;
  user: User | null;
  loading: boolean;
};

const SupabaseContext = createContext<SupabaseContextValue | null>(null);

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  // Wrap client creation so that build-time static prerendering (which runs
  // "use client" components on the server) does not crash when the
  // NEXT_PUBLIC_SUPABASE_* environment variables are not set.  At build time
  // the useMemo callback runs server-side; createBrowserClient throws if
  // credentials are absent.  We catch that and return a placeholder client
  // with non-empty (but invalid) credentials so the render succeeds without
  // making any real network calls.  In the browser the real env vars are
  // always present, so this fallback is never reached at runtime.
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://placeholder.invalid",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key"
      );
    }
  }, []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const value: SupabaseContextValue = {
    supabase,
    session,
    user: session?.user ?? null,
    loading,
  };

  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>;
}

export function useSupabase() {
  const ctx = useContext(SupabaseContext);
  if (!ctx) throw new Error("useSupabase must be used within <SupabaseProvider>");
  return ctx;
}
