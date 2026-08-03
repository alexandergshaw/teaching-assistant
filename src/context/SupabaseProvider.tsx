"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { setCacheOwner } from "@/lib/workflows/run-form-options-cache";

type SupabaseContextValue = {
  supabase: SupabaseClient<Database>;
  session: Session | null;
  user: User | null;
  loading: boolean;
};

const SupabaseContext = createContext<SupabaseContextValue | null>(null);

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      // Declares the run-form options cache's owner for the session this
      // provider resolves on first mount, not just on later auth events -
      // otherwise a user who was already signed in before this effect ran
      // (the common case) would never have an owner recorded, and the
      // no-op-on-repeat check in setCacheOwner would treat their real first
      // sign-in-driven auth event (if any fires at all) as "no change".
      setCacheOwner(data.session?.user.id ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Covers sign-out (next is null), sign-in, and a direct user switch -
      // see run-form-options-cache.ts's setCacheOwner for why a single
      // "owner changed" check replaces enumerating each of those paths.
      setCacheOwner(next?.user.id ?? null);
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
