import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const user = "00000000-0000-4000-8000-000000000051";
const otherUser = "00000000-0000-4000-8000-000000000052";
const course = "00000000-0000-4000-8000-000000000151";
const secondCourse = "00000000-0000-4000-8000-000000000152";
const oldCohort = "00000000-0000-4000-8000-000000000351";
const fingerprint = "f".repeat(64);
const sha = "a".repeat(40);
const nextSha = "b".repeat(40);
const instructions = "Use the submitted project.\nExplain your decisions.";
const rubric = "A\u00a0criterion with a \"quote\".\n100\u202fpoints.";
const parser = `fixture-parser-v1:${"e".repeat(64)}`;
const model = "fixture-model";
const grader = "fixture-grader-v1";
const hash = (text) => createHash("sha256").update(text).digest("hex");
const json = (value) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const get = async (session, query) => JSON.parse(await session.query(query));
const key = (folder, courseId = course) => hash(JSON.stringify([
  "repo-grade-preparation-v1", user, courseId, folder, fingerprint, "saved",
  hash(instructions), "gemini", model, grader, parser, "coding",
]));
const receipt = (folder, courseId = course) => ({
  accountId: user,
  courseId,
  folder,
  configurationFingerprint: fingerprint,
  rubric,
  rubricFingerprint: hash(rubric.replace(/\s+/g, " ").trim().toLowerCase()),
  profileFingerprint: hash(JSON.stringify(["repo-grade-profile-v1", fingerprint, rubric])),
});
const config = (courseId) => `(select jsonb_build_object(
    'github_org', github_org, 'repos', repos, 'rubric_name', rubric_name, 'rubric_data', rubric_data,
    'repo_module_pairing', repo_module_pairing, 'student_repos', student_repos)
  from public.course_hub where id = '${courseId}')`;

function claimPreparation(folder, { courseId = course, commit = sha, prepKey = key(folder, courseId), retryGeneration } = {}) {
  const targets = [{ target: { owner: "Example", repo: "Student", sourceRef: "main", sourceCommit: commit }, source: { kind: "saved" } }];
  return `select public.repo_grade_claim_preparation('${user}', '${courseId}', '${folder}',
    ${config(courseId)}, '${fingerprint}', '${prepKey}', ${json(instructions)} #>> '{}', ${json(targets)}
    ${retryGeneration === undefined ? "" : `, '${retryGeneration}'`});`;
}

function beginPreparation(attempt, { account = user, token = attempt.token } = {}) {
  return `public.repo_grade_begin_preparation('${account}', '${attempt.cohortId}', '${token}')`;
}

function finishPreparation(attempt, folder, outcome, value = null, prepKey = key(folder)) {
  return `select public.repo_grade_finish_preparation('${user}', '${attempt.cohortId}',
    '${attempt.token}', '${prepKey}', '${outcome}', ${value === null ? "null" : json(value)});`;
}

function claimGrade(rpc, cohort, {
  folder = "project", prepKey = key(folder), repo = "Example/Student", ref = "main", commit = sha,
} = {}) {
  const keyArgument = rpc === "repo_grade_claim_with_preparation" ? `, '${prepKey}'` : "";
  return `select public.${rpc}('${user}', '${course}', '${repo}', '${folder}', 'automatic', '${ref}', '${commit}',
    ${config(course)}, '${cohort}', ${json(receipt(folder))}${keyArgument});`;
}

const manualGrade = (repo) => `select public.repo_grade_claim('${user}', null, 'Example/${repo}', null, 'manual',
  null, null, null, null, null);`;

