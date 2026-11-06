import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAppOwner } from "@/lib/supabase/auth";
import { captureRepoGradeProfile, resolveRepoGradeRubric } from "./profile";
import {
  freezeRepoGradeRubric, readCurrentRepoGradeProfile, readFrozenRepoGradeProfile, readRepoGradeAttemptProfile,
  readCurrentRepoGradeProfilesForOwner, saveRepoGradeProfile,
} from "./profile-store";

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ rpc, from }) }));

const owner = { id: "owner", email: "owner@example.test" };
const scope = { courseId: "course", folder: "modules/week 1" };
const grader = { provider: "gemini" as const, model: "model", graderVersion: "grader-v1" };
const cohortId = "8d74ee61-463c-4b3f-af5d-5fc9b55023c1";

function capturedProfile(settings = {}, profileScope = scope) {
  const result = captureRepoGradeProfile({ accountId: owner.id, ...profileScope }, settings, grader);
  if (result.status !== "ready") throw new Error("Invalid test profile");
  return result.profile;
}

function currentProfileRow(profile = capturedProfile()) {
  return {
    user_id: profile.accountId, course_id: profile.courseId, folder: profile.folder,
    configuration_fingerprint: profile.configurationFingerprint,
    repo_grade_profile_versions: { profile },
  };
}

function mockCurrentProfilesRead(result: { data: unknown; error: unknown; count: number | null }) {
  const query = { select: vi.fn(), eq: vi.fn(), limit: vi.fn(), retry: vi.fn().mockResolvedValue(result) };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  from.mockReturnValue(query);
  return query;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAppOwner).mockResolvedValue(owner);
});

