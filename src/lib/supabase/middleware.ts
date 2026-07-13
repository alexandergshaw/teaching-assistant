import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";
import { isOwnerEmail } from "../owner";

/**
 * Refreshes the Supabase auth session on every request and gates the app to the
 * owner allowlist: anyone not signed in as an approved owner is redirected to
 * /login. Called from `src/middleware.ts`.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not run code between createServerClient and getUser.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Gate everything except the login page and Supabase auth callbacks to the
  // owner allowlist. Static assets are already excluded by the matcher.
  // The /api/cron namespace is also exempt: it is called machine-to-machine
  // (Vercel Cron / a GitHub Action) with no session cookie, and each cron
  // route enforces its OWN Bearer CRON_SECRET check - a stronger auth for an
  // unattended caller than the human session gate. Without this exemption the
  // cron request is redirected to /login (a 307) before it reaches the route.
  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/cron");

  if (!isPublic) {
    if (!isOwnerEmail(user?.email)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }

    // Owner has MFA enrolled but hasn't completed it this session: send them back
    // to /login to finish the second step. (No factor enrolled -> nextLevel is
    // aal1 and this never triggers, so it can't lock anyone out before setup.)
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
