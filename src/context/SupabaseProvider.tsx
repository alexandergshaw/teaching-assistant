"use client";

import { setSessionDiagnosticAccount } from "@/lib/session-diagnostic-log";
import { clearManualRepoGradeDiagnostics } from "@/app/components/repo-grades/manualRepoGradeDiagnostics";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { setCacheOwner } from "@/lib/workflows/run-form-options-cache";
import type { AccessDecision } from "@/lib/access";
import { createSupabaseAuthObserver, type SupabaseAuthObserver } from "./supabase-auth-observer";

type SupabaseContextValue = {
  supabase: SupabaseClient<Database>;
  session: Session | null;
  user: User | null;
  loading: boolean;
  authObserver: SupabaseAuthObserver;
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
  const [authObserver] = useState(createSupabaseAuthObserver);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const effect = authObserver.begin();

    let previousAccount: string | null = null;
    function applySession(next: Session | null) {
      const nextAccount = next?.user.id ?? null;
      if (previousAccount && previousAccount !== nextAccount) clearManualRepoGradeDiagnostics(previousAccount);
      setSessionDiagnosticAccount(nextAccount);
      previousAccount = nextAccount;
      setSession(next);
      // The existing owner transition clears run-form caches and the previous
      // owner's browser state on bootstrap, sign-out, or account switch.
      setCacheOwner(next?.user.id ?? null);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (effect.onEvent(event, next)) applySession(next);
    });

    function bootstrapFailed() {
      effect.onBootstrapFailure();
      if (effect.isActive()) setLoading(false);
    }

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        bootstrapFailed();
        return;
      }
      if (effect.onBootstrap(data.session)) applySession(data.session);
      if (effect.isActive()) setLoading(false);
    }, bootstrapFailed);

    return () => {
      effect.close();
      sub.subscription.unsubscribe();
    };
  }, [authObserver, supabase]);

  const value: SupabaseContextValue = {
    supabase,
    session,
    user: session?.user ?? null,
    loading,
    authObserver: authObserver.port,
    accessDecision,
  };

  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>;
}

export function useSupabase() {
  const ctx = useContext(SupabaseContext);
  if (!ctx) throw new Error("useSupabase must be used within <SupabaseProvider>");
  return ctx;
}
