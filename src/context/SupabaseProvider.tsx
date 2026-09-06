"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { setCacheOwner } from "@/lib/workflows/run-form-options-cache";
import type { AccessDecision } from "@/lib/access";

type SupabaseContextValue = {
  supabase: SupabaseClient<Database>;
  session: Session | null;
  user: User | null;
  loading: boolean;
  /**
   * The viewer's access decision, resolved on the SERVER (see
   * src/app/layout.tsx) and handed down as a plain prop - never
   * recomputed or seeded from localStorage on the client, which would be a
   * hydration mismatch the moment the server and first client render
   * disagreed. React only warns on that mismatch; it does not fail the
   * build, so this is a real footgun, not a theoretical one.
   *
   * DISCOVERABILITY ONLY. This value (and `isOwnerDecision(accessDecision)`
   * in particular) is what TopBar consults to decide whether to DRAW the
   * owner-only "Accounts" nav entry - it is not, and must never become, an
   * access-control check. The actual boundary is requireAppOwner() on the
   * server (src/lib/supabase/auth.ts), which runs independently of
   * whatever this field says and is not weakened by this field ever being
   * wrong, stale, or "unavailable". See src/app/layout.tsx's own comment
   * for how this is resolved and why it fails closed on any error.
   */
  accessDecision: AccessDecision;
};

const SupabaseContext = createContext<SupabaseContextValue | null>(null);

export function SupabaseProvider({
  children,
  accessDecision,
}: {
  children: React.ReactNode;
  accessDecision: AccessDecision;
}) {
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
      // setCacheOwner also sweeps localStorage/IndexedDB now
      // (client-state-sweep.ts) on the same owner-changed transition, so
      // this one call is what erases the previous owner's browser-side state
      // as well as clearing the in-memory caches - TopBar.tsx's sign-out
      // still additionally does a full document reload, since that is the
      // only thing that also tears down any module-scope cache that was
      // never registered with setCacheOwner in the first place.
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
    accessDecision,
  };

  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>;
}

export function useSupabase() {
  const ctx = useContext(SupabaseContext);
  if (!ctx) throw new Error("useSupabase must be used within <SupabaseProvider>");
  return ctx;
}
