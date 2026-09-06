import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import SelectionChatWidget from "./components/SelectionChatWidget";
import AiChatFab from "./components/AiChatFab";
import ContextMenu from "./components/ContextMenu";
import { InstitutionCountsProvider } from "./components/InstitutionCounts";
import { VcCountsProvider } from "./components/VcCounts";
import { FilesInboxProvider } from "./components/FilesInbox";
import { DraftedGradesInboxProvider } from "./components/DraftedGradesInbox";
import { MailInboxProvider } from "./components/MailInbox";
import { AccessibilityProvider } from "./components/AccessibilityProvider";
import { SupabaseProvider } from "@/context/SupabaseProvider";
import AppThemeProvider from "./components/AppThemeProvider";
import { ACCESS_DECISION_HEADER } from "@/lib/supabase/proxy";
import type { AccessDecision } from "@/lib/access";

export const metadata: Metadata = {
  title: "Teaching Assistant",
  description: "Upload student submissions, assignment instructions, and a rubric.",
};

/**
 * The decision parseAccessDecisionHeader below falls back to whenever the
 * header is absent, malformed, or simply not one of the six current
 * AccessDecision literals. "anonymous" - not "unavailable" - because absence
 * is not a proven outage: the overwhelmingly common cause is the ordinary one
 * (a public path, where updateSession never computes a decision at all - see
 * ACCESS_DECISION_HEADER's own comment in src/lib/supabase/proxy.ts), and
 * "unavailable" would read, in the UI this value can influence, as "something
 * is broken" for what is actually the normal case. Both literals are equally
 * safe here regardless: this value only ever feeds TopBar's
 * shouldShowOwnerNavEntry (see SupabaseProvider.tsx's own doc comment on the
 * `accessDecision` field), a nav-link VISIBILITY check, and every non-"owner"
 * decision hides that link identically.
 */
const FAIL_CLOSED_DECISION: AccessDecision = "anonymous";

/**
 * Exhaustiveness guard, not a value ever read for its own sake: keying an
 * object literal by every AccessDecision member (rather than hand-writing an
 * array of the six strings) means TypeScript itself rejects this file the
 * moment access.ts's AccessDecision union gains or loses a member and this
 * object is not updated to match - the same "fail closed on the
 * unrecognised, and never silently drift from the one real union" property
 * access.ts's own resolveAccess uses for profile.status (see that function's
 * doc comment, point 8), applied here to keep this file's copy of the valid
 * literal set honest without importing a runtime array access.ts does not
 * export.
 */
const KNOWN_ACCESS_DECISIONS: Record<AccessDecision, true> = {
  anonymous: true,
  pending: true,
  suspended: true,
  unavailable: true,
  active: true,
  owner: true,
};

/**
 * Parses the request gate's ACCESS_DECISION_HEADER value into an
 * AccessDecision - or fails closed to FAIL_CLOSED_DECISION on anything that
 * is not EXACTLY one of the six current literals. Pure, total, and exported
 * so it is unit-testable without next/headers or any request context - see
 * this file's own test file.
 *
 * THE HEADER IS ATTACKER-CONTROLLED INPUT, not merely untrusted-until-parsed:
 * a client can send `x-ta-access-decision: owner` itself, and on some request
 * this function's own gate (src/lib/supabase/proxy.ts's updateSession) never
 * touches at all - a route outside that file's config.matcher, for instance -
 * that literal string would reach this parser completely unfiltered. This
 * function therefore CANNOT distinguish a value the gate genuinely computed
 * from one a client typed by hand: `parseAccessDecisionHeader("owner")`
 * returns `"owner"` regardless of which of those actually produced the
 * string - see this file's own test file for that exact case, spelled out
 * rather than left implicit. That is deliberately acceptable, and is not a
 * gap this parser is trying to close, because of what the returned value is
 * actually used for: SupabaseProvider hands it to TopBar purely to decide
 * whether to DRAW the owner-only "Accounts" nav entry (a visibility check,
 * never an access check - see SupabaseProvider.tsx's own doc comment on the
 * `accessDecision` field it carries). The REAL boundary that keeps a
 * non-owner out of anything is requireAppOwner() on the server
 * (src/lib/supabase/auth.ts) plus the gate's own redirect, and NEITHER of
 * those ever reads this header or calls this function - so even a fully
 * spoofed "owner" reaching here grants nothing beyond a visible link that
 * leads to a page the spoofer still cannot use.
 *
 * What this parser DOES exist to close: a value that is not even a
 * syntactically valid AccessDecision at all - absent (the common case, most
 * paths that reach this layout unauthenticated never had one stamped),
 * truncated, differently-cased, or an arbitrary string a malformed request or
 * a future bug could produce - must never reach TopBar's check as anything
 * other than one of the six real literals, so a hand-rolled string compare
 * downstream can never be surprised by a value outside the type it declares.
 */
