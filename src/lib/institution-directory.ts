export type DirectoryColumnType = "text" | "date" | "https";
export type EmailClient = "" | "outlook" | "gmail" | "other";
export type LmsType = "" | "canvas" | "blackboard" | "moodle" | "brightspace" | "other";

export interface InstitutionDirectoryProfile {
  acronym: string;
  fullName: string;
  emailClient: EmailClient;
  emailClientOtherName: string;
  lmsOtherName: string;
  facultyPortalUrl: string;
  websiteUrl: string;
  department: string;
}

export interface InstitutionDirectoryColumn {
  id: string;
  label: string;
  type: DirectoryColumnType;
  position: number;
}

export interface InstitutionDirectoryRecord {
  profile: InstitutionDirectoryProfile;
  commonValues: { email: string; outlookUrl: string; lmsUrl: string; lmsType: string };
  values: Readonly<Record<string, string>>;
}

export interface InstitutionDirectoryState {
  records: readonly InstitutionDirectoryRecord[];
  columns: readonly InstitutionDirectoryColumn[];
}

export type Validation<T> = { ok: true; value: T } | { ok: false; reason: string };

const RESERVED_LABELS = new Set([
  "password", "passphrase", "master password", "secret", "token", "access token", "refresh token",
  "api key", "client secret", "private key", "recovery code", "one time code", "otp", "totp", "mfa code", "username", "vault export",
]);
const CREDENTIAL_KEYS = new Set([
  "password", "masterpassword", "apikey", "accesstoken", "refreshtoken", "clientsecret", "secret",
  "privatekey", "recoverycode", "oneTimeCode", "otp", "totp", "mfacode", "username", "vaultexport",
].map((value) => value.toLowerCase()));
const PROFILE_KEYS = new Set([
  "acronym", "fullName", "email", "emailClient", "emailClientOtherName", "emailUrl", "lmsType", "lmsOtherName",
  "lmsUrl", "facultyPortalUrl", "websiteUrl", "department",
]);

function objectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasCredentialKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasCredentialKey);
  if (!objectRecord(value)) return false;
  return Object.entries(value).some(([key, child]) =>
    CREDENTIAL_KEYS.has(key.replace(/[-_\s]/g, "").toLowerCase()) || hasCredentialKey(child)
  );
}

function textField(value: unknown, max = 240): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= max ? normalized : null;
}

export function normalizeInstitutionAcronym(raw: string): string {
  return raw.trim().toUpperCase();
}

