import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureAutomaticRepoGradeSnapshot, restoreAutomaticRepoGradeSnapshot } from "./automatic-snapshot";
import { planRepoGradeCourse } from "./runner";

const { course, profiles, discover } = vi.hoisted(() => ({ course: vi.fn(), profiles: vi.fn(), discover: vi.fn() }));
vi.mock("@/lib/supabase/courses.row", () => ({
  table: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: course }) }) }) }),
}));
vi.mock("./profile-store", () => ({ readCurrentRepoGradeProfilesForOwner: profiles }));
vi.mock("./discovery-mode", () => ({ repoGradeDiscoveryEnabled: () => true }));
vi.mock("./discovery", () => ({ discoverRepoGradeSources: discover }));

const old = "a".repeat(40);
const next = "b".repeat(40);
const data = { github_org: "School", name: "Intro", course_kind: "coding" };
const discovery = (sha: string) => ({
  status: "scanned", enumerationComplete: true, repos: [
    { status: "ready", repo: "School/Student", sourceRef: "main", sourceCommit: sha, folders: ["lab"] },
  ],
} as const);

async function capture() {
  const plan = await planRepoGradeCourse("owner", "course");
  if (!plan?.snapshotBasis) throw new Error("Expected discovered inventory");
  const stored = captureAutomaticRepoGradeSnapshot(plan.snapshotBasis, plan.discovery);
  if (!stored) throw new Error("Expected pinned inventory");
  return stored;
}

describe("automatic course snapshot revalidation", () => {
  it("preserves verified empty folders and rejects invalid empty projections", () => {
    const basis = "e".repeat(64);
    const candidate = { version: 1, basis, discovery: { status: "scanned", enumerationComplete: true, repos: [
      { status: "ready", repo: "School/Student", sourceRef: "main", sourceCommit: old, folders: ["lab"], emptyFolders: ["lab"] },
    ] } };
    expect(restoreAutomaticRepoGradeSnapshot(candidate)).toMatchObject({ discovery: { repos: [{ emptyFolders: ["lab"] }] } });
    expect(restoreAutomaticRepoGradeSnapshot({ ...candidate, discovery: { ...candidate.discovery, repos: [
      { ...candidate.discovery.repos[0], emptyFolders: ["other"] },
    ] } })).toBeNull();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("GITHUB_TOKEN", "first-token");
    course.mockResolvedValue({ data, error: null });
    profiles.mockResolvedValue(new Map());
    discover.mockResolvedValue(discovery(old));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("reuses discovery-time commits across ticks and discovers later commits in a new check", async () => {
    const stored = await capture();
    discover.mockResolvedValue(discovery(next));
    const decoded = restoreAutomaticRepoGradeSnapshot(JSON.parse(JSON.stringify(stored)));
    if (!decoded) throw new Error("Expected stored snapshot");
    await expect(planRepoGradeCourse("owner", "course", decoded)).resolves.toMatchObject({ discovery: discovery(old) });
    expect(discover).toHaveBeenCalledTimes(1);
    await expect(planRepoGradeCourse("owner", "course")).resolves.toMatchObject({ discovery: discovery(next) });
    expect(discover).toHaveBeenCalledTimes(2);
  });

  it("rechecks course, credential, and branch routing without rescanning stale targets", async () => {
    const stored = await capture();
    profiles.mockResolvedValue(new Map([["lab", null]]));
    await expect(planRepoGradeCourse("owner", "course", stored)).resolves.not.toBeNull();
    profiles.mockResolvedValueOnce(new Map([["lab", "submit"]]));
    await expect(planRepoGradeCourse("owner", "course", stored)).resolves.toBeNull();
    course.mockResolvedValueOnce({ data: { ...data, github_org: "OtherSchool" }, error: null });
    await expect(planRepoGradeCourse("owner", "course", stored)).resolves.toBeNull();
    vi.stubEnv("GITHUB_TOKEN", "rotated-token");
    await expect(planRepoGradeCourse("owner", "course", stored)).resolves.toBeNull();
    expect(discover).toHaveBeenCalledTimes(1);
  });
});
