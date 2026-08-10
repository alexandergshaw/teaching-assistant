// The structured error every GitHub REST failure throws, so a caller can read
// the HTTP status and the response headers as FIELDS rather than recovering
// them by parsing prose out of an error message.
//
// Why this is its own module, and why it imports nothing:
//
//   - It cannot live in src/lib/github.repos.ts (where ghFetch throws it).
//     That module reads process.env.GITHUB_TOKEN at call time and is
//     server-only; anything importing it drags a secret-reading module toward
//     the client bundle. src/lib/repo-grade-tree-scan.ts needs to narrow this
//     error type and is a plain lib module reachable from the Repo Grades UI's
//     type imports, so it must not import the GitHub client to do so.
//   - It cannot live in src/lib/github-rate-limit.ts either. That module is
//     deliberately pure and DOM-lib-free (it accepts a minimal header reader
//     rather than the concrete `Headers` class), and it carries pinned tests;
//     adding a class with a `Headers` field would undo the first property and
//     churn a file the second one guards.
//
// So: zero imports, zero environment access, one class and two helpers.
// GithubHeaderReader is declared structurally rather than shared by import,
// which is exactly why github-rate-limit.ts's own private `HeaderReader`
// accepts it without either file knowing about the other.

/** The subset of the Fetch API's `Headers` that rate-limit classification
 * actually needs. A real `Headers` instance satisfies this structurally, as
 * does a plain object in a test, and neither this file nor its consumers pick
 * up a DOM lib dependency for it. */
export interface GithubHeaderReader {
  get(name: string): string | null;
}

/** A header reader for the case where no response headers were available at
 * all - a failure recovered from an error message rather than from a live
 * `Response`. Every lookup returns null, which every reader in this codebase
 * already treats as "GitHub did not report this", so it degrades cleanly
 * rather than needing a null-check at each call site. */
export const EMPTY_GITHUB_HEADERS: GithubHeaderReader = { get: () => null };

/**
 * A failed GitHub REST response, carrying the status and headers alongside
 * the human-readable message.
 *
 * The message is produced by `ghError` (src/lib/github.repos.ts:12) exactly as
 * before this class existed - that is deliberate and is what makes throwing
 * this instead of a plain `Error` a non-breaking change. Every one of the
 * existing `ghFetch`/`ghJson` call sites across the github.*.ts modules reads
 * only `.message` or tests `instanceof Error`, and both still hold here.
 * Nothing in this codebase branches on `err.name`, so naming the class is
 * safe; it is set for readable stack traces, not for anyone to switch on.
 */
export class GithubHttpError extends Error {
  readonly status: number;
  readonly headers: GithubHeaderReader;

  constructor(message: string, status: number, headers: GithubHeaderReader) {
    super(message);
    this.name = "GithubHttpError";
    this.status = status;
    this.headers = headers;
  }
}

/**
 * Narrows an unknown caught value to a GithubHttpError, or null when it is
 * anything else (a network failure, a thrown string, an error from a
 * non-GitHub layer).
 *
 * Returning null rather than throwing is the point: callers are expected to
 * have a second-choice path for failures that carry no structured status, and
 * that path has to keep working. See src/lib/repo-grade-tree-scan.ts, which
 * falls back to parsing the status out of the message text for exactly the
 * errors this returns null for.
 */
export function asGithubHttpError(err: unknown): GithubHttpError | null {
  return err instanceof GithubHttpError ? err : null;
}
