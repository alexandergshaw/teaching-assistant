import assert from "node:assert/strict";

const account = "00000000-0000-4000-8000-000000000061";
const course = "00000000-0000-4000-8000-000000000161";
const first = "00000000-0000-4000-8000-000000000261";
const second = "00000000-0000-4000-8000-000000000262";
const contender = "00000000-0000-4000-8000-000000000263";
const third = "00000000-0000-4000-8000-000000000264";
const older = "00000000-0000-4000-8000-000000000265";
const repo = "Example/Student";
const sha = "b".repeat(40);

function stage(batch, folders, selector = { repo, ref: "main" }) {
  const targets = folders.map((folder) => ({ ...selector, folder, sha }));
  return `select public.repo_grade_stage_startup('${account}', '${batch}', '${course}', '${JSON.stringify(targets)}');`;
}

function targetArgs(batch, folder, { repo: name, ref } = { repo, ref: "main" }) {
  return `'${account}', '${batch}', '${course}', '${name}', '${folder}', '${ref}', '${sha}'`;
}

const start = (...args) => `select public.repo_grade_start_startup_target(${targetArgs(...args)});`;
const finish = (batch, folder, status, selector) =>
  `select public.repo_grade_finish_startup_target(${targetArgs(batch, folder, selector)}, '${status}');`;
const seal = (batch, count) => `select public.repo_grade_seal_startup('${account}', '${batch}', ${count});`;
const close = (batch) => `select public.repo_grade_close_startup('${account}', '${batch}');`;

export async function runStartupRetryCases({ owner, worker }) {
  const staged = async (...args) => {
    const rows = JSON.parse(await worker.query(stage(...args)));
    return Object.fromEntries(rows.map(({ folder, state }) => [folder, state]));
  };
  const folders = ["safe", "tail", "missing-finish", "unknown", "failed", "processed", "linked", "old-unknown", "expires"];
  const statuses = [
    ["safe", "not-started"], ["unknown", "unknown"], ["failed", "failed"], ["processed", "already-processed"],
    ["old-unknown", "not-started"],
  ];
  await owner.query(`
    insert into auth.users values ('${account}');
    insert into public.course_hub (id, user_id, github_org, name) values ('${course}', '${account}', 'Example', 'Startup retry');
  `);
  const signatures = ["repo_grade_stage_startup(uuid,uuid,uuid,jsonb)", "repo_grade_seal_startup(uuid,uuid,integer)"];
  for (const signature of signatures) {
    for (const role of ["anon", "authenticated", "queue_v2_ungranted", "service_role"]) {
      assert.equal(await owner.query(`select has_function_privilege('${role}', 'public.${signature}', 'EXECUTE');`),
        role === "service_role" ? "t" : "f");
    }
  }

  await worker.query("set role service_role;");
  try {
    assert.deepEqual(await staged(first, folders), {});
    assert.equal(await worker.query(seal(first, folders.length)), "t");
    for (const folder of folders.filter((value) => value !== "tail" && value !== "expires")) {
      assert.equal(await worker.query(start(first, folder)), "t");
    }
    for (const [folder, status] of statuses) assert.equal(await worker.query(finish(first, folder, status)), "t");
    // Exercise linked attempts even when startup history also carries a not-started status.
    // Seed an older unresolved start to check that a newer safe row cannot hide it.
    await owner.query(`
      with attempt as (
        insert into public.repo_grade_attempts (user_id, course_id, repo, folder, source_ref, source_sha,
          profile_fingerprint, mode, status)
        values ('${account}', '${course}', '${repo}', 'linked', 'main', '${sha}', repeat('a', 64), 'automatic', 'failed')
        returning generation
      )
      update public.repo_grade_startup_targets set attempt_generation = attempt.generation, unlinked_status = 'not-started'
        from attempt where user_id = '${account}' and batch_id = '${first}' and folder = 'linked';
      insert into public.repo_grade_startup_batches (user_id, id, sealed_at, expires_at, closed_at)
        values ('${account}', '${older}', clock_timestamp() - interval '1 day', clock_timestamp() + interval '1 minute', clock_timestamp());
      insert into public.repo_grade_startup_targets (user_id, batch_id, course_id, repo, folder, source_ref, source_sha, started_at)
        values ('${account}', '${older}', '${course}', '${repo}', 'old-unknown', 'main', '${sha}', clock_timestamp());
    `);

    assert.deepEqual(await staged(second, ["safe", "tail"]), { safe: "not-started", tail: "claimed" });
    assert.equal(await worker.query(seal(second, 1)), "f");
    assert.equal(await worker.query(close(first)), "t");
    assert.equal(await worker.query(start(first, "tail")), "f");
    const oldClaim = await worker.query(`select public.repo_grade_claim_startup_target(
      ${targetArgs(first, "safe")}, null, null, null, null);`);
    assert.deepEqual(JSON.parse(oldClaim), { status: "forbidden" });
    const otherRef = { repo: "example/student", ref: "other" };
    assert.deepEqual(await staged(second, folders, otherRef), {
      "missing-finish": "unknown", unknown: "unknown", failed: "failed", processed: "terminal",
      linked: "failed", "old-unknown": "unknown",
    });
    assert.deepEqual(await staged(contender, ["safe"]), {});
    assert.equal(await worker.query(seal(second, 3)), "t");
    assert.equal(await worker.query(seal(contender, 1)), "f");

    await owner.query(`update public.repo_grade_startup_batches set expires_at = clock_timestamp() + interval '1 minute'
      where user_id = '${account}' and id = '${second}';`);
    assert.equal(await worker.query(start(second, "safe", otherRef)), "t");
    assert.equal(await owner.query(`select expires_at > clock_timestamp() + interval '14 minutes'
      from public.repo_grade_startup_batches where user_id = '${account}' and id = '${second}';`), "t");
    assert.equal(await worker.query(start(second, "expires", otherRef)), "t");
    assert.equal(await worker.query(finish(second, "expires", "not-started", otherRef)), "t");
    await owner.query(`update public.repo_grade_startup_batches set expires_at = clock_timestamp()
      where user_id = '${account}' and id = '${second}';`);
    const expiredClaim = await worker.query(`select public.repo_grade_claim_startup_target(
      ${targetArgs(second, "safe", otherRef)}, null, null, null, null);`);
    assert.deepEqual(JSON.parse(expiredClaim), { status: "forbidden" });
    assert.deepEqual(await staged(third, ["expires", "safe"]), {});
    assert.equal(await worker.query(seal(third, 2)), "t");
  } finally {
    await worker.query("reset role;");
  }
}
