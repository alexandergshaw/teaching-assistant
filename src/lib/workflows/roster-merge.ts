/**
 * Merge GitHub usernames into course roster and student repo data structures.
 * Preserves existing repo bindings, deduplicates usernames, and disambiguates
 * duplicate student names.
 *
 * Every roster-deriving function below (buildRosterUpdate, mergeCanvasRoster,
 * mergeImportedRoster) used to derive `roster` TEXT purely from its merged
 * studentRepos, keeping only entries that carried a username. That silently
 * REPLACED course.roster: a hand-typed line for a student who never submitted
 * and has no GitHub handle recorded anywhere was not merely left out of a new
 * line - it was erased, because the caller writes `roster: update.roster`
 * straight onto the course. Every one of these functions now takes the
 * course's EXISTING roster text and merges derived candidates INTO it via
 * mergeRosterText below: every line already there survives; a candidate may
 * only fill a blank username or add a brand-new line, never drop one.
 */

import { rosterToRows, rowsToRoster } from "@/lib/courses-tab-helpers";

export interface RosterStudentRepo {
  student: string;
  canvasUserId: string | null;
  repo: string;
  username?: string | null;
  email?: string | null;
}

export interface RosterSubmission {
  canvasUserId: string;
  student: string;
  username: string;
}

export interface RosterUpdate {
  studentRepos: RosterStudentRepo[];
  roster: string;
  linked: number;
  conflicts: string[];
}

/**
 * Mirrors rosterUsernameOverlay.ts's canonicalNameKey (deliberately
 * duplicated, not imported: that module lives under app/components/repo-
 * grades and this one under lib/workflows, and the two are wired together
 * only through the plain {student, username} shape below, not through a
 * shared import). Trim, collapse whitespace, lowercase, and invert a
 * "Last, First" spelling - the Courses tab Roster tile's own placeholder
 * format - to "first last" so it collides with the same student's
 * "First Last" spelling as it appears in a Canvas submission or import row.
 * A name with no comma passes through unchanged, which is exactly the key a
 * comma-form name produces once inverted, so both spellings collide on
 * purpose.
 */
function canonicalRosterNameKey(name: string): string {
  const normalized = name.trim().replace(/\s+/g, " ").toLowerCase();
  const commaIndex = normalized.indexOf(",");
  if (commaIndex === -1) return normalized;
  const last = normalized.slice(0, commaIndex).trim();
  const first = normalized.slice(commaIndex + 1).trim();
  if (!last || !first) return normalized;
  return `${first} ${last}`;
}

/**
 * Merges freshly-derived {student, username} candidates into an existing
 * roster TEXT, never dropping a line already there.
 *
 * - A candidate whose (canonically-keyed) name matches exactly one existing
 *   line with a BLANK username fills that blank.
 * - A candidate whose name matches exactly one existing line with the SAME
 *   (case-insensitive) username changes nothing.
 * - A candidate whose name matches exactly one existing line with a
 *   DIFFERENT, non-blank username is a genuine disagreement. The candidate
 *   wins - it was just derived from a live Canvas submission or import, the
 *   same "structured data outranks hand-typed text" rule
 *   rosterUsernameOverlay.ts documents and applies in the opposite direction
 *   (there, an existing studentRepos username - itself submission-derived -
 *   outranks a hand-typed roster line; here, the fresh submission/import
 *   outranks the pre-existing hand-typed line). The overridden line is never
 *   silently replaced without a trace: it is named in `conflicts`.
 * - A candidate whose name matches MORE THAN ONE existing line is left
 *   alone entirely (same ambiguous-match posture as
 *   rosterUsernameOverlay.ts) - a wrong guess here is exactly how a grade
 *   reaches the wrong student - and is reported in `conflicts`.
 * - A candidate matching no existing line is appended as a new line.
 * - Every existing line that no candidate ever names (a student with no
 *   GitHub handle recorded anywhere, or one who simply did not submit or
 *   import this run) passes through completely unchanged.
 */
