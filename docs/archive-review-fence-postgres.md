# Archive review fence: disposable PostgreSQL check

The [SQL draft](archive-review-fence-draft.sql) is rollback-only and has no runtime grants. It does not create a production migration, authenticate a caller, fence Storage policies, retire upload capabilities, perform cleanup, or dispatch grading. Its principal and quiescence inputs must come from a future trusted server; the database functions do not verify those claims themselves.

The opt-in harness checks its rollback and selected transaction, scope, replay, permission, and lock-order behavior in a **fresh disposable local cluster only**. Never point it at an existing cluster. It leaves the fixture schema in that test database, but does not create cluster-wide roles. It accepts no remote host or connection string, ignores ambient libpq credentials, and checks markers and empty schemas in both the fixture and bootstrap databases, server address, and bootstrap role before issuing fixture DDL. These checks are safeguards, not proof that an arbitrary cluster is disposable; use the separate cluster created below. Run PostgreSQL 15 or later with `initdb`, `pg_ctl`, `psql`, and Node.js installed. Choose an unused local port.

```powershell
$reviewCluster = Join-Path ([System.IO.Path]::GetTempPath()) ('archive-review-pg-' + [guid]::NewGuid().ToString('N'))
$reviewPort = 55440
$reviewDatabase = 'archive_review_fence_test_fresh'
$reviewUser = 'archive_review_test_admin'

initdb -D $reviewCluster -U $reviewUser --auth=trust
if ($LASTEXITCODE -ne 0) { throw 'Could not initialize the disposable cluster.' }
pg_ctl -D $reviewCluster -l (Join-Path $reviewCluster 'server.log') -o "-h 127.0.0.1 -p $reviewPort" -w start
if ($LASTEXITCODE -ne 0) { throw 'Could not start the disposable cluster.' }

try {
  $reviewConnection = "host=127.0.0.1 hostaddr=127.0.0.1 port=$reviewPort dbname=postgres user=$reviewUser sslmode=disable gssencmode=disable"
  psql -X -w -v ON_ERROR_STOP=1 --dbname=$reviewConnection -c "comment on database postgres is 'archive-review-fence disposable cluster'" -c "create database $reviewDatabase" -c "comment on database $reviewDatabase is 'archive-review-fence disposable harness'"
  if ($LASTEXITCODE -ne 0) { throw 'Could not create and mark the disposable database.' }
  node src/tools/archive-review-fence-postgres.mjs --disposable 127.0.0.1 $reviewPort $reviewDatabase $reviewUser
  if ($LASTEXITCODE -ne 0) { throw 'Archive review PostgreSQL check failed.' }
} finally {
  pg_ctl -D $reviewCluster -m fast -w stop
  if ($LASTEXITCODE -ne 0) { throw "Could not stop the disposable cluster in $reviewCluster." }
}
```

After stopping it, remove the uniquely named temporary cluster only after verifying its resolved path. Run `node --test src/tools/archive-review-fence-postgres.test.mjs` to test the argument and rollback-draft guards without PostgreSQL. Those unit tests do **not** execute SQL or establish database concurrency.

The authoring host has no `psql`, `postgres`, `initdb`, `pg_ctl`, or Docker executable, so the PostgreSQL harness has not been run here. Before any activation, the draft requires an independent SQL review, successful disposable concurrency/privilege tests, a real owner-scoped record and live-session authorization design, verified private Storage policies and pre-download bounds, permanent writer/capability fencing, recovery of ambiguous operations, eventual cleanup, and atomic single-use grading admission. Authenticated browser and authorized Storage integration tests remain separate gates.
