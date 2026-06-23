import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { isOwnerEmail } from "@/lib/owner";
import { exchangeCodeForTokens } from "@/lib/google-oauth";
import { saveCredentials } from "@/lib/google-credentials";

// Google redirects here after consent. Verify the CSRF state, exchange the code
// for tokens, persist them (encrypted), and bounce back to the integrations page
// with a status flag. All outcomes redirect so the user never sees raw JSON.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isOwnerEmail(user.email)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const cookieState = request.cookies.get("google_oauth_state")?.value;

  const dest = new URL("/account/integrations", request.url);

  if (oauthError) {
    dest.searchParams.set("error", oauthError);
  } else if (!code || !state || !cookieState || state !== cookieState) {
    dest.searchParams.set("error", "state_mismatch");
  } else {
    try {
      const tokens = await exchangeCodeForTokens(code);
      await saveCredentials(user.id, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiry: new Date(Date.now() + tokens.expiresIn * 1000),
        scope: tokens.scope,
      });
      dest.searchParams.set("connected", "1");
    } catch {
      dest.searchParams.set("error", "exchange_failed");
    }
  }

  const response = NextResponse.redirect(dest);
  response.cookies.delete("google_oauth_state");
  return response;
}
