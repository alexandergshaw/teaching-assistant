# Pair a code repo with a course's modules, and select its folders and files

Instructor request: "make it so that in the lms/modules view, I also have the
option of choosing an accompanying repo via dropdown typeahead. doing so should
map up the assignment folders inside of repos to accompanying modules as good as
it possibly can. this should then allow me to select these repo folders/files
inside those folders as part of the bulk action checkboxes."

## What the real data says, and what it rules out

Measured against the two archives the instructor supplied - a Blackboard course
archive (`ArchiveExFile_80649`, WNCC's Blackboard tenant) and the repo
(`python-java-c-main`) - not against an imagined shape.

**The repo side is uniform and carries no topic in its paths.** The whole tree is
`assignments/module_01/` through `assignments/module_16/`, matching
`^assignments/module_(\d{2})/$`. There is no `week01-`, no `Assignment 3 - `, no
nested topic folders. Every human-readable name lives inside `README.md`, whose
H1 is `# Module 8 - Object Modeling Assignment` (unpadded number, en dash U+2013,
so it does NOT lexically match the zero-padded folder). `assignments/README.md`
additionally carries a `| Module | Topic | Assignment |` table covering all 16.

**The course side has 17 modules**: `Start Here`, then
`Module 01: Course Setup and Environment` through `Module 16: Final Assessment`.

**Titles between the two sources actively disagree.** Blackboard's Module 08 is
`Midterm Assessment`; repo `module_08` is `Object Modeling Assignment`.
Blackboard's Module 11 is `Object-Oriented Programming II`; repo `module_11` is
`Data Logging Application`. **Title similarity would confidently produce wrong
pairings here.** The two-digit module number is the only trustworthy join, which
is exactly the asymmetry `selectModuleForWeek`
(`src/lib/announcement-module-content.ts:58`) already encodes: when any module
carries a number, match on the number and NEVER fall back to a positional or
name-similarity guess.

**The repo contains no code.** 36 leaf files: 18 `README.md` and 18 zero-byte
`.gitkeep`. It is a scaffold repo; students add code on their own branches. The
feature must therefore be useful when a mapped folder contains only a README, and
must not treat "folder has no source files" as an error. It also means the
value of selecting a repo file is its TEXT (a Markdown assignment spec), which is
exactly what the generation path already consumes.

## Acceptance criteria

**AC1. A repo typeahead in the Modules view, persisted per course.**
`ModulesView`'s header gains a repo picker built on `ui/Typeahead.tsx` (the
constrained-list component, not a freeSolo Autocomplete), with options from
`listGithubReposAction` and `githubConfiguredAction` guarding the unconfigured
case the way `GithubRepoPicker.tsx` already does. The selection persists across
reloads under a `ta-` key suffixed per course, following
`useLmsSyllabusButtons.ts:46`'s per-course key precedent. It follows
`CoursePicker.tsx:238`'s synthetic-option pattern so a persisted repo ref renders
its own name before the repo list resolves rather than blanking.

**AC2. Folders come from the tree API, and the tree is nested.**
Folder discovery uses `getRepoTreeAction` -> `getRepoTree`
(`src/lib/github.files.ts:17`), which already returns `type: "tree"` entries.
`assignmentFoldersFromTree` (`src/lib/repo-assignment-folders.ts:38`) is reused
for the top-level case, but this feature needs a genuinely NESTED folder
view-model, which nothing in the repo builds today - every existing consumer
flattens to top-level names and discards `RepoTreeEntry.type`. The real repo's
assignment folders sit at depth two (`assignments/module_01/`), so a top-level-only
walk would find only `assignments`.

**AC3. Mapping is number-first, and never silently guesses on a title.**
A new pure module maps repo folders to modules:
1. `extractModuleNumber` (`src/lib/workflows/module-value.ts:68`) on both sides;
   equal numbers pair. Its pattern already handles `module_07`, `Module 07:`,
   `Week 7` and full-number matching so 17 never matches 7.
2. Only when a folder yields no number does token overlap
   (`bestModuleIdFor`, `content-tab/utils.ts:344`) apply, as a SUGGESTION.
3. A title match never overrides a number match, and never upgrades a suggestion
   to a confirmed pairing. This is the rule the measured title disagreements
   above make load-bearing rather than theoretical.
Results carry the four-state confidence vocabulary already established by
`repo-student-bindings.ts:44` - confirmed / suggested / ambiguous / unbound -
and ambiguity is SURFACED, never resolved silently. Unmapped folders and
unmapped modules are both visible; neither is dropped.

**AC4. The instructor can override any pairing, and overrides win.**
Per `repoGradesAssignmentMapping.ts`'s standing rule (a wrong inference there
posts a real grade, so mapping is explicit choice), an auto-suggestion is
acceptable here because selection is non-destructive - but an explicit override
must be storable, must beat the inferred pairing, and must be filtered against
current reality on restore the way `filterRepoGradeAssignmentMapping` (`:98`) and
`loadSelectedRepoIds` (`repoGradesUiState.ts:120`) already filter theirs. A
stored pairing for a folder or module that no longer exists is dropped, not
resurrected.

