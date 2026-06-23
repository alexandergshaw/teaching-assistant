// Google OAuth 2.0 web-flow helpers (authorization-code grant with offline
// access). Raw fetch against Google's endpoints to match the rest of the
// codebase; no SDK. Used by the /api/google/oauth/* route handlers and by the
// credential store when refreshing an expired access token.

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

// calendar.readonly powers freeBusy lookups; calendar.events lets us create the
// Google Meet booking (Phase 2). Both are requested up front so connecting once
// covers every feature and no second consent is needed later.
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

export interface GoogleTokens {
  accessToken: string;
  /** Only present on the initial authorization-code exchange, not on refresh. */
  refreshToken: string | null;
  /** Seconds until the access token expires. */
  expiresIn: number;
  scope: string | null;
}

function getClientId(): string {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!id) throw new Error("Missing environment variable: GOOGLE_OAUTH_CLIENT_ID");
  return id;
}

function getClientSecret(): string {
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!secret) throw new Error("Missing environment variable: GOOGLE_OAUTH_CLIENT_SECRET");
  return secret;
}

function getRedirectUri(): string {
  const uri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!uri) throw new Error("Missing environment variable: GOOGLE_OAUTH_REDIRECT_URI");
  return uri;
}

/** Build the Google consent URL to redirect the user to. */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    // Force the consent screen so Google reliably returns a refresh token even
    // on re-connect (it otherwise omits it once already granted).
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function postToken(body: Record<string, string>): Promise<RawTokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const data = (await response.json()) as RawTokenResponse;
  if (!response.ok || data.error) {
    throw new Error(
      `Google token request failed: ${data.error ?? response.status}${
        data.error_description ? ` (${data.error_description})` : ""
      }`
    );
  }
  return data;
}

/** Exchange an authorization code for tokens (includes the refresh token). */
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const data = await postToken({
    code,
    client_id: getClientId(),
    client_secret: getClientSecret(),
    redirect_uri: getRedirectUri(),
    grant_type: "authorization_code",
  });
  if (!data.access_token) throw new Error("Google did not return an access token.");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in ?? 3600,
    scope: data.scope ?? null,
  };
}

/** Exchange a stored refresh token for a fresh access token. */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const data = await postToken({
    refresh_token: refreshToken,
    client_id: getClientId(),
    client_secret: getClientSecret(),
    grant_type: "refresh_token",
  });
  if (!data.access_token) throw new Error("Google did not return a refreshed access token.");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in ?? 3600,
    scope: data.scope ?? null,
  };
}