export function parseAccessDecisionHeader(raw: string | null | undefined): AccessDecision {
  if (typeof raw !== "string") {
    return FAIL_CLOSED_DECISION;
  }
  if (!Object.prototype.hasOwnProperty.call(KNOWN_ACCESS_DECISIONS, raw)) {
    return FAIL_CLOSED_DECISION;
  }
  return raw as AccessDecision;
}

/**
 * Reads the viewer's access decision for TopBar's owner-nav discoverability
 * check (AC C4) - and ONLY for that - from the header the request gate
 * (updateSession, src/lib/supabase/proxy.ts) already stamped with it. This
 * used to independently RECOMPUTE the exact same decision here in the root
 * layout (a second getUser() call plus a second app_users read, on every
 * single request this layout wraps - which is every request in the app),
 * moments after the gate had already computed it for the very same request;
 * see ACCESS_DECISION_HEADER's own comment for why paying that cost twice,
 * in series, mattered on Vercel Hobby's 60s function cap. Reading a header
 * next/headers has already parsed out of the incoming request costs nothing
 * comparable: no network call, no timeout to bound, no failure mode of its
 * own beyond the header being missing or malformed - which
 * parseAccessDecisionHeader (above) already turns into the same fail-closed
 * answer a missing/failed lookup used to produce here.
 *
 * NOT a second access-control gate, exactly as the function this replaces
 * was not: the request gate has already run for this exact request and is
 * what actually keeps a non-owner out of anything; requireAppOwner()
 * (src/lib/supabase/auth.ts) is what keeps a non-owner out of the
 * /account/people server actions themselves. See parseAccessDecisionHeader's
 * own doc comment for why trusting this header for that nav-visibility
 * purpose is safe even though the header itself is attacker-controlled.
 *
 * NEVER THROWS: wrapped so that even an unexpected failure from `headers()`
 * itself falls back to FAIL_CLOSED_DECISION rather than propagating - this
 * layout wraps every page, /login included, and must not crash the app over
 * a value that only ever controls whether one nav link is drawn.
 */
async function readAccessDecisionFromGateHeader(): Promise<AccessDecision> {
  try {
    const headerList = await headers();
    return parseAccessDecisionHeader(headerList.get(ACCESS_DECISION_HEADER));
  } catch {
    return FAIL_CLOSED_DECISION;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeBootstrap = `(function(){try{var t=localStorage.getItem("ta-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="light";}})();`;
  const accessDecision = await readAccessDecisionFromGateHeader();

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <AppThemeProvider>
          <SupabaseProvider accessDecision={accessDecision}>
            <InstitutionCountsProvider>
              <VcCountsProvider>
                <FilesInboxProvider>
                  <DraftedGradesInboxProvider>
                    <MailInboxProvider>
                      <AccessibilityProvider>{children}</AccessibilityProvider>
                    </MailInboxProvider>
                  </DraftedGradesInboxProvider>
                </FilesInboxProvider>
              </VcCountsProvider>
            </InstitutionCountsProvider>
            <SelectionChatWidget />
            <AiChatFab />
            <ContextMenu />
          </SupabaseProvider>
        </AppThemeProvider>
      </body>
    </html>
  );
}
