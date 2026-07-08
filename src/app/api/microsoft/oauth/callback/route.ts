import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { isOwnerEmail } from "@/lib/owner";
import { exchangeCodeForTokens } from "@/lib/microsoft-oauth";
import { saveCredentials } from "@/lib/microsoft-credentials";

// Microsoft redirects here after consent. Verify the CSRF nonce, exchange the code
// for tokens, persist them (encrypted) under the school the connect was for, and
// bounce back to the integrations page with a status flag. A tenant that requires
// admin approval surfaces as error=admin_required so the UI can explain it.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isOwnerEmail(user.email)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description") ?? "";
  const cookieNonce = request.cookies.get("ms_oauth_state")?.value;

  const [stateNonce, institution] = (state ?? "").split(":");
  const dest = new URL("/account/integrations", request.url);
  if (institution) dest.searchParams.set("institution", institution);

  if (oauthError) {
    if (/AADSTS90094/i.test(errorDescription) || /admin/i.test(errorDescription)) {
      dest.searchParams.set("error", "admin_required");
    } else {
      dest.searchParams.set("error", oauthError);
      if (errorDescription) dest.searchParams.set("detail", errorDescription.slice(0, 300));
    }
  } else if (!code || !stateNonce || !institution || !cookieNonce || stateNonce !== cookieNonce) {
    dest.searchParams.set("error", "state_mismatch");
  } else {
    try {
      const tokens = await exchangeCodeForTokens(code);
      await saveCredentials(user.id, institution, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiry: new Date(Date.now() + tokens.expiresIn * 1000),
        scope: tokens.scope,
      });
      dest.searchParams.set("connected", "1");
    } catch (err) {
      console.error("[microsoft-oauth] Token exchange failed:", err);
      const message = err instanceof Error ? err.message : "";
      if (/AADSTS90094/i.test(message)) {
        dest.searchParams.set("error", "admin_required");
      } else {
        dest.searchParams.set("error", "exchange_failed");
        if (message) dest.searchParams.set("detail", message.slice(0, 300));
      }
    }
  }

  const response = NextResponse.redirect(dest);
  response.cookies.delete("ms_oauth_state");
  return response;
}