function mergeRosterText(
  existingRosterText: string,
  candidates: ReadonlyArray<{ student: string; username: string }>
): { roster: string; conflicts: string[] } {
  const rows = rosterToRows(existingRosterText).map((r) => ({ ...r }));
  const conflicts: string[] = [];

  // Index existing lines by canonical name key BEFORE any mutation or
  // addition, so a name that matches more than one EXISTING line is detected
  // against the original set, and so a line added later in this same pass
  // can never accidentally satisfy a still-unprocessed candidate's lookup.
  const byKey = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = canonicalRosterNameKey(row.student);
    if (!key) return;
    const existing = byKey.get(key);
    if (existing) existing.push(index);
    else byKey.set(key, [index]);
  });

  for (const { student, username } of candidates) {
    const trimmedStudent = student.trim();
    const trimmedUsername = username.trim();
    if (!trimmedStudent || !trimmedUsername) continue;

    const key = canonicalRosterNameKey(trimmedStudent);
    const indices = byKey.get(key) ?? [];

    if (indices.length > 1) {
      conflicts.push(
        `${trimmedStudent}: ambiguous match in the existing roster (${indices.length} lines share this name) - left unchanged`
      );
      continue;
    }

    if (indices.length === 1) {
      const row = rows[indices[0]];
      const existingUsername = row.username.trim();
      if (!existingUsername) {
        row.username = trimmedUsername;
      } else if (existingUsername.toLowerCase() !== trimmedUsername.toLowerCase()) {
        conflicts.push(
          `${trimmedStudent}: roster had "${existingUsername}", submission says "${trimmedUsername}" - updated to "${trimmedUsername}"`
        );
        row.username = trimmedUsername;
      }
      continue;
    }

    // No existing line for this student - add one, and register it so a
    // later candidate that names the same student updates this new row
    // instead of appending a second one.
    rows.push({ student: trimmedStudent, username: trimmedUsername });
    byKey.set(key, [rows.length - 1]);
  }

  return { roster: rowsToRoster(rows), conflicts };
}

