/**
 * Merge GitHub usernames into course roster and student repo data structures.
 * Preserves existing repo bindings, deduplicates usernames, and disambiguates
 * duplicate student names.
 */

export interface RosterStudentRepo {
  student: string;
  canvasUserId: string | null;
  repo: string;
  username?: string | null;
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

export function buildRosterUpdate(input: {
  submissions: RosterSubmission[];
  existingStudentRepos: RosterStudentRepo[];
}): RosterUpdate {
  const { submissions, existingStudentRepos } = input;
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

  // Step 4: DERIVE roster from merged studentRepos
  const rosterLines: string[] = [];
  for (const entry of mergedStudentRepos) {
    if (entry.username) {
      rosterLines.push(`${entry.student} | ${entry.username}`);
    }
  }
  const roster = rosterLines.join("\n");

  // Step 5: Return the result
  return {
    studentRepos: mergedStudentRepos,
    roster,
    linked: keptSubmissions.length,
    conflicts,
  };
}