async function checkPrivileges(owner) {
  const signatures = [
    "repo_grade_bootstrap_preparation(uuid,uuid,text,jsonb,jsonb,text,text,text,jsonb)",
    "repo_grade_preparation_policy_snapshot(uuid,uuid,text)",
    "repo_grade_update_preparation_policy(uuid,uuid,text,uuid,text,text,text)",
    "repo_grade_claim_preparation(uuid,uuid,text,jsonb,text,text,text,jsonb)",
    "repo_grade_claim_preparation(uuid,uuid,text,jsonb,text,text,text,jsonb,text)",
    "repo_grade_begin_preparation(uuid,uuid,uuid)",
    "repo_grade_finish_preparation(uuid,uuid,uuid,text,text,jsonb)",
    "repo_grade_claim_with_preparation(uuid,uuid,text,text,text,text,text,jsonb,uuid,jsonb,text)",
  ];
  for (const role of ["anon", "authenticated", "queue_v2_ungranted", "service_role"]) {
    for (const signature of signatures) {
      assert.equal(await owner.query(`select has_function_privilege('${role}', 'public.${signature}', 'EXECUTE');`),
        role === "service_role" ? "t" : "f");
    }
    assert.equal(await owner.query(`select has_table_privilege('${role}', 'public.repo_grade_preparation_policies', 'INSERT');`),
      role === "service_role" ? "t" : "f");
    assert.equal(await owner.query(`select has_table_privilege('${role}', 'public.repo_grade_preparation_targets', 'UPDATE');`), "f");
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      assert.equal(await owner.query(`select has_table_privilege('${role}', 'public.repo_grade_preparation_history', '${privilege}');`),
        role === "service_role" && ["SELECT", "INSERT"].includes(privilege) ? "t" : "f");
    }
  }
}