export function buildRosterUpdate(input: {
  submissions: RosterSubmission[];
  existingStudentRepos: RosterStudentRepo[];
  /** The course tile's CURRENT course.roster text, before this run. Every
   * line in it survives this call (see mergeRosterText above) - pass ""
   * only when the tile genuinely has no roster text yet, never as a
   * shortcut, since that silently reproduces the erasure this function used
   * to cause. */
  existingRoster: string;
}): RosterUpdate {
  const { submissions, existingStudentRepos, existingRoster } = input;
  const conflicts: string[] = [];

  // Step 1: DEDUP by username (case-insensitive)
  const usernameMap = new Map<string, RosterSubmission[]>();
  for (const sub of submissions) {
    const key = sub.username.toLowerCase();
    if (!usernameMap.has(key)) {
      usernameMap.set(key, []);
    }
    usernameMap.get(key)!.push(sub);
  }

  const keptSubmissions: RosterSubmission[] = [];
  for (const [username, subs] of usernameMap) {
    if (subs.length > 1) {
      const names = subs.map((s) => s.student).join(", ");
      conflicts.push(`Duplicate GitHub username "${username}" (${names}) - skipped`);
    } else {
      keptSubmissions.push(subs[0]);
    }
  }

  // Step 2: DISAMBIGUATE duplicate display names
  const nameMap = new Map<string, RosterSubmission[]>();
  for (const sub of keptSubmissions) {
    const key = sub.student.toLowerCase();
    if (!nameMap.has(key)) {
      nameMap.set(key, []);
    }
    nameMap.get(key)!.push(sub);
  }

  const disambiguatedSubmissions: RosterSubmission[] = [];
  for (const [, subs] of nameMap) {
    if (subs.length > 1) {
      conflicts.push(`Duplicate name "${subs[0].student}" - repos named with the username`);
      for (const sub of subs) {
        disambiguatedSubmissions.push({
          ...sub,
          student: `${sub.student} (${sub.username})`,
        });
      }
    } else {
      disambiguatedSubmissions.push(subs[0]);
    }
  }

  // Step 3: MERGE studentRepos by canvasUserId
  const reposByUserId = new Map<string, RosterStudentRepo>();

  // Start with a shallow copy of existing repos
  for (const existing of existingStudentRepos) {
    if (existing.canvasUserId) {
      reposByUserId.set(existing.canvasUserId, { ...existing });
    }
  }

  // For each kept submission, update or add an entry
  for (const sub of disambiguatedSubmissions) {
    const existing = reposByUserId.get(sub.canvasUserId);
    if (existing) {
      existing.student = sub.student;
      existing.username = sub.username;
    } else {
      reposByUserId.set(sub.canvasUserId, {
        student: sub.student,
        canvasUserId: sub.canvasUserId,
        username: sub.username,
        repo: "",
      });
    }
  }

  // Preserve existing entries that have no Canvas user id (manually added
  // bindings): they can never match a submission, so pass them through unchanged
  // rather than dropping them.
  const nullIdEntries = existingStudentRepos.filter((e) => !e.canvasUserId);
  const mergedStudentRepos = [...Array.from(reposByUserId.values()), ...nullIdEntries];

  // Step 4: MERGE the derived {student, username} candidates into the
  // EXISTING roster text - never derive it from scratch (see this file's
  // header and mergeRosterText's own doc comment for why).
  const candidates = mergedStudentRepos
    .filter((entry) => !!entry.username)
    .map((entry) => ({ student: entry.student, username: entry.username as string }));
  const { roster, conflicts: rosterConflicts } = mergeRosterText(existingRoster, candidates);
  conflicts.push(...rosterConflicts);

  // Step 5: Return the result
  return {
    studentRepos: mergedStudentRepos,
    roster,
    linked: keptSubmissions.length,
    conflicts,
  };
}

export function mergeCanvasRoster(
  existing: RosterStudentRepo[],
  students: Array<{ id: string; name: string }>,
  /** The course tile's CURRENT course.roster text, before this run - see
   * buildRosterUpdate's `existingRoster` doc comment; the same rule applies
   * here. */
  existingRoster: string
): { studentRepos: RosterStudentRepo[]; roster: string; added: number; conflicts: string[] } {
  // Create a map of existing entries by canvasUserId
  const existingByUserId = new Map<string, RosterStudentRepo>();
  const nullIdEntries: RosterStudentRepo[] = [];

  for (const entry of existing) {
    if (entry.canvasUserId) {
      existingByUserId.set(entry.canvasUserId, { ...entry });
    } else {
      nullIdEntries.push({ ...entry });
    }
  }

  // Track how many new students we add
  let added = 0;

  // Process Canvas students
  for (const student of students) {
    const existingEntry = existingByUserId.get(student.id);
    if (existingEntry) {
      // Matched: update student name when different; never touch username or repo
      if (existingEntry.student !== student.name) {
        existingEntry.student = student.name;
      }
    } else {
      // Unmatched: append new entry
      existingByUserId.set(student.id, {
        student: student.name,
        canvasUserId: student.id,
        repo: "",
        username: null,
      });
      added++;
    }
  }

  // Combine matched/updated entries with null-id entries
  const studentRepos = [
    ...Array.from(existingByUserId.values()),
    ...nullIdEntries,
  ];

  // Merge derived candidates (entries with a username) into the existing
  // roster TEXT - never derive it from scratch. See mergeRosterText's doc
  // comment and this file's header.
  const candidates = studentRepos
    .filter((entry) => !!entry.username)
    .map((entry) => ({ student: entry.student, username: entry.username as string }));
  const { roster, conflicts } = mergeRosterText(existingRoster, candidates);

  return { studentRepos, roster, added, conflicts };
}

