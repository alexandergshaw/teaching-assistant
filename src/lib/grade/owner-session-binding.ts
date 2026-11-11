export interface ExpectedOwnerSession { readonly accountId: string; readonly sessionId: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL = "00000000-0000-0000-0000-000000000000";
export function isExpectedOwnerSession(value: unknown): value is ExpectedOwnerSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2 && typeof record.accountId === "string" && typeof record.sessionId === "string" && UUID.test(record.accountId) && UUID.test(record.sessionId) && record.accountId !== NIL && record.sessionId !== NIL;
}
