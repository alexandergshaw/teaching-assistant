import assert from "node:assert/strict";

const account = "'00000000-0000-4000-8000-000000000031'";
const otherAccount = "'00000000-0000-4000-8000-000000000032'";
const course = "'00000000-0000-4000-8000-000000000131'";
const otherCourse = "'00000000-0000-4000-8000-000000000132'";
const secondAccountCourse = "'00000000-0000-4000-8000-000000000133'";
const cohort = "'00000000-0000-4000-8000-000000000331'";
const fingerprint = "a".repeat(64);
const sha = "a".repeat(40);
const newSha = "b".repeat(40);

function claimSql({
  user = account, courseId = course, repo = "Example/Student", folder = "project",
  ref = "new-ref", commit = sha, mode = "automatic",
} = {}) {
  return `select public.repo_grade_claim(
    ${user}, c.id, '${repo}', r.folder, '${mode}', '${ref}', '${commit}',
    jsonb_build_object('github_org', c.github_org, 'repos', c.repos,
      'rubric_name', c.rubric_name, 'rubric_data', c.rubric_data,
      'repo_module_pairing', c.repo_module_pairing, 'student_repos', c.student_repos),
    r.cohort_id, r.receipt)
    from public.course_hub c
    join public.repo_grade_rubric_receipts r on r.course_id = c.id and r.user_id = c.user_id
    where c.id = ${courseId} and r.folder = '${folder}';`;
}

async function claim(session, options) {
  return JSON.parse(await session.query(claimSql(options)));
}

async function settle(session, user, attempt, outcome) {
  assert.equal(attempt.status, "claimed");
  assert(Number.isSafeInteger(attempt.generation) && attempt.generation > 0);
  assert.match(attempt.token, /^[0-9a-f-]{36}$/);
  assert.equal(await session.query(`select public.repo_grade_settle(
    ${user}, ${attempt.generation}, '${attempt.token}', '${outcome}',
    ${outcome === "no-submission"}, null, null, null, null, null);`), "t");
}

async function installFixtures(owner) {
  await owner.query(`begin;
    -- The disposable fixture lacks the standard Supabase service-role grants
    -- on course_hub. SELECT FOR SHARE also requires an UPDATE privilege.
    grant select, update (id) on public.course_hub to service_role;
    insert into auth.users values (${account}), (${otherAccount});
    insert into public.course_hub (id, user_id, github_org)
      values (${course}, ${account}, 'Example'), (${otherCourse}, ${account}, 'Example'),
        (${secondAccountCourse}, ${otherAccount}, 'Example');
    insert into public.repo_grade_profile_versions
      (course_id, user_id, folder, configuration_fingerprint, profile)
      select c.id, c.user_id, f.folder, '${fingerprint}',
        jsonb_build_object('courseId', c.id, 'accountId', c.user_id,
          'folder', f.folder, 'configurationFingerprint', '${fingerprint}')
        || case when f.folder = 'pinned' then '{"sourceRef":"old-ref"}'::jsonb else '{}'::jsonb end
      from public.course_hub c cross join (values ('project'), ('Project'), ('pinned')) f(folder)
      where c.id in (${course}, ${otherCourse}, ${secondAccountCourse});
    insert into public.repo_grade_current_profiles (course_id, user_id, folder, configuration_fingerprint)
      select course_id, user_id, folder, configuration_fingerprint from public.repo_grade_profile_versions;
    insert into public.repo_grade_rubric_receipts
      (course_id, user_id, folder, configuration_fingerprint, cohort_id, receipt)
      select course_id, user_id, folder, configuration_fingerprint, ${cohort}, profile ||
        jsonb_build_object('rubric', 'fixture', 'rubricFingerprint', '${fingerprint}', 'profileFingerprint', '${fingerprint}')
      from public.repo_grade_profile_versions;
    -- Seed terminal history from before cohort binding and a manual row with
    -- a SHA to prove manual history cannot satisfy an automatic claim.
    insert into public.repo_grade_attempts
      (user_id, course_id, repo, folder, source_ref, source_sha, profile_fingerprint, mode, status, settled_at)
      values (${account}, ${course}, 'Example/Legacy', 'project', 'old-ref', '${sha}',
          '${fingerprint}', 'automatic', 'succeeded', clock_timestamp()),
        (${account}, ${course}, 'Example/Manual', 'project', 'old-ref', '${sha}',
          null, 'manual', 'succeeded', clock_timestamp());
    commit;`);
}

