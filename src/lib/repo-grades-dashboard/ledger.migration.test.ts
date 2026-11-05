import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// These checks pin the SQL draft's shape. Transaction and RLS behavior still
// require an executed migration against PostgreSQL.
const draft = readFileSync(new URL("../../../docs/repo-grades-dashboard-ledger.sql", import.meta.url), "utf8");
const binding = readFileSync(new URL(
  "../../../supabase/migrations/20261105175836_repo_grade_attempt_profile_binding.sql", import.meta.url,
), "utf8");
const fidelity = readFileSync(new URL(
  "../../../supabase/migrations/20261105180704_repo_grade_feedback_fidelity.sql", import.meta.url,
), "utf8");
const ledger = readFileSync(new URL("./ledger.ts", import.meta.url), "utf8");

describe("repository grading ledger SQL draft", () => {
  it("separates course-deletable history from private execution reservations", () => {
    const reservationTable = draft.match(/create table public\.repo_grade_reservations \(([\s\S]*?)\);/)?.[1];
    expect(reservationTable).toContain("references auth.users (id) on delete cascade");
    expect(reservationTable).not.toMatch(/course|repo_grade_attempts|claim_token/);
    expect(draft).toContain("revoke all on public.repo_grade_reservations from public, anon, authenticated, service_role");
    expect(draft).toMatch(/left join public\.repo_grade_attempts a on a\.generation = r\.generation and a\.user_id = r\.user_id\s+where r\.user_id = p_user_id and \(\s+a\.generation is null\s+or/);
  });

  it("compares locked saved scope and rubric inputs, independent of the course timestamp", () => {
    const claim = draft.split("create function public.repo_grade_claim(")[1]?.split("$$;")[0];
    expect(claim).toMatch(/c\.user_id = p_user_id for share;[\s\S]*p_course_config is distinct from jsonb_build_object/);
    expect(claim).toContain("'repos', course_row.repos");
    expect(claim).toContain("'rubric_data', course_row.rubric_data");
    expect(claim).not.toContain("updated_at");
  });
});

describe("repository grading feedback fidelity migration structure", () => {
  it("keeps existing evaluations legacy and writes new exact fields without normalization", () => {
    expect(fidelity).toContain("add column feedback_sections jsonb check");
    expect(fidelity).not.toMatch(/update public\.repo_grade_evaluations|substring\(|regexp_replace\(/i);
    expect(fidelity).toMatch(/insert into public\.repo_grade_evaluations \(generation, score, feedback, rubric, feedback_sections\)\s+values \(p_generation, p_score, p_feedback, p_rubric, p_feedback_sections\)/);
    expect(fidelity).toContain("e.feedback_sections, a.feedback_retention");
  });

  it("rejects incomplete evidence or a retention label on any successful settlement", () => {
    expect(fidelity).toContain("p_score is not null and (p_outcome <> 'succeeded' or p_feedback_sections is null)");
    expect(fidelity).toContain("p_feedback_retention is not null and (p_outcome <> 'partial' or attempt.mode = 'manual')");
    expect(fidelity).toContain("length(feedback) <= 48000");
    expect(fidelity).toContain("length(item->>'comment') > 4096");
  });

  it("keeps both settlement paths fenced by the private claim and new execute access service-only", () => {
    const signature = "public.repo_grade_settle(uuid, bigint, uuid, text, boolean, numeric, text, jsonb, jsonb, text)";
    expect(fidelity).toContain(`revoke all on function ${signature}\n  from public, anon, authenticated`);
    expect(fidelity).toContain(`grant execute on function ${signature}\n  to service_role`);
    expect(fidelity).toContain("grant update (feedback_retention) on public.repo_grade_attempts to service_role;");
    expect(fidelity).toContain("a.user_id = p_user_id and a.generation = p_generation and a.claim_token = p_token and a.status = 'claimed'");
    expect(fidelity).toContain("p_score, p_feedback, p_rubric, null::jsonb, null::text");
    expect(ledger).toMatch(/^import "server-only";/);
  });
});

describe("repository grading cohort binding migration structure", () => {
  const claim = binding.split("create function public.repo_grade_claim(")[1]?.split("$$;")[0] ?? "";

  it("fences stale profiles under the account lock before changing attempts or reserving capacity", () => {
    expect(claim).toMatch(/pg_advisory_xact_lock\(pg_catalog\.hashtextextended\('repo-grade:' \|\| p_user_id::text, 0\)\);[\s\S]*for share;[\s\S]*from public\.repo_grade_current_profiles c[\s\S]*join public\.repo_grade_rubric_receipts r using \(course_id, user_id, folder, configuration_fingerprint\)[\s\S]*if not found then return jsonb_build_object\('status', 'configuration-changed'\); end if;[\s\S]*update public\.repo_grade_attempts/);
    expect(binding).toContain("drop function public.repo_grade_claim(uuid, uuid, text, text, text, text, text, text, jsonb)");
  });

  it("requires an exact receipt in the same account, course, folder and cohort", () => {
    expect(claim).toMatch(/c\.user_id = p_user_id and c\.course_id = p_course_id and c\.folder = p_folder\s+and r\.cohort_id = p_cohort_id and r\.receipt = p_receipt/);
    expect(claim).toMatch(/insert into public\.repo_grade_attempts[\s\S]*frozen\.cohort_id, frozen\.configuration_fingerprint,\s+frozen\.receipt ->> 'rubricFingerprint', frozen\.receipt ->> 'profileFingerprint'[\s\S]*insert into public\.repo_grade_reservations/);
    expect(binding).toMatch(/foreign key \(course_id, user_id, folder, cohort_id\)\s+references public\.repo_grade_rubric_receipts/);
  });

  it("reads the historical receipt by generation and scope even after a profile change", () => {
    const recovery = binding.split("create function public.repo_grade_read_attempt_profile(")[1]?.split("$$;")[0];
    expect(recovery).toContain("join public.repo_grade_rubric_receipts r using (course_id, user_id, folder, cohort_id, configuration_fingerprint)");
    expect(recovery).toMatch(/a\.generation = p_generation and a\.user_id = p_user_id and a\.course_id = p_course_id\s+and a\.folder = p_folder/);
    expect(recovery).not.toContain("repo_grade_current_profiles");
  });
});
