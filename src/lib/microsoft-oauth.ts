// Microsoft identity platform OAuth 2.0 web flow (authorization-code grant with
// offline access) for connecting a school's Outlook / Microsoft 365 mailbox. Raw
// fetch against the Microsoft endpoints to match the rest of the codebase; no SDK.
// Mirrors src/lib/google-oauth.ts.
//
// Only user-consentable delegated scopes are requested so the app needs admin
// approval as rarely as possible. Set MS_OAUTH_TENANT to a specific tenant id or
// domain to lock a single school down; the default "organizations" lets any
// work/school account connect.

const SCOPES = ["offline_access", "Mail.Read", "User.Read"];

function tenant(): string {
  return process.env.MS_OAUTH_TENANT?.trim() || "organizations";
}

function authEndpoint(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`;
}

function tokenEndpoint(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`;
}

export interface MicrosoftTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scope: string | null;
}

function getClientId(): string {
  const id = process.env.MS_OAUTH_CLIENT_ID;
  if (!id) throw new Error("Missing environment variable: MS_OAUTH_CLIENT_ID");
  return id.trim();
}

function getClientSecret(): string {
  const secret = process.env.MS_OAUTH_CLIENT_SECRET;
  if (!secret) throw new Error("Missing environment variable: MS_OAUTH_CLIENT_SECRET");
  return secret.trim();
}

function getRedirectUri(): string {
  const uri = process.env.MS_OAUTH_REDIRECT_URI;
  if (!uri) throw new Error("Missing environment variable: MS_OAUTH_REDIRECT_URI");
  return uri.trim();
}

/** Build the Microsoft consent URL to redirect the user to. */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    response_type: "code",
    redirect_uri: getRedirectUri(),
    response_mode: "query",
    scope: SCOPES.join(" "),
    state,
    // Force the consent screen so a re-connect reliably returns a refresh token.
    prompt: "consent",
  });
  return `${authEndpoint()}?${params.toString()}`;
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
  const response = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const data = (await response.json()) as RawTokenResponse;
  if (!response.ok || data.error) {
    throw new Error(
      `Microsoft token request failed: ${data.error ?? response.status}${
        data.error_description ? ` (${data.error_description})` : ""
      }`
    );
  }
  return data;
}

/** Exchange an authorization code for tokens (includes the refresh token). */
export async function exchangeCodeForTokens(code: string): Promise<MicrosoftTokens> {
  const data = await postToken({
    code,
    client_id: getClientId(),
    client_secret: getClientSecret(),
    redirect_uri: getRedirectUri(),
    grant_type: "authorization_code",
    scope: SCOPES.join(" "),
  });
  if (!data.access_token) throw new Error("Microsoft did not return an access token.");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in ?? 3600,
    scope: data.scope ?? null,
  };
}

/** Exchange a stored refresh token for a fresh access token. */
export async function refreshAccessToken(refreshToken: string): Promise<MicrosoftTokens> {
  const data = await postToken({
    refresh_token: refreshToken,
    client_id: getClientId(),
    client_secret: getClientSecret(),
    grant_type: "refresh_token",
    scope: SCOPES.join(" "),
  });
  if (!data.access_token) throw new Error("Microsoft did not return a refreshed access token.");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in ?? 3600,
    scope: data.scope ?? null,
  };
}