describe("repository grading profile storage adapter", () => {
  it("loads a complete owner/course snapshot of current source refs without returning rubric or instructions", async () => {
    const alternate = capturedProfile({ sourceRef: "class/work", rubric: "Private rubric" }, { ...scope, folder: "alternate" });
    const query = mockCurrentProfilesRead({ data: [currentProfileRow(), currentProfileRow(alternate)], error: null, count: 2 });
    await expect(readCurrentRepoGradeProfilesForOwner(owner.id, scope.courseId))
      .resolves.toEqual(new Map([[scope.folder, null], ["alternate", "class/work"]]));
    expect(from).toHaveBeenCalledExactlyOnceWith("repo_grade_current_profiles");
    expect(query.select).toHaveBeenCalledExactlyOnceWith(
      "user_id, course_id, folder, configuration_fingerprint, repo_grade_profile_versions(profile)", { count: "exact" },
    );
    expect(query.eq.mock.calls).toEqual([["user_id", owner.id], ["course_id", scope.courseId]]);
    expect(query.retry).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("only treats a proven empty snapshot as having no current overrides", async () => {
    mockCurrentProfilesRead({ data: [], error: null, count: 0 });
    await expect(readCurrentRepoGradeProfilesForOwner(owner.id, scope.courseId)).resolves.toEqual(new Map());
    for (const result of [
      { data: [], error: { message: "private storage error" }, count: 0 },
      { data: [currentProfileRow()], error: null, count: null },
      { data: [currentProfileRow()], error: null, count: 2 },
    ]) {
      mockCurrentProfilesRead(result);
      await expect(readCurrentRepoGradeProfilesForOwner(owner.id, scope.courseId))
        .rejects.toThrow(/^Repository grading profile storage is unavailable$/);
    }
  });

  it("rejects duplicate folders and malformed or cross-scope current profile rows", async () => {
    const row = currentProfileRow();
    for (const data of [
      [row, row],
      [{ ...row, user_id: "other" }],
      [{ ...row, course_id: "other" }],
      [{ ...row, folder: "other" }],
      [{ ...row, configuration_fingerprint: "0".repeat(64) }],
      [{ ...row, repo_grade_profile_versions: null }],
      [{ ...row, repo_grade_profile_versions: { profile: { ...capturedProfile(), sourceRef: "../private" } } }],
    ]) {
      mockCurrentProfilesRead({ data, error: null, count: data.length });
      await expect(readCurrentRepoGradeProfilesForOwner(owner.id, scope.courseId))
        .rejects.toThrow(/^Repository grading profile storage is unavailable$/);
    }
  });

  it("captures default-off execution under the authenticated owner and sends the expected settings version", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const previous = capturedProfile().configurationFingerprint;
    const profile = capturedProfile({ instructions: "Use the per-folder instructions" });
    await expect(saveRepoGradeProfile(scope, { instructions: profile.instructions }, grader, previous))
      .resolves.toEqual({ ...profile, runCode: false });
    expect(rpc).toHaveBeenCalledWith("repo_grade_save_profile", {
      p_user_id: owner.id, p_course_id: scope.courseId, p_folder: scope.folder,
      p_configuration_fingerprint: profile.configurationFingerprint,
      p_expected_configuration_fingerprint: previous, p_profile: profile,
    });
  });

  it("does not report a rejected save as persisted", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(saveRepoGradeProfile(scope, {}, grader, null)).resolves.toBeNull();
  });

  it("uses the first frozen rubric returned by the database, including exact case and whitespace", async () => {
    const profile = capturedProfile();
    const stored = resolveRepoGradeRubric(profile, "First  rubric\nWith spacing");
    rpc.mockResolvedValue({ data: stored, error: null });
    await expect(freezeRepoGradeRubric(profile, cohortId, "Competing generated rubric"))
      .resolves.toEqual({ profile, receipt: stored, cohortId });
    expect(rpc).toHaveBeenCalledWith("repo_grade_freeze_rubric", {
      p_user_id: owner.id, p_course_id: scope.courseId, p_folder: scope.folder,
      p_configuration_fingerprint: profile.configurationFingerprint, p_cohort_id: cohortId,
      p_receipt: resolveRepoGradeRubric(profile, "Competing generated rubric"),
    });
  });

  it("loads current settings and the original frozen version through separate scoped reads", async () => {
    const old = capturedProfile({ rubric: "Old rubric" });
    const current = capturedProfile({ rubric: "New rubric" });
    const receipt = resolveRepoGradeRubric(old);
    rpc.mockResolvedValueOnce({ data: { profile: current, receipt: null }, error: null });
    rpc.mockResolvedValueOnce({ data: { profile: old, receipt }, error: null });
    await expect(readCurrentRepoGradeProfile(scope)).resolves.toEqual(current);
    await expect(readFrozenRepoGradeProfile(scope, cohortId)).resolves.toEqual({ profile: old, receipt, cohortId });
    expect(rpc).toHaveBeenNthCalledWith(1, "repo_grade_read_profile", {
      p_user_id: owner.id, p_course_id: scope.courseId, p_folder: scope.folder, p_cohort_id: null,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "repo_grade_read_profile", {
      p_user_id: owner.id, p_course_id: scope.courseId, p_folder: scope.folder, p_cohort_id: cohortId,
    });
  });

  it("restores the attempt's original cohort and exact rubric using only durable generation and scope", async () => {
    const profile = capturedProfile();
    const receipt = resolveRepoGradeRubric(profile, "Original  rubric");
    if (!receipt) throw new Error("Invalid rubric fixture");
    const persisted = {
      cohortId, profile, receipt, configurationFingerprint: profile.configurationFingerprint,
      rubricFingerprint: receipt.rubricFingerprint, profileFingerprint: receipt.profileFingerprint,
    };
    rpc.mockResolvedValueOnce({ data: persisted, error: null });
    await expect(readRepoGradeAttemptProfile(scope, 42)).resolves.toEqual({ cohortId, profile, receipt });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("repo_grade_read_attempt_profile", {
      p_user_id: owner.id, p_course_id: scope.courseId, p_folder: scope.folder, p_generation: 42,
    });
    const differentReceipt = resolveRepoGradeRubric(profile, "Replacement rubric");
    rpc.mockResolvedValueOnce({ data: { ...persisted, receipt: differentReceipt }, error: null });
    await expect(readRepoGradeAttemptProfile(scope, 42)).rejects.toThrow("Invalid stored repository grading attempt profile");
  });

  it("rejects a different course or folder, tampered settings and normalized-only rubric matches", async () => {
    const profile = capturedProfile();
    const receipt = resolveRepoGradeRubric(profile, "Correct  rubric");
    const wrongCourse = capturedProfile({}, { ...scope, courseId: "other-course" });
    const wrongFolder = capturedProfile({}, { ...scope, folder: "other-folder" });
    rpc.mockResolvedValueOnce({ data: { profile: wrongCourse, receipt: null }, error: null });
    rpc.mockResolvedValueOnce({ data: { profile: wrongFolder, receipt: null }, error: null });
    rpc.mockResolvedValueOnce({ data: { profile: { ...profile, runCode: true }, receipt: null }, error: null });
    rpc.mockResolvedValueOnce({ data: { profile, receipt: { ...receipt, rubric: "correct rubric" } }, error: null });
    for (const mismatch of [wrongCourse, wrongFolder, profile]) {
      await expect(readCurrentRepoGradeProfile(scope), mismatch.folder).rejects.toThrow("Invalid stored repository grading profile");
    }
    await expect(readFrozenRepoGradeProfile(scope, cohortId)).rejects.toThrow("Invalid stored repository grading rubric receipt");
  });

  it("requires the owner and rejects another account's captured profile before any database call", async () => {
    vi.mocked(requireAppOwner).mockRejectedValueOnce(new Error("Forbidden"));
    await expect(readCurrentRepoGradeProfile(scope)).rejects.toThrow("Forbidden");
    await expect(freezeRepoGradeRubric({ ...capturedProfile(), accountId: "other-owner" }, cohortId, "Rubric"))
      .rejects.toThrow("Invalid stored repository grading profile");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed on missing storage and ambiguous writes without retrying or leaking details", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "missing relation with private data" } });
    rpc.mockRejectedValueOnce(new Error("connection lost with private data"));
    await expect(readCurrentRepoGradeProfile(scope)).rejects.toThrow(/^Repository grading profile storage is unavailable$/);
    await expect(freezeRepoGradeRubric(capturedProfile(), cohortId, "Rubric"))
      .rejects.toThrow(/^Repository grading profile storage is unavailable$/);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

const migration = readFileSync(new URL(
  "../../../supabase/migrations/20261105175119_repo_grade_profiles.sql", import.meta.url,
), "utf8");
const tables = ["repo_grade_profile_versions", "repo_grade_current_profiles", "repo_grade_rubric_receipts"];

describe("repository grading profile migration structure", () => {
  it("keeps sensitive tables and RPCs private with explicit service grants and immutable history", () => {
    for (const table of tables) expect(migration).toContain(`alter table public.${table} enable row level security;`);
    expect(migration).toMatch(/revoke all on public\.repo_grade_profile_versions, public\.repo_grade_current_profiles,\s+public\.repo_grade_rubric_receipts from public, anon, authenticated, service_role;/);
    expect(migration).toMatch(/grant select, insert on public\.repo_grade_profile_versions, public\.repo_grade_current_profiles,\s+public\.repo_grade_rubric_receipts to service_role;/);
    expect(migration.match(/grant update[^;]*;/g)).toEqual([
      "grant update (configuration_fingerprint) on public.repo_grade_current_profiles to service_role;",
    ]);
    expect(migration).toMatch(/revoke all on function public\.repo_grade_save_profile[^;]+public\.repo_grade_freeze_rubric[^;]+public\.repo_grade_read_profile[^;]+from public, anon, authenticated;/);
    expect(migration).toMatch(/grant execute on function public\.repo_grade_save_profile[^;]+public\.repo_grade_freeze_rubric[^;]+public\.repo_grade_read_profile[^;]+to service_role;/);
    expect(migration).not.toMatch(/security definer|create policy/i);
  });

  it("enforces scoped foreign keys and serializes both mutations with admission", () => {
    expect(migration).toContain("foreign key (course_id, user_id) references public.course_hub (id, user_id) on delete cascade");
    expect(migration.match(/foreign key \(course_id, user_id, folder, configuration_fingerprint\)\s+references public\.repo_grade_profile_versions on delete cascade/g)).toHaveLength(2);
    for (const operation of ["save_profile", "freeze_rubric"]) {
      const body = migration.split(`create function public.repo_grade_${operation}(`)[1]?.split("$$;")[0];
      expect(body).toMatch(/pg_advisory_xact_lock\(pg_catalog\.hashtextextended\('repo-grade:' \|\| p_user_id::text, 0\)\);\s+perform 1 from public\.course_hub c\s+where c\.id = p_course_id and c\.user_id = p_user_id for share;/);
    }
  });

  it("looks up the original cohort first and never inserts a receipt for stale settings", () => {
    expect(migration).toContain("primary key (course_id, user_id, folder, cohort_id)");
    const freeze = migration.split("create function public.repo_grade_freeze_rubric(")[1]?.split("$$;")[0];
    expect(freeze).toMatch(/r\.cohort_id = p_cohort_id;[\s\S]*if existing\.configuration_fingerprint = p_configuration_fingerprint then return existing\.receipt; end if;[\s\S]*from public\.repo_grade_current_profiles c[\s\S]*c\.configuration_fingerprint = p_configuration_fingerprint\s+\) then return null; end if;\s+insert into public\.repo_grade_rubric_receipts/);
    const read = migration.split("create function public.repo_grade_read_profile(")[1]?.split("$$;")[0];
    expect(read).toMatch(/from public\.repo_grade_rubric_receipts r\s+join public\.repo_grade_profile_versions v using \(course_id, user_id, folder, configuration_fingerprint\)\s+where r\.cohort_id = p_cohort_id and r\.course_id = p_course_id and r\.user_id = p_user_id and r\.folder = p_folder/);
  });
});