**AC5. Repo folders and files are selectable in the existing checkboxes.**
The selection key scheme gains a THIRD source variant alongside `live:` and
`export:`. That means widening `ItemSource`/`ModuleSource`
(`content-tab/utils.ts:60`, `:119`), adding producers and a prefix helper, and
widening the literal whitelists in `parseItemKey` (`:98`) and `parseModuleKey`
(`:153`) - both currently return null for anything that is not exactly `"live"`
or `"export"`. The trailing-separator rule in the prefix helpers is preserved
(it is what stops module 1 matching module 12).

**AC6. Every consumer of the discriminator gets an explicit arm.**
Enumerated during the survey, and none may be left to fall through:
`pruneSelectionForModules` (`useModuleSelection.ts:171-230`) - including its
deliberate "an export key with no export tree supplied is LEFT IN PLACE" rule,
which a repo key needs identically or it will be swept every render; the
render-phase pruning block (`:279`); the `setLiveModuleIds` shim's
key-preservation filter (`:424`), which as written DROPS any non-live,
non-export key; `SelectedMaterialItem` (`lms-generation/materials.ts:90`) and its
`gatherLiveItem`/`gatherExportItem` fork (`:246`); `expandModuleSelection`'s
hand-copied key templates (`:267-275`, a second independent copy of the scheme);
and `api/lms-export/selection/route.ts:385`, `:467`.

**AC7. No Canvas write becomes reachable for a repo row.**
`selectedItems()` (`useModuleSelection.ts:296`) is live-only by construction, so
`BulkItemsSection`'s entire surface - publish, due dates, points, rubrics,
submission type, move, remove, delete - is already structurally blind to a repo
key. That default is preserved deliberately rather than widened. Every such
control keeps reporting `gateOperation`'s wording; this feature adds no second
gating vocabulary.

**AC8. The actions that CAN act on a repo row, and only those.**
- The `.zip` download (`useSelectionDownload.ts`) is the one bulk action that is
  genuinely repo-capable: it packages arbitrary selected content and is
  explicitly a read, never a write. Enabling it requires widening
  `SelectionArchiveRequestBody` (`:78-90`) and
  `selectionDownloadUnavailableReason` (`:165`), which today know only
  `courseUrl`/`courseId` and `"live" | "export"`.
- `.imscc` stays refused for repo-sourced selections, for the same reason it is
  already refused for export-sourced ones.
- Generation (`GenerateFromSelectionSection`) reads item TEXT through
  `gatherSelectionMaterials`; a repo file's text is valid material and
  `getFileTextAction` already exists. A repo arm alongside
  `gatherLiveItem`/`gatherExportItem` is in scope. The POSTING half
  (`kindOffersPost`, `kindNeedsModuleTarget`) stays Canvas-only.

**AC9. Rendering is a merge, decided explicitly.**
`ModulesView.tsx:135` currently picks EITHER `canvasModulesToDisplay` OR
`cartridgeModulesToDisplay` - `displayModules` is never a merge. Showing repo
folders alongside modules needs either a third converter feeding a merged array
or a separate render region, plus checkbox arms in `ModuleCard`/`ModuleItemRow`.
Whichever is chosen is stated in the implementation with its reason; it is not
arrived at by accident.

**AC10. Everything degrades honestly.**
No GitHub token configured, a repo with no matching folders, a folder containing
only a README, a tree fetch that fails or is rate-limited (the classification in
`repo-grade-tree-scan.ts:79` already exists) - each states its own case in
visible text. A repo that maps to nothing renders as "no pairing found", never as
an empty successful state.

## Out of scope

- Reading student branches or per-student repos. `studentRepos` is a separate
  binding surface with its own precedent.
- Grading, or anything that writes a score. `repoGradesAssignmentMapping.ts`'s
  explicit-choice rule exists because that path posts real grades; this one does
  not touch it.
- Improving Blackboard item bodies. Tracked separately - see the note below.

## Related defect, tracked separately

Parsing the instructor's Blackboard archive yields correct modules and titles but
useless item BODIES: Blackboard stores content in XML attributes while
`resolveCartridgeItemBodies` (`cartridge-import-shared.ts:268`) strips tags and
takes element text, and the 18 QTI assessment resources holding the real
assignment prose are not referenced by any `identifierref` in the manifest, so
the parser's traversal never reaches them. Measured: of 229 `.dat` resources, 96
strip to nothing and most of the rest yield noise (`"true"`, `/xid-19021764_1`,
LTI query strings). This matters here because AC8's generation arm would feed
that noise into prompts. It is a separate chunk: attribute extraction plus the
`x-bb-asmt-test-link` to assessment-resource hop.
