import assert from "node:assert/strict";

const account = "00000000-0000-4000-8000-0000000000e1";
const other = "00000000-0000-4000-8000-0000000000e2";
const course = "00000000-0000-4000-8000-0000000001e1";
const scanLease = "00000000-0000-4000-8000-0000000002e1";
const gradeLease = "00000000-0000-4000-8000-0000000002e2";
const nextLease = "00000000-0000-4000-8000-0000000002e3";
const basis = "c".repeat(64);
const sha = "a".repeat(40);
const repo = "Example/Repo";
const folder = "assignment";
const snapshot = { version: 1, basis, discovery: { status: "scanned", enumerationComplete: true, repos: [
  { status: "ready", repo, sourceRef: "main", sourceCommit: sha, folders: [folder] },
  { status: "ready", repo: "Example/Next", sourceRef: "main", sourceCommit: sha, folders: [folder] },
] } };
const selectors = snapshot.discovery.repos.map((row) => ({ repo: row.repo, folder, ref: "main", sha }));
const evidence = { version: 1, rows: ["private-evidence-marker"] };
const sqlJson = (value) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
const parse = (value) => value ? JSON.parse(value) : null;

export async function runAutomaticRepoGradeSnapshotCases({ owner, worker }) {
  await owner.query(`
    insert into auth.users values ('${account}'), ('${other}');
    insert into public.course_hub (id, user_id, github_org, name) values ('${course}', '${account}', 'Example', 'Snapshot course');
  `);
  for (const role of ["anon", "authenticated", "queue_v2_ungranted", "service_role"]) {
    for (const signature of [
      "repo_grade_automatic_finish_pinned_discovery(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb)",
      "repo_grade_automatic_read_pinned_inventory(uuid,uuid,uuid,uuid)",
      "repo_grade_automatic_read_pinned_evidence(uuid,uuid,uuid,uuid,text,text)",
      "repo_grade_automatic_save_pinned_evidence(uuid,uuid,uuid,uuid,text,text,jsonb)",
    ]) {
      assert.equal(await owner.query(`select has_function_privilege('${role}', 'public.${signature}', 'EXECUTE');`),
        role === "service_role" ? "t" : "f");
    }
  }
  const status = () => worker.query(`select public.repo_grade_automatic_status('${account}');`);
  const start = async () => {
    assert.equal(await worker.query(`select public.repo_grade_automatic_control('${account}', 'start');`), "t");
    return parse(await status()).run.id;
  };
  const claim = async (lease) => parse(await worker.query(`select public.repo_grade_automatic_claim('${lease}');`));
  const finishDiscovery = (id, lease) => worker.query(`select public.repo_grade_automatic_finish_pinned_discovery(
    '${id}', '${lease}', '${course}', 'scanned', null, ${sqlJson(selectors)}, null, ${sqlJson(snapshot)});`);
  const scope = (id, lease, user) => `'${id}', '${lease}', '${user}', '${course}'`;
  const inventory = async (id, lease, user = account) => parse(await worker.query(
    `select public.repo_grade_automatic_read_pinned_inventory(${scope(id, lease, user)});`));
  const read = async (id, lease, requested = folder) => parse(await worker.query(
    `select public.repo_grade_automatic_read_pinned_evidence(${scope(id, lease, account)}, '${requested}', '${basis}');`));
  const save = (id, lease, value = evidence) => worker.query(`select public.repo_grade_automatic_save_pinned_evidence(
    ${scope(id, lease, account)}, '${folder}', '${basis}', ${sqlJson(value)});`);
  const settle = (id, lease) => worker.query(`select public.repo_grade_automatic_finish('${id}', '${lease}', '${course}', 'succeeded', null);`);

  await worker.query("set role service_role;");
  try {
    const id = await start();
    assert.equal((await claim(scanLease)).phase, "discovering");
    assert.equal(await finishDiscovery(id, gradeLease), "f");
    assert.equal(await finishDiscovery(id, scanLease), "t");
    assert.equal(await finishDiscovery(id, scanLease), "f");
    assert.equal(await inventory(id, scanLease), null);
    assert.equal((await claim(gradeLease)).repo, repo);
    assert.deepEqual(await inventory(id, gradeLease), { snapshot });
    assert.equal(await inventory(id, gradeLease, other), null);
    assert.equal(await read(id, gradeLease, "another-folder"), null);
    assert.deepEqual(await read(id, gradeLease), { evidence: null });
    assert.equal(await save(id, scanLease), "f");
    assert.equal(await save(id, gradeLease), "t");
    assert.equal(await save(id, gradeLease, { different: true }), "t");
    assert.equal(await settle(id, gradeLease), "t");
    assert.equal((await claim(nextLease)).repo, "Example/Next");
    assert.deepEqual(await read(id, nextLease), { evidence });
    assert.equal(await read(id, gradeLease), null);
    assert(!((await status()).includes("private-evidence-marker")));
    assert.equal(await settle(id, nextLease), "t");
    assert.deepEqual(await claim(nextLease), { phase: "advanced" });
    assert.equal(await owner.query(`select pinned_inventory is null from public.repo_grade_automatic_courses where run_id = '${id}';`), "t");
    assert.equal(await owner.query(`select not exists (select 1 from public.repo_grade_automatic_evidence where run_id = '${id}');`), "t");

    const stopped = await start();
    assert.equal((await claim(scanLease)).phase, "discovering");
    assert.equal(await worker.query(`select public.repo_grade_automatic_control('${account}', 'stop', null, '${stopped}');`), "t");
    assert.equal(await finishDiscovery(stopped, scanLease), "t");
    assert.equal(await owner.query(`select pinned_inventory is null from public.repo_grade_automatic_courses where run_id = '${stopped}';`), "t");
    assert.equal(await owner.query(`select not exists (select 1 from public.repo_grade_automatic_targets where run_id = '${stopped}');`), "t");
  } finally {
    await worker.query("reset role;");
  }
}
