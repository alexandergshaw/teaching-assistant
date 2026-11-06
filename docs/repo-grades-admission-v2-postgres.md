# Queue v2 disposable PostgreSQL check

Run this opt-in harness against a fresh, dedicated local PostgreSQL cluster. It checks the rollback-only [SQL draft](repo-grades-admission-v2-draft.sql), then loads a copy with a final `COMMIT` into the disposable database so separate backends can exercise the functions. The harness leaves the fixture schema, roles, and data in the test cluster for inspection. Each run needs a fresh cluster. Keep the cluster bound to loopback and stop it after the run.

Use PostgreSQL 15 or later with `initdb`, `pg_ctl`, and `psql` on `PATH`, plus Node.js. Use the same installed PostgreSQL distribution for all three commands. Run these commands from the repository root in PowerShell. Pick an unused local port before starting the cluster.

```powershell
$queueCluster = Join-Path ([System.IO.Path]::GetTempPath()) ('queue-v2-pg-' + [guid]::NewGuid().ToString('N'))
$queuePort = 55439
$queueDatabase = 'repo_grades_queue_v2_test_fresh'
$queueUser = 'queue_v2_test_admin'

initdb -D $queueCluster -U $queueUser --auth=trust
if ($LASTEXITCODE -ne 0) { throw 'Could not initialize the disposable cluster.' }
pg_ctl -D $queueCluster -l (Join-Path $queueCluster 'server.log') -o "-h 127.0.0.1 -p $queuePort" -w start
if ($LASTEXITCODE -ne 0) { throw 'Could not start the disposable cluster.' }

try {
  $queueConn = "host=127.0.0.1 hostaddr=127.0.0.1 port=$queuePort dbname=postgres user=$queueUser sslmode=disable gssencmode=disable"
  psql -X -w -v ON_ERROR_STOP=1 --dbname=$queueConn -c "create database $queueDatabase" -c "comment on database $queueDatabase is 'repo-grades-queue-v2 disposable harness'"
  if ($LASTEXITCODE -ne 0) { throw 'Could not create and mark the disposable database.' }
  node src/tools/repo-grades-admission-v2-postgres.mjs --disposable 127.0.0.1 $queuePort $queueDatabase $queueUser
  if ($LASTEXITCODE -ne 0) { throw 'Queue-v2 PostgreSQL check failed.' }
} finally {
  pg_ctl -D $queueCluster -m fast -w stop
  if ($LASTEXITCODE -ne 0) { throw "Could not stop the disposable cluster in $queueCluster." }
}
```

The harness refuses connection strings, non-loopback hosts, database names outside `repo_grades_queue_v2_test_*`, missing opt-in, and ambient libpq settings. Before issuing fixture DDL, it verifies the database marker, server address and port, local bootstrap superuser, absence of other application databases and roles, and empty target schema. It launches separate `psql` processes with startup files disabled and fails on SQL errors, missing executables, lock observation failures, or timeouts. Setup uses trust authentication for the temporary loopback cluster. The harness accepts no credentials and makes no remote requests. Remove the unique `$queueCluster` folder once the stopped cluster is no longer needed.

The fixture creates synthetic `auth.users` and `auth.uid()` definitions and the PostgreSQL API roles. It loads the checked-in course, rubric, and v1 admission migrations needed by the draft. It checks rollback from the original connection and a second connection, then runs the committed copy through these cases.

- Effective schema, table, column and routine permissions under `SET ROLE`, direct access failures, and a positive v1 service-role grant. An otherwise ungranted role checks for access inherited from `PUBLIC`.
- Duplicate begin after a confirmed advisory-lock wait, with the first permit persisted and the contender returning replay without a permit. Another account can consume its own slot while that lock is held. The checks also cover wrong executor and course ownership, and a later slot before and after the first consumption.
- A rollback after begin lets a blocked retry issue and persist a different permit.
- Expiry before begin revokes the untouched attempt. Begin before expiry preserves its consumed permit and changes the attempt to `unknown`. The harness advances that fixture's deadline inside the winner's transaction to exercise the ordering without a narrow wall-clock window.
- Synthetic account and course tombstones block fresh consumption even after the live IDs reappear. Legacy origin, an existing v1 reservation, and a missing live account also block consumption.

Run the connection guard and draft-transformation tests without PostgreSQL using `node --test src/tools/repo-grades-admission-v2-postgres.test.mjs`. The PostgreSQL command must print `PASS: queue-v2 rollback, effective privileges and PostgreSQL transaction cases completed, including settlement.` and exit zero to count as database evidence. `Get-Command initdb,pg_ctl,postgres,psql,docker` found none of those commands on the authoring host, so the real PostgreSQL cases remain unverified there.

The local fixture covers PostgreSQL object ACLs and transaction semantics. Supabase Data API schema exposure and live role configuration, trusted plan provisioning, the transport's single-use check, deletion writers, and recovery require their own verification. The harness is a review instrument for the drafts.

## Settlement extension review

The [settlement draft](repo-grades-admission-v2-settlement-draft.sql) is a separate rollback-only extension of the private schema. After exercising the base draft, the harness checks settlement rollback, then loads a committed copy into the same disposable database. It checks effective privileges with simulated API-role defaults, denies cross-attempt evidence and closure without a matching receipt, observes advisory-lock waits during closure and settlement races, and verifies settlement rollback, replay, expiry, and tombstone behavior. Run `npm.cmd test -- src/lib/repo-grades-dashboard/admission-v2-settlement-schema.test.ts` for source assertions. These assertions do not parse or execute SQL.

The review operator is the private schema owner. In a single-account `READ COMMITTED` transaction, the owner can append independently verified evidence. The database binds a transport receipt to the consumed permit and its exact sealed operation. Receipt closure and settlement accept evidence IDs and check the full attempt binding. Before trusting an insertion, an external verifier must authenticate the executor, establish the terminal outcome, and prove retirement of the original permit, including exclusion of delayed dispatch. A separate verified claim establishes aggregate outcome and, where applicable, the result digest. A provider receipt alone supplies neither complete grading inputs nor a conclusive no-submission. The draft includes no external verifier, credential handling, or grant for a runtime principal.

An exact replay returns status only. New settlement requires live account and course scope and rejects durable tombstones and overlapping v1 reservations. A consumed slot with no accepted receipt keeps the account fenced. The selected verified claim, slot counters, and release commit together as private admission history. A deleted course may receive late terminal evidence to preserve safety, while fresh settlement cannot publish a digest or release its fence. The draft has no durable link from an admission attempt to a captured batch target or saved grade. Dashboard result publication, per-target counters, and independent recovery require those separate contracts.

Before considering activation, run the disposable PostgreSQL check. Additional verification remains for these cases.

- Verify RLS, schema exposure and inherited role grants separately in the target Supabase environment.
- Exercise a response lost in the actual runtime after settlement commits.
- Race expiry and scope deletion with settlement using the runtime deletion writer when it exists.
- Verify both directions of legacy/manual coexistence against all actual provider entry points, including old clients and direct service-role writes. The current draft only checks for existing v1 reservations and shares the lock namespace. It does not change what a v1 claimant can do after the v2 transaction releases the lock.

The settlement extension still needs real PostgreSQL concurrency, RLS and privilege, and mixed-version verification. The queue remains disabled.