export function validateInstitutionDestination(raw: string): Validation<string> {
  const value = raw.trim();
  if (!value) return { ok: false, reason: "blank" };
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true, value: url.toString() };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export function validateInstitutionDirectoryProfile(input: unknown, options: { legacyLmsType?: string } = {}): Validation<InstitutionDirectoryProfile & {
  email: string; emailUrl: string; lmsType: LmsType; lmsUrl: string;
}> {
  if (!objectRecord(input) || hasCredentialKey(input) || Object.keys(input).some((key) => !PROFILE_KEYS.has(key))) {
    return { ok: false, reason: "invalid-profile" };
  }
  const acronym = typeof input.acronym === "string" ? normalizeInstitutionAcronym(input.acronym) : "";
  if (!/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(acronym)) return { ok: false, reason: "invalid-acronym" };
  const fullName = textField(input.fullName ?? "");
  const emailClientOtherName = textField(input.emailClientOtherName ?? "");
  const lmsOtherName = textField(input.lmsOtherName ?? "");
  const department = textField(input.department ?? "");
  if (fullName === null || emailClientOtherName === null || lmsOtherName === null || department === null) {
    return { ok: false, reason: "invalid-text" };
  }
  const emailClient = input.emailClient ?? "";
  const lmsType = input.lmsType ?? "";
  if (!["", "outlook", "gmail", "other"].includes(String(emailClient))) return { ok: false, reason: "invalid-email-client" };
  if (!["", "canvas", "blackboard", "moodle", "brightspace", "other"].includes(String(lmsType)) &&
      lmsType !== options.legacyLmsType) {
    return { ok: false, reason: "invalid-lms-type" };
  }
  const email = textField(input.email ?? "", 320);
  if (email === null || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { ok: false, reason: "invalid-email" };
  const urls: Record<string, string> = {};
  for (const key of ["emailUrl", "lmsUrl", "facultyPortalUrl", "websiteUrl"] as const) {
    const raw = textField(input[key] ?? "", 2048);
    if (raw === null) return { ok: false, reason: `invalid-${key}` };
    if (raw) {
      const validated = validateInstitutionDestination(raw);
      if (!validated.ok) return { ok: false, reason: `invalid-${key}` };
      urls[key] = validated.value;
    } else urls[key] = "";
  }
  if (emailClient === "other" && !emailClientOtherName) return { ok: false, reason: "missing-email-client-name" };
  if (lmsType === "other" && !lmsOtherName) return { ok: false, reason: "missing-lms-name" };
  return {
    ok: true,
    value: {
      acronym, fullName, emailClient: emailClient as EmailClient,
      emailClientOtherName: emailClient === "other" ? emailClientOtherName : "",
      lmsOtherName: lmsType === "other" ? lmsOtherName : "",
      facultyPortalUrl: urls.facultyPortalUrl, websiteUrl: urls.websiteUrl, department,
      email, emailUrl: urls.emailUrl, lmsType: lmsType as LmsType, lmsUrl: urls.lmsUrl,
    },
  };
}

function labelKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[-_\s]+/g, " ");
}

export function validateInstitutionDirectoryColumn(
  input: unknown,
  existing: readonly InstitutionDirectoryColumn[] = []
): Validation<{ label: string; type: DirectoryColumnType }> {
  if (!objectRecord(input) || hasCredentialKey(input)) return { ok: false, reason: "invalid-column" };
  const label = textField(input.label, 48);
  const type = input.type;
  if (!label) return { ok: false, reason: "invalid-label" };
  if (RESERVED_LABELS.has(labelKey(label))) return { ok: false, reason: "credential-label" };
  const builtIns = new Set([
    "institution", "institution acronym", "acronym", "institution name", "full name", "email",
    "email client", "email client name", "email url", "email web url", "lms", "lms type", "lms url",
    "faculty portal", "faculty portal url", "institution website", "institution website url", "website", "department",
  ]);
  if (builtIns.has(labelKey(label)) || existing.some((column) => labelKey(column.label) === labelKey(label))) {
    return { ok: false, reason: "duplicate-label" };
  }
  if (type !== "text" && type !== "date" && type !== "https") return { ok: false, reason: "invalid-type" };
  return { ok: true, value: { label, type } };
}

export function validateInstitutionDirectoryValue(type: DirectoryColumnType, raw: unknown): Validation<string> {
  if (typeof raw !== "string" || raw.length > 2048) return { ok: false, reason: "invalid-value" };
  const value = raw.trim();
  if (!value) return { ok: true, value: "" };
  if (type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: false, reason: "invalid-date" };
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) return { ok: false, reason: "invalid-date" };
    return { ok: true, value };
  }
  if (type === "https") return validateInstitutionDestination(value);
  return value.length <= 1000 ? { ok: true, value } : { ok: false, reason: "invalid-value" };
}

export function resolveInstitutionLmsAction(record: InstitutionDirectoryRecord):
  | { kind: "open"; href: string }
  | { kind: "not-set" }
  | { kind: "unavailable" } {
  if (!record.commonValues.lmsUrl.trim()) return { kind: "not-set" };
  const result = validateInstitutionDestination(record.commonValues.lmsUrl);
  return result.ok ? { kind: "open", href: result.value } : { kind: "unavailable" };
}

export function containsInstitutionCredentialProperties(value: unknown): boolean {
  return hasCredentialKey(value);
}
