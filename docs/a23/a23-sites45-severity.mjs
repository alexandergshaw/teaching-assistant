// A23 wave step 0 (RES-A23-13). Severity measurement for the two OUT-OF-SCOPE
// sites of the same class (RES-A23-9): course-schedule-docx.test.ts and
// steps.weekly-announcement-schedule.test.ts guard different directories with
// the same line-filter idiom this row replaces for repo-grades/grading-
// results. This probe runs the SAME transitive walk over their own guarded
// objects and reports whether either currently carries a live violation -
// i.e. whether leaving them un-migrated is costing anything TODAY.
// Run: node docs/a23/a23-sites45-severity.mjs
import { join } from "node:path";
import { SRC, SHIPPING_OPTIONS, walkRuntimeGraph } from "./_lib.mjs";

const targets = [
  { label: "course-schedule-docx.ts", abs: join(SRC, "lib", "workflows", "course-schedule-docx.ts") },
  {
    label: "steps.weekly-announcement-schedule.ts",
    abs: join(SRC, "lib", "workflows", "registry", "steps.weekly-announcement-schedule.ts"),
  },
];

for (const t of targets) {
  const result = walkRuntimeGraph([t.abs], SHIPPING_OPTIONS);
  console.log(`${t.label}: nodes=${result.nodes} violations=${result.violations.length} unallowed=${result.unallowed.length}`);
  for (const v of result.violations) console.log(`  VIOLATION ${v.trail.join(" -> ")} -> ${v.resolved}`);
}
console.log("\nSeverity reading: zero violations on either target means leaving these two sites on their own line-filter guard costs nothing measurable on this tree today (out of scope for A23, RES-A23-9).");
