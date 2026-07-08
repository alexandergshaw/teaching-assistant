import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentUser } from "@/lib/supabase/auth";
import { isOwnerEmail } from "@/lib/owner";
import { buildAuthUrl } from "@/lib/microsoft-oauth";

// Kick off the Microsoft (Outlook) consent flow for one school. Middleware gates
// this to the owner; we re-check, mint a CSRF nonce, carry the institution in the
// OAuth `state` (nonce:INSTITUTION) with the nonce also stashed in a short-lived
// httpOnly cookie, and redirect to consent.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isOwnerEmail(user?.email)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const institution = (new URL(request.url).searchParams.get("institution") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,16}$/.test(institution)) {
    return NextResponse.redirect(new URL("/account/integrations?error=bad_institution", request.url));
  }

  const nonce = randomBytes(16).toString("hex");
  const state = `${nonce}:${institution}`;
  const response = NextResponse.redirect(buildAuthUrl(state));
  response.cookies.set("ms_oauth_state", nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
