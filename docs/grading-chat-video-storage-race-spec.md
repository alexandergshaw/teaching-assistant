# Disposable Storage upload and deletion race: verification specification

Status: specification only. No harness, migration, policy, Storage operation or
integration result is provided by this document. The durable video transport
and deletion remain hard off. This test is a prerequisite, not proof of safety.

## Target admission

A future executable harness must fail closed before reading credentials or
issuing any request unless all of the following are true:

1. The operator explicitly chooses a disposable mode. The harness does not
   accept arbitrary URLs, SQL fragments, bucket names or shell commands.
2. The PostgreSQL endpoint and the Storage endpoint resolve to literal
   `127.0.0.1` with explicitly supplied, distinct ports; reject hostnames,
   alternate addresses, proxy variables, redirects and inherited credentials.
3. The database name is a fresh test-only name with a fixed prefix. A harness-
   generated random nonce must match a marker in the database and in a Storage
   test fixture. Verify PostgreSQL client and server IPs are both loopback and
   the service is writable, isolated and owned by the disposable stack.
4. Storage must be a test-only instance tied to the same disposable database,
   with a harness-generated per-run identity confirmed by a test-only fixture.
   A localhost proxy to a remote service is not sufficient. Confirm its backing
   object store is also disposable and isolated; refuse any shared credentials
   or deployment. An operator-provided assertion alone is not evidence.
5. The harness creates only a fresh randomly named private test bucket and
   dedicated test identities; it never targets existing buckets, policies,
   accounts or object paths. Fail on any pre-existing name. Use no production
   data or credentials. Record only public fixture IDs and outcomes, never JWTs,
   service keys, signed URLs, source bytes or student data.
6. Ensure the tested Storage build/version is recorded, including its exact
   source revision or immutable image digest. A local passing result does not
   establish that the hosted service runs that build.

Implement these checks as executable tests with adversarial cases, including a
remote upstream behind localhost, redirect, IPv6/hostname alias, reused marker,
shared object store, existing bucket, wrong database and malformed arguments.
Any uncertainty means no test proceeds. A harness without a way to prove the
Storage-to-database and Storage-to-object-store bindings must refuse to run.

## Required instrument

The disposable Storage fixture must expose deterministic barriers immediately
before the final authorization/policy check and before the metadata commit,
without substituting a fake upload. A controlled proxy alone that pauses request
bodies is insufficient unless the fixture proves where the server paused.
Capture the actual DB transaction, savepoint and lock state. The candidate RLS
policy and deletion-claim routine are test-only and must not modify an existing
production migration or be granted outside this isolated fixture.

Use actual authenticated Storage clients, separate DB sessions, and a private
object store. Confirm through the real Storage API and the backing test store
that metadata and bytes are absent after cleanup. Database metadata absence
alone is not proof that bytes were removed. Every barrier and network operation
must have a timeout, and a timeout is a failed/unknown test, not success.

## Required races

For each supported standard and resumable upload path and each applicable
Storage build:

1. Begin upload A; hold it immediately before its final caller-policy check.
   In DB session B atomically close admission and claim deletion. Resume A.
   Verify A cannot create object metadata or bytes after B's committed fence,
   and an owner cannot re-open the same object identity.
2. Begin upload A and let its final policy check start while holding its
   transaction at the instrumented point. In parallel request deletion B.
   Prove B waits or fails until A commits/rolls back, and does not claim the
   object while A can still commit. Observe whether locks acquired by a policy
   helper survive the Storage permission probe's savepoint rollback. Record the
   actual lock type and transaction owner, not just timing.
3. Test two authenticated uploads to the same path, one whose response is lost,
   repeated completion, client abort, auth/session revocation, account deletion,
   and a deliberately delayed final upload request. No late retry may recreate
   bytes after a successful deletion. Confirm no upsert permission exists.
4. Test shared item/intake references and concurrent admission, reference
   release, object-claim and retry. A live or uncertain reference must prevent
   deletion. Claimed and dispatched provider work must remain fenced even if a
   lease expires. Test stale tokens and a lost delete response followed by an
   idempotent retry.
5. Test failures of final policy check, Storage DELETE, presence check and
   database completion independently. Mismatched hashes, missing objects,
   timeouts and unknown responses must never be treated as proof that an upload
   has stopped. Assert eventual cleanup only for explicitly demonstrated safe
   terminal states; report all retained unknowns separately.
6. Confirm owners cannot read, upload, bind, release or delete another owner's
   object, and verify all service-role grants and RLS policy combinations.

Run each barrier ordering repeatedly using deterministic coordination rather
than sleeps, and include negative controls that intentionally remove the fence
and make the relevant assertion fail. Save a redacted transcript containing
fixture version, commands, exit codes and individual case outcomes. Browser
verification, hosted Storage compatibility and any real provider grading run
remain separate gates. Never enable production from this test alone.
