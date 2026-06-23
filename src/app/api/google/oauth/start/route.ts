import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentUser } from "@/lib/supabase/auth";
import { isOwnerEmail } from "@/lib/owner";
import { buildAuthUrl } from "@/lib/google-oauth";

// Kick off the Google OAuth consent flow. Middleware already gates this route to
// the owner; we re-check defensively, mint a CSRF `state` value, stash it in a
// short-lived httpOnly cookie, and redirect to Google's consent screen.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!isOwnerEmail(user?.email)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(buildAuthUrl(state));
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
