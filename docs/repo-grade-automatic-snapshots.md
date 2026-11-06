# Repository grading snapshots

Each new automatic check reads the saved course and branch settings and pins
the commit and assignment folders for each repository and applicable branch.
The worker uses those commit IDs for the rest of that run, even if a branch
moves between cron ticks. Start a new check to pick up later commits. The
worker rechecks the current course, branch settings, and grading profile
before admitting a grade. An incomplete repository listing starts no grades.
If a complete listing contains unresolved branch or tree reads, the run marks
the course partial and keeps ready targets eligible under the existing grading
checks. The worker stores no shared snapshot for that partial scan.

The worker stores complete README evidence once per assignment and unchanged
preparation settings in that run. Evidence includes every repository pin and
each README selection or proven fallback. Later targets reauthorize their
exact commit before using stored evidence and still verify pinned source files
and applicable instructions before evaluation. They use the other repositories' evidence captured for this run;
they do not reauthorize or reread each peer repository before every grade.
Temporary snapshots and evidence are removed when the run finishes or stops.

The reduction applies to repeated work across cron ticks: organization listing
and branch resolution happen once per successfully scanned course per run;
README evidence is collected once per successfully prepared assignment and
settings. This does not set a fixed request ceiling for a fresh repository.
Initial discovery, first README reads, live target authorization, source reads,
additional branches, and bounded oversized-archive fallbacks still spend
GitHub requests. A discovery that hits a rate limit before it is complete may
restart after the configured cooldown. A complete pinned scan does not repeat
after that cooldown.