export async function runRubricPreparationCases({ owner, worker, contender, witness, waitForBlock }) {
  await checkPrivileges(owner);
  await owner.query(`begin;
    insert into auth.users values ('${user}'), ('${otherUser}');
    insert into public.course_hub (id, user_id, github_org, name) values ('${course}', '${user}', 'Example', 'Intro to Programming'),
      ('${secondCourse}', '${user}', 'Example', 'Other Course');
    insert into public.repo_grade_profile_versions (course_id, user_id, folder, configuration_fingerprint, profile)
    select c.id, c.user_id, f.folder, '${fingerprint}',
      jsonb_build_object('courseId', c.id, 'accountId', c.user_id, 'folder', f.folder,
        'configurationFingerprint', '${fingerprint}', 'provider', 'gemini', 'model', '${model}',
        'graderVersion', '${grader}', 'rubricPolicy', 'generate', 'runCode', false, 'targetBranch', null,
        'useReadmeInstructions', false, 'instructions', ${json(instructions)} #>> '{}')
    from public.course_hub c cross join (values ('project'), ('cap'), ('unknown'), ('failed'), ('failed-before'), ('policy')) f(folder)
    where c.id in ('${course}', '${secondCourse}');
    insert into public.repo_grade_current_profiles (course_id, user_id, folder, configuration_fingerprint)
      select course_id, user_id, folder, configuration_fingerprint from public.repo_grade_profile_versions
      where user_id = '${user}';
    insert into public.repo_grade_rubric_receipts
      (course_id, user_id, folder, configuration_fingerprint, cohort_id, receipt)
      values ('${course}', '${user}', 'project', '${fingerprint}', '${oldCohort}', ${json(receipt("project"))});
    commit;`);
  await worker.query("set role service_role;");
  await contender.query("set role service_role;");
  const workerPid = Number(await worker.query("select pg_backend_pid();"));
  const contenderPid = Number(await contender.query("select pg_backend_pid();"));

  try {
    assert.deepEqual(await get(worker, claimPreparation("project")), { status: "disabled" });
    await owner.query(`begin;
      select pg_advisory_xact_lock(hashtextextended('repo-grade:${user}', 0));
      insert into public.repo_grade_preparation_policies (course_id, user_id, folder, prompt_parser_version, course_kind)
      select course_id, user_id, folder, '${parser}', 'coding' from public.repo_grade_current_profiles where user_id = '${user}';
      commit;`);
    const basis = ["Intro to Programming", null];
    const startupVersion = `repo-grade-gemini-rubric-v1:${"e".repeat(64)}:${hash(JSON.stringify(basis))}`;
    const defaultProfile = {
      accountId: user, courseId: course, folder: "bootstrap", configurationFingerprint: fingerprint,
      provider: "gemini", model, graderVersion: grader, rubric: "", rubricPolicy: "generate",
      sourceRef: null, targetBranch: null, instructions: "", runCode: false, useReadmeInstructions: true, applyNamingDeduction: true,
    };
    const bootstrap = (rawBasis, expected = "null", ownerId = user, version = startupVersion) => `select public.repo_grade_bootstrap_preparation(
      '${ownerId}', '${course}', 'bootstrap', ${config(course)}, ${json(rawBasis)}, 'coding',
      '${version}', ${expected}, ${json(defaultProfile)});`;
    assert.equal(await worker.query(bootstrap(["Wrong Course", null])), "f");
    assert.equal(await worker.query(bootstrap(basis, "null", otherUser)), "f");
    assert.equal(await worker.query(bootstrap(basis)), "t");
    assert.equal(await worker.query(bootstrap(basis)), "f");
    assert.equal(await worker.query(bootstrap(basis, `'${fingerprint}'`)), "t");
    const renamed = ["Advanced Programming", null];
    const renamedVersion = `repo-grade-gemini-rubric-v1:${"e".repeat(64)}:${hash(JSON.stringify(renamed))}`;
    await owner.query(`update public.course_hub set name = 'Advanced Programming' where id = '${course}';`);
    assert.equal(await worker.query(bootstrap(renamed, `'${fingerprint}'`, user, renamedVersion)), "f");
    await owner.query(`update public.course_hub set name = 'Intro to Programming' where id = '${course}';`);
    assert.equal(await worker.query(bootstrap(basis, `'${fingerprint}'`)), "t");
    const readDefault = `select public.repo_grade_read_profile('${user}', '${course}', 'bootstrap', null)`;
    assert.equal((await get(worker, readDefault)).startupDefault, true);
    await owner.query(`update public.course_hub set rubric_name = 'A course rubric' where id = '${course}';`);
    assert.equal(await worker.query(bootstrap(basis, `'${fingerprint}'`)), "f");
    assert.equal(await worker.query(`select public.repo_grade_save_profile('${user}', '${course}', 'bootstrap',
      '${fingerprint}', '${fingerprint}', ${json(defaultProfile)});`), "t");
    assert.equal((await get(worker, readDefault)).startupDefault, false);
    assert.equal(await worker.query(bootstrap(basis, `'${fingerprint}'`)), "t");
    await owner.query(`update public.course_hub set rubric_name = null where id = '${course}';`);

    const policySnapshot = `select public.repo_grade_preparation_policy_snapshot('${user}', '${course}', 'policy');`;
    const originalPolicy = await get(worker, policySnapshot);
    const updatePolicy = (account = user, version = startupVersion) => `select public.repo_grade_update_preparation_policy(
      '${account}', '${course}', 'policy', '${originalPolicy.revision}', '${fingerprint}', 'coding', '${version}');`;
    assert.equal(await worker.query(updatePolicy(otherUser)), "conflict");
    assert.equal(await worker.query(updatePolicy(user, renamedVersion)), "conflict");
    await worker.query("begin isolation level read committed;");
    const policyPrep = await get(worker, claimPreparation("policy"));
    assert.equal(policyPrep.status, "claimed");
    const racingUpdate = contender.query(updatePolicy());
    void racingUpdate.catch(() => {});
    await waitForBlock(contenderPid, workerPid);
    await worker.query("commit;");
    assert.equal(await racingUpdate, "busy");
    assert(Number(await worker.query(`select ${beginPreparation(policyPrep)};`)) > 0);
    assert.equal(await worker.query(updatePolicy()), "busy");
    assert.deepEqual(await get(worker, policySnapshot), originalPolicy);
    assert.equal((await get(worker, finishPreparation(policyPrep, "policy", "succeeded", receipt("policy")))).status, "succeeded");
    assert.equal(await worker.query(updatePolicy()), "updated");
    assert.equal(await worker.query(updatePolicy()), "conflict");
    const replacedPolicy = await get(worker, policySnapshot);
    assert.equal(replacedPolicy.version, startupVersion);
    assert.notEqual(replacedPolicy.revision, originalPolicy.revision);
    assert.deepEqual((await get(worker, `select public.repo_grade_read_profile('${user}', '${course}', 'policy', '${policyPrep.cohortId}');`)).receipt,
      receipt("policy"));
    assert.deepEqual(await get(worker, claimPreparation("policy")), { status: "configuration-changed" });

    for (const rpc of ["repo_grade_claim", "repo_grade_claim_tracked"]) {
      assert.deepEqual(await get(worker, claimGrade(rpc, oldCohort)), { status: "configuration-changed" });
    }
    assert.deepEqual(await get(worker, claimPreparation("project", { prepKey: fingerprint })), { status: "configuration-changed" });

    await worker.query("begin isolation level read committed;");
    const pending = await get(worker, claimPreparation("project"));
    assert.equal(pending.status, "claimed");
    const duplicate = get(contender, claimPreparation("project"));
    void duplicate.catch(() => {});
    await waitForBlock(contenderPid, workerPid);
    await worker.query("commit;");
    assert.deepEqual(await duplicate, { status: "busy" });
    assert.equal(await worker.query(`select ${beginPreparation(pending, { account: otherUser })} is null;`), "t");
    assert.equal(await worker.query(`select ${beginPreparation(pending, { token: oldCohort })} is null;`), "t");
    assert.deepEqual(await get(worker, finishPreparation(pending, "project", "succeeded", receipt("project"))), { status: "stale" });

    await owner.query(`update public.repo_grade_preparations set claimed_at = clock_timestamp() - interval '16 minutes'
      where id = '${pending.cohortId}';`);
    assert.equal(await worker.query(`select ${beginPreparation(pending)} is null;`), "t");
    const expiredGeneration = hash(pending.token);
    assert.deepEqual(await get(worker, claimPreparation("project")),
      { status: "explicit-retry-required", retryGeneration: expiredGeneration });
    const prep = await get(worker, claimPreparation("project", { retryGeneration: expiredGeneration }));
    assert.equal(prep.status, "claimed");
    assert.equal(prep.cohortId, pending.cohortId);
    assert.notEqual(prep.token, pending.token);
    assert.equal(await worker.query(`select ${beginPreparation(pending)} is null;`), "t");
    assert.deepEqual(await get(worker, finishPreparation(pending, "project", "failed-before-dispatch")), { status: "stale" });
    assert.equal(await witness.query(`select state from public.repo_grade_preparation_history
      where preparation_id = '${pending.cohortId}' and generation = '${expiredGeneration}';`), "expired");

    await worker.query("begin isolation level read committed;");
    assert(Number(await worker.query(`select ${beginPreparation(prep)};`)) > 0);
    const losingFailure = get(contender, finishPreparation(prep, "project", "failed-before-dispatch"));
    void losingFailure.catch(() => {});
    await waitForBlock(contenderPid, workerPid);
    await worker.query("commit;");
    assert.deepEqual(await losingFailure, { status: "stale" });
    assert.equal(await worker.query(`select ${beginPreparation(prep)} is null;`), "t");
    assert.deepEqual(await get(worker, finishPreparation(prep, "project", "succeeded",
      { ...receipt("project"), profileFingerprint: fingerprint })), { status: "invalid-receipt" });
    assert.deepEqual(await get(worker, finishPreparation(prep, "project", "succeeded",
      { ...receipt("project"), rubricFingerprint: fingerprint })), { status: "invalid-receipt" });
    const untrimmedRubric = "\u00a0" + rubric;
    assert.deepEqual(await get(worker, finishPreparation(prep, "project", "succeeded", {
      ...receipt("project"),
      rubric: untrimmedRubric,
      profileFingerprint: hash(JSON.stringify(["repo-grade-profile-v1", fingerprint, untrimmedRubric])),
    })), { status: "invalid-receipt" });
    assert.deepEqual(await get(worker, finishPreparation(prep, "project", "succeeded", receipt("project"), fingerprint)),
      { status: "stale" });

    const manualOne = await get(worker, manualGrade("CapacityOne"));
    const manualTwo = await get(worker, manualGrade("CapacityTwo"));
    assert.equal(manualOne.status, "claimed");
    assert.equal(manualTwo.status, "claimed");
    assert.deepEqual(await get(worker, manualGrade("CapacityThree")), { status: "capacity" });
    assert.deepEqual(await get(worker, claimPreparation("cap")), { status: "capacity" });
    for (const attempt of [manualOne, manualTwo]) {
      assert.equal(await worker.query(`select public.repo_grade_settle('${user}', ${attempt.generation},
        '${attempt.token}', 'failed', false, null, null, null, null, null);`), "t");
    }

    const finished = { status: "succeeded", receipt: receipt("project") };
    assert.deepEqual(await get(worker, finishPreparation(prep, "project", "succeeded", receipt("project"))), finished);
    assert.deepEqual(await get(worker, finishPreparation(prep, "project", "succeeded", receipt("project"))), finished);
    for (const rpc of ["repo_grade_claim", "repo_grade_claim_tracked"]) {
      assert.deepEqual(await get(worker, claimGrade(rpc, prep.cohortId)), { status: "configuration-changed" });
    }
    assert.equal(await worker.query(`select public.repo_grade_freeze_rubric('${user}', '${course}', 'project',
      '${fingerprint}', '${oldCohort}', ${json(receipt("project"))}) is null;`), "t");

    const preparedGrade = "repo_grade_claim_with_preparation";
    for (const mismatch of [{ repo: "Example/Other" }, { ref: "dev" }, { commit: nextSha }, { prepKey: fingerprint }]) {
      assert.deepEqual(await get(worker, claimGrade(preparedGrade, prep.cohortId, mismatch)), { status: "configuration-changed" });
    }
    assert.deepEqual(await get(worker, claimPreparation("project", { commit: nextSha })),
      { status: "ready", cohortId: prep.cohortId, receipt: receipt("project") });
    const grade = await get(worker, claimGrade(preparedGrade, prep.cohortId, { commit: nextSha }));
    assert.equal(grade.status, "claimed");
    assert.deepEqual(grade.preparation, { instructions, source: { kind: "saved" } });
    assert(Number(await worker.query(`select public.repo_grade_begin_dispatch('${user}', ${grade.generation}, '${grade.token}');`)) > 0);
    assert.equal(await worker.query(`select public.repo_grade_settle('${user}', ${grade.generation},
      '${grade.token}', 'failed', false, null, null, null, null, null);`), "t");

    const failed = await get(worker, claimPreparation("failed"));
    assert(Number(await worker.query(`select ${beginPreparation(failed)};`)) > 0);
    assert.deepEqual(await get(worker, finishPreparation(failed, "failed", "failed")), { status: "failed" });
    const retryGeneration = hash(failed.token);
    assert.deepEqual(await get(worker, claimPreparation("failed")), { status: "explicit-retry-required", retryGeneration });
    assert.deepEqual(await get(worker, claimPreparation("failed", { courseId: secondCourse, retryGeneration })),
      { status: "retry-unavailable" });
    await owner.query(`update public.course_hub set rubric_name = 'Changed' where id = '${course}';`);
    assert.deepEqual(await get(worker, claimPreparation("failed", { retryGeneration })), { status: "configuration-changed" });
    await owner.query(`update public.course_hub set rubric_name = null where id = '${course}';`);
    await worker.query("begin isolation level read committed;");
    const retry = await get(worker, claimPreparation("failed", { retryGeneration }));
    assert.equal(retry.status, "claimed");
    assert.equal(retry.cohortId, failed.cohortId);
    assert.notEqual(retry.token, failed.token);
    const duplicateRetry = get(contender, claimPreparation("failed", { retryGeneration }));
    void duplicateRetry.catch(() => {});
    await waitForBlock(contenderPid, workerPid);
    await worker.query("commit;");
    assert.deepEqual(await duplicateRetry, { status: "busy" });
    assert.equal(await worker.query(`select ${beginPreparation(failed)} is null;`), "t");
    assert(Number(await worker.query(`select ${beginPreparation(retry)};`)) > 0);
    assert.deepEqual(await get(worker, finishPreparation(retry, "failed", "failed")), { status: "failed" });
    assert.deepEqual(await get(worker, claimPreparation("failed", { retryGeneration })), { status: "retry-unavailable" });
    assert.deepEqual(await get(worker, claimPreparation("failed")),
      { status: "explicit-retry-required", retryGeneration: hash(retry.token) });
    assert.equal(await witness.query(`select state from public.repo_grade_preparation_history
      where preparation_id = '${failed.cohortId}' and generation = '${retryGeneration}';`), "failed");

    const failedBefore = await get(worker, claimPreparation("failed-before"));
    assert.equal(failedBefore.status, "claimed");
    assert.deepEqual(await get(worker, finishPreparation(failedBefore, "failed-before", "failed")), { status: "stale" });
    assert.deepEqual(await get(worker, finishPreparation(failedBefore, "failed-before", "failed-before-dispatch",
      receipt("failed-before"))), { status: "invalid-receipt" });
    assert.deepEqual(await get(worker, finishPreparation({ ...failedBefore, token: oldCohort },
      "failed-before", "failed-before-dispatch")), { status: "stale" });
    await worker.query("begin isolation level read committed;");
    assert.deepEqual(await get(worker, finishPreparation(failedBefore, "failed-before", "failed-before-dispatch")),
      { status: "failed" });
    const blockedBegin = contender.query(`select ${beginPreparation(failedBefore)} is null;`);
    void blockedBegin.catch(() => {});
    await waitForBlock(contenderPid, workerPid);
    await worker.query("commit;");
    assert.equal(await blockedBegin, "t");
    assert.deepEqual(await get(worker, claimPreparation("failed-before")),
      { status: "explicit-retry-required", retryGeneration: hash(failedBefore.token) });
    assert.equal(await witness.query(`select not exists (
      select from public.repo_grade_preparation_reservations where id = '${failedBefore.cohortId}'
    );`), "t");

    const stale = await get(worker, claimPreparation("cap"));
    await owner.query(`update public.course_hub set github_org = 'Changed' where id = '${course}';`);
    assert.equal(await worker.query(`select ${beginPreparation(stale)} is null;`), "t");
    await owner.query(`update public.course_hub set github_org = 'Example' where id = '${course}';`);
    assert(Number(await worker.query(`select ${beginPreparation(stale)};`)) > 0);
    await owner.query(`update public.course_hub set github_org = 'Changed' where id = '${course}';`);
    assert.deepEqual(await get(worker, finishPreparation(stale, "cap", "succeeded", receipt("cap"))),
      { status: "configuration-changed" });
    assert.equal(await witness.query(`select not exists (select from public.repo_grade_rubric_receipts
      where course_id = '${course}' and cohort_id = '${stale.cohortId}');`), "t");
    await owner.query(`update public.course_hub set github_org = 'Example' where id = '${course}';`);

    const unknown = await get(worker, claimPreparation("unknown"));
    assert(Number(await worker.query(`select ${beginPreparation(unknown)};`)) > 0);
    assert.deepEqual(await get(worker, claimPreparation("unknown", { retryGeneration: hash(unknown.token) })), { status: "busy" });
    await owner.query(`update public.repo_grade_preparations set claimed_at = clock_timestamp() - interval '16 minutes'
      where id = '${unknown.cohortId}';`);
    assert.deepEqual(await get(worker, finishPreparation(unknown, "unknown", "succeeded", receipt("unknown"))), { status: "unknown" });
    assert.deepEqual(await get(worker, claimPreparation("unknown")), { status: "unknown" });
    assert.deepEqual(await get(worker, claimPreparation("unknown", { retryGeneration: hash(unknown.token) })), { status: "unknown" });
    assert.equal(await witness.query(`select p.state from public.repo_grade_preparations p
      join public.repo_grade_preparation_reservations r using (id, user_id) where p.id = '${unknown.cohortId}';`), "unknown");

    await owner.query(`delete from public.course_hub where id = '${course}';`);
    assert.equal(await witness.query(`select exists (
      select from public.repo_grade_preparation_reservations where id = '${unknown.cohortId}'
    ) and not exists (select from public.repo_grade_preparations where id = '${unknown.cohortId}');`), "t");
    assert.deepEqual(await get(worker, manualGrade("AfterOrphan")), { status: "busy" });
    assert.deepEqual(await get(worker, claimPreparation("cap", { courseId: secondCourse })), { status: "busy" });
  } finally {
    await worker.query("rollback; reset role;");
    await contender.query("rollback; reset role;");
  }
}