export async function runCrossRefClaimCases({ owner, worker, contender, witness, waitForBlock }) {
  const signature = "public.repo_grade_claim(uuid,uuid,text,text,text,text,text,jsonb,uuid,jsonb)";
  for (const role of ["anon", "authenticated", "queue_v2_ungranted", "service_role"]) {
    assert.equal(await owner.query(`select has_function_privilege('${role}', '${signature}', 'EXECUTE');`),
      role === "service_role" ? "t" : "f");
  }
  await installFixtures(owner);
  const workerPid = Number(await worker.query("select pg_backend_pid();"));
  const contenderPid = Number(await contender.query("select pg_backend_pid();"));
  const contenderSql = claimSql({ repo: "example/student" });
  await worker.query("begin isolation level read committed; set local role service_role;");
  const winner = await claim(worker, { ref: "old-ref" });
  const waiting = contender.query(`begin isolation level read committed; set local role service_role;
    ${contenderSql} commit;`);
  void waiting.catch(() => {});
  await waitForBlock(contenderPid, workerPid);
  await settle(worker, account, winner, "no-submission");
  await worker.query("commit;");
  assert.deepEqual(JSON.parse(await waiting), { status: "terminal" });
  assert.equal(await witness.query(`select source_ref || ':' || status from public.repo_grade_attempts
    where course_id = ${course} and lower(repo) = 'example/student' and source_sha = '${sha}';`), "old-ref:no-submission");

  await worker.query("set role service_role;");
  try {
    assert.deepEqual(await claim(worker, { repo: "example/legacy" }), { status: "terminal" });
    assert.deepEqual(await claim(worker, { user: otherAccount }), { status: "forbidden" });
    assert.deepEqual(await claim(worker, { folder: "pinned" }), { status: "configuration-changed" });
    for (const options of [
      { courseId: otherCourse }, { user: otherAccount, courseId: secondAccountCourse },
      { repo: "Example/Other" }, { folder: "Project" }, { commit: newSha }, { repo: "Example/Manual" },
    ]) {
      await settle(worker, options.user ?? account, await claim(worker, options), "failed");
    }
    const manual = JSON.parse(await worker.query(`select public.repo_grade_claim(
      ${account}, null, 'Example/Student', null, 'manual', null, null, null, null, null);`));
    await settle(worker, account, manual, "failed");

    const failed = { repo: "Example/Failed" };
    await settle(worker, account, await claim(worker, { ...failed, ref: "old-ref" }), "failed");
    assert.deepEqual(await claim(worker, failed), { status: "explicit-retry-required" });
    await settle(worker, account, await claim(worker, { ...failed, mode: "retry" }), "no-submission");
    assert.deepEqual(await claim(worker, failed), { status: "terminal" });

    const uncertain = { repo: "Example/Unknown" };
    const original = await claim(worker, { ...uncertain, ref: "old-ref" });
    assert.deepEqual(await claim(worker, uncertain), { status: "busy" });
    await settle(worker, account, original, "unknown");
    assert.deepEqual(await claim(worker, { ...uncertain, mode: "retry" }), { status: "busy" });
    assert.equal(await worker.query(`select public.repo_grade_reconcile(${account}, ${original.generation});`), "t");
    assert.deepEqual(await claim(worker, uncertain), { status: "explicit-retry-required" });
    await settle(worker, account, await claim(worker, { ...uncertain, mode: "retry" }), "no-submission");
  } finally {
    await worker.query("reset role;");
  }
}
