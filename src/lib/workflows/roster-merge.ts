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

export function mergeCanvasRoster(
  existing: RosterStudentRepo[],
  students: Array<{ id: string; name: string }>
): { studentRepos: RosterStudentRepo[]; roster: string; added: number } {
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

  // Derive roster text exactly like buildRosterUpdate: only entries with username
  const rosterLines: string[] = [];
  for (const entry of studentRepos) {
    if (entry.username) {
      rosterLines.push(`${entry.student} | ${entry.username}`);
    }
  }
  const roster = rosterLines.join("\n");

  return { studentRepos, roster, added };
}

export function mergeImportedRoster(
  existing: RosterStudentRepo[],
  students: Array<{ name: string; email?: string; externalId?: string }>
): { studentRepos: RosterStudentRepo[]; roster: string; added: number; matched: number } {
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

  // Derive roster text from entries with username only (unchanged from existing pattern)
  const rosterLines: string[] = [];
  for (const entry of result) {
    if (entry.username) {
      rosterLines.push(`${entry.student} | ${entry.username}`);
    }
  }
  const roster = rosterLines.join("\n");

  return { studentRepos: result, roster, added, matched };
}