export function mergeImportedRoster(
  existing: RosterStudentRepo[],
  students: Array<{ name: string; email?: string; externalId?: string }>,
  /** The course tile's CURRENT course.roster text, before this run - see
   * buildRosterUpdate's `existingRoster` doc comment; the same rule applies
   * here. */
  existingRoster: string
): { studentRepos: RosterStudentRepo[]; roster: string; added: number; matched: number; conflicts: string[] } {
  // Make a shallow copy of existing entries for tracking and updates
  const existingCopy = existing.map((e) => ({ ...e }));

  // Create maps for matching: by externalId (canvasUserId), by email (case-insensitive), by name
  const existingByUserId = new Map<string, RosterStudentRepo>();
  const existingByEmail = new Map<string, RosterStudentRepo>();
  const existingByName = new Map<string, RosterStudentRepo>();

  for (const entry of existingCopy) {
    if (entry.canvasUserId) {
      existingByUserId.set(entry.canvasUserId, entry);
    }

    if (entry.email) {
      const emailKey = entry.email.toLowerCase();
      existingByEmail.set(emailKey, entry);
    }

    existingByName.set(entry.student, entry);
  }

  let added = 0;
  let matched = 0;

  // Track which imported students were matched (by index)
  const matchedStudentIndices = new Set<number>();
  // Track which existing entries were matched (by reference)
  const matchedEntries = new Set<RosterStudentRepo>();

  // Process imported students with priority: externalId, then email, then name
  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    let existingEntry: RosterStudentRepo | undefined;
    let matchedThisStudent = false;

    // Priority 1: Match by externalId (canvasUserId)
    if (student.externalId) {
      existingEntry = existingByUserId.get(student.externalId);
      if (existingEntry && !matchedEntries.has(existingEntry)) {
        matchedEntries.add(existingEntry);
        matchedStudentIndices.add(i);
        matchedThisStudent = true;
      }
    }

    // Priority 2: Match by email (case-insensitive)
    if (!matchedThisStudent && student.email) {
      const emailKey = student.email.toLowerCase();
      existingEntry = existingByEmail.get(emailKey);
      if (existingEntry && !matchedEntries.has(existingEntry)) {
        matchedEntries.add(existingEntry);
        matchedStudentIndices.add(i);
        matchedThisStudent = true;
      }
    }

    // Priority 3: Match by exact name
    if (!matchedThisStudent) {
      existingEntry = existingByName.get(student.name);
      if (existingEntry && !matchedEntries.has(existingEntry)) {
        matchedEntries.add(existingEntry);
        matchedStudentIndices.add(i);
        matchedThisStudent = true;
      }
    }

    if (matchedThisStudent && existingEntry) {
      // Update matched entry: gain email when absent (never overwrite)
      if (student.email && !existingEntry.email) {
        existingEntry.email = student.email;
      }
      matched++;
    }
  }

  // Rebuild the student repos list: all existing entries + new unmatched students
  const result: RosterStudentRepo[] = [];

  // Add ALL existing entries (matched or not - never drop entries)
  for (const entry of existingCopy) {
    result.push(entry);
  }

  // Add unmatched imported students (those whose index is not in matchedStudentIndices)
  for (let i = 0; i < students.length; i++) {
    if (!matchedStudentIndices.has(i)) {
      const student = students[i];
      // Create new entry for unmatched student
      result.push({
        student: student.name,
        canvasUserId: student.externalId ?? null,
        repo: "",
        username: null,
        email: student.email,
      });
      added++;
    }
  }

  // Merge derived candidates (entries with a username) into the existing
  // roster TEXT - never derive it from scratch. See mergeRosterText's doc
  // comment and this file's header.
  const candidates = result
    .filter((entry) => !!entry.username)
    .map((entry) => ({ student: entry.student, username: entry.username as string }));
  const { roster, conflicts } = mergeRosterText(existingRoster, candidates);

  return { studentRepos: result, roster, added, matched, conflicts };
}
