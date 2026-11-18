import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/20261117190000_notebook_execution_attempts.sql", "utf8");
it("keeps attempts private and binds transitions to owner and session", () => {
  expect(sql).toContain("enable row level security");
  expect(sql).toContain("revoke all on public.notebook_execution_attempts from public, anon, authenticated, service_role");
  expect(sql).toContain("owner_id = p_owner and session_id = p_session and attempt_id = p_attempt");
  expect(sql).toContain("status = 'reserved' and expires_at > now()");
  expect(sql).toContain("set status = 'dispatching', dispatch_started_at = now()");
});
it("scrubs captured content but preserves attempt tombstones", () => {
  expect(sql).toContain("expires_at <= now() and (result is not null or grade_request is not null)");
  expect(sql).toContain("set result = null, grade_request = null");
  expect(sql).not.toMatch(/delete\s+from\s+public\.notebook_execution_attempts/i);
});
