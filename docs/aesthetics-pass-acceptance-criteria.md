# Aesthetics pass across every page - acceptance criteria

Requested 2026-09-01: "do an aesthetics pass on all disjoint pages. mimic
professional apps' aesthetics." Run through the dev loop with concurrent
subagents on disjoint file sets.

This is a **presentation-only** group. No behaviour, no props, no data flow, no
copy rewrites beyond label capitalization fixes. Every change must be
justifiable as "the same screen, rendered the way a professional product
renders it".

---

## 0. What "professional" means here, concretely

The reference bar is the class of product this app competes with for an
instructor's attention: Linear, Notion, Vercel, Stripe's dashboard, GitHub's
newer surfaces. What those share is not a look - it is **restraint plus
consistency**:

- **A small, closed set of type sizes.** Measured at HEAD this repo uses **30+
  distinct `font-size` values** across its stylesheets (0.66rem, 0.68rem,
  0.7rem, 0.72rem, 0.73rem, 0.74rem, 0.75rem, 0.76rem, 0.78rem, 0.8rem,
  0.82rem, 0.84rem, 0.85rem, 0.86rem, 0.875rem, 0.88rem, 0.9rem, 0.92rem,
  0.93rem, 0.95rem, 0.96rem, 1rem, 1.05rem, 1.1rem, 1.15rem, 1.25rem, 1.35rem,
  1.5rem, plus raw `11px`/`12px`). A professional app ships six to eight. Sizes
  that differ by 0.02rem are not a hierarchy; they are noise that reads as
  sloppiness even to a user who cannot name why.
- **A closed radius set.** At HEAD: 2, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18,
  20, 24px, `50%`, `999px` - and only 24 of ~250 declarations use the
  `--radius-*` tokens that already exist.
- **A spacing rhythm.** Everything on a 4px grid, with section-level generosity
  and control-level tightness. Not 6/10/14/18/28/36 chosen per component.
- **Hairline borders and restrained elevation.** One border weight. Shadows
  reserved for things that genuinely float (menus, dialogs, popovers), not
  applied to inline cards.
- **Muted secondary text, one accent.** Colour carries meaning (accent =
  interactive, danger = destructive, success/warning = state) and nothing else.
- **Flat surfaces.** Decorative gradients on page and card backgrounds are the
  clearest "2016 web app" tell.

---

## 1. The token contract (the wire contract for this group)

These tokens are added to `src/app/globals.css` by the orchestrator **before**
any agent is dispatched. Agents consume them; no agent edits `globals.css`.

### Type scale - `--font-size-*`

| Token | Value | Use |
| --- | --- | --- |
| `--font-size-2xs` | 0.6875rem (11px) | tracked uppercase micro-labels only |
| `--font-size-xs` | 0.75rem (12px) | badges, chips, table meta, helper text |
| `--font-size-sm` | 0.8125rem (13px) | dense table cells, secondary rows |
| `--font-size-md` | 0.875rem (14px) | **default UI text**: controls, body copy in panels |
| `--font-size-lg` | 1rem (16px) | prose paragraphs, panel lead-ins |
| `--font-size-xl` | 1.125rem (18px) | panel / card titles |
| `--font-size-2xl` | 1.375rem (22px) | section titles, modal titles |
| `--font-size-3xl` | 1.75rem (28px) | page `h1` |

Nothing outside this set. `1em`-relative sizing is allowed only where a value
must track its parent (e.g. an inline `<code>` inside body copy).

### Line height / weight

`--line-tight: 1.25` (headings), `--line-snug: 1.4` (dense UI),
`--line-normal: 1.55` (prose). Weights: 400, 500, 600, 700 only - and 700 only
for `h1`/`h2` and the tracked-uppercase label idiom.

### Spacing - `--space-*`

`--space-1: 4px` `--space-2: 8px` `--space-3: 12px` `--space-4: 16px`
`--space-5: 20px` `--space-6: 24px` `--space-8: 32px` `--space-10: 40px`
`--space-12: 48px`.

Every `padding`, `margin` and `gap` resolves to one of these (or to a token).
No 6px, 7px, 9px, 10px, 14px, 18px, 26px, 28px, 36px.

### Radius - `--radius-*`

`--radius-xs: 6px` (chips, small inputs) `--radius-sm: 8px` (buttons, inputs)
`--radius-md: 12px` (inline cards, menus) `--radius-lg: 16px` (panels)
`--radius-xl: 20px` (the app shell) `--radius-pill: 999px`
`--radius-round: 50%`.

`--radius-xl` changes from 24px to 20px; that is deliberate (the shell reads
less "bubble"), and it is the ONLY existing token whose value changes.

### Elevation - `--shadow-*`

`--shadow-xs` (hairline lift, hover on an interactive row), `--shadow-sm`
(resting card that must separate from a busy background), `--shadow-md`
(menus, popovers, dropdowns), `--shadow-lg` (modals, dialogs, floating
windows). Nothing else, and **no `box-shadow` literal** in an owned file.

### Controls

`--control-height-sm: 28px` `--control-height-md: 34px`
`--control-height-lg: 40px`. Every button, input, select and combobox in a
given cluster shares one height.

### Motion

`--transition-fast: 120ms ease` (hover/active), `--transition-base: 180ms ease`
(disclosure, panel state). Existing `prefers-reduced-motion` handling in
`globals.css` already neutralizes both; do not add a second mechanism.

### Surfaces (values changed in `globals.css` by the orchestrator)

- `--page-background` becomes a **flat** neutral (`#f5f6f8` light,
  `#0b1120` dark) - the decorative vertical gradient is removed.
- `--card-background` becomes fully opaque (`#ffffff` / `#111a2e`); the
  0.92-alpha translucency let page texture bleed through card text.

### Foreground on a filled surface

`--text-on-accent: #ffffff`, added mid-wave 2026-09-01 after GROUP C reported
that a filled accent button's foreground had **no legal spelling** under AC5 -
the AC banned raw hex, and no token existed, so the agent fell back to the
`white` keyword. Defined in `:root` only, with no dark-theme override on
purpose: `--accent` and `--danger` are dark in both themes, so a theme-flipped
value would put dark text on a dark button.

Use it for text and icons on a filled accent or danger surface. It is NOT for
the navy chrome, which keeps its own foreground.

No agent redefines any of these; agents reference them.

---

## 2. Acceptance criteria

**AC1 - Type scale.** No `font-size` literal remains in an owned file (CSS or
JSX inline style). Every one resolves to a `--font-size-*` token. Map each
existing value to its NEAREST token; where two adjacent values were doing real
hierarchical work (e.g. 0.85rem title over 0.8rem body), keep them one token
apart rather than collapsing both to the same token.

**AC2 - Radius.** No `border-radius` literal remains, except `50%` where the
existing `--radius-round` token is not usable in a shorthand. Map to the
nearest token; a control keeps a control radius, a card keeps a card radius.

**AC3 - Spacing.** Every `padding` / `margin` / `gap` in an owned file is a
`--space-*` token or a 4px multiple expressed as a token. Snap odd values to
the nearest step, preferring the SMALLER step inside controls and the LARGER
step between sections.

**AC4 - Elevation.** No `box-shadow` literal. Resting inline cards lose their
shadow and gain `border: 1px solid var(--border-soft)` if they do not already
have a border. Shadows survive only on things that float above the page.

**AC5 - Colour.** No raw hex or `rgba()` in an owned file. Every colour is a
token or a `color-mix()` over tokens. Status colour is used only for status.

**AC6 - Borders.** One weight: `1px solid var(--border-soft)` for structural
separation, `1px solid var(--field-border)` for input affordances,
`1px solid var(--card-border)` for cards. No 2px structural borders (2px is
reserved for the focus ring and for selected-state inset rings).

**AC7 - Page and panel headers.** Every page and every top-level panel presents
the same header shape: title (`--font-size-2xl` for a page, `--font-size-xl`
for a panel), an optional one-line description in `--text-secondary`, and the
primary actions right-aligned on the same row. Where a surface currently
renders a bare `<p className={styles.sectionTitle}>`, it keeps the class but
the class must render as the tracked-uppercase micro-label idiom already used
by `.panelTitle` in `page.module.css`.

**AC8 - Empty, loading and error states.** Every list, table and panel has all
three, and they look the same everywhere: centred muted text at
`--font-size-md`, one sentence saying what would be here, plus the primary
action that would create the first item where one exists. A bare
`"Loading..."` paragraph is not acceptable; use the app's existing spinner
idiom (`.spinner` + `.loadingTitle` + `.loadingText` in `page.module.css`) or a
muted single line, consistently within the surface.

**AC9 - Button vocabulary.** Within one surface: exactly one primary
(filled accent), secondary (bordered, transparent fill), ghost (no border,
appears on hover) and danger treatment. Same height within a cluster, weight
500 or 600, sentence case labels, icon-only buttons carry an `aria-label` AND a
`title`. Do not introduce a second vocabulary; reuse the classes the surface
already imports.

**AC10 - Tables and dense lists.** Hairline row dividers (`--border-soft`), one
row height per table, header row in the `--font-size-xs` tracked-uppercase
idiom, numeric and action columns right-aligned, hover state via
`--surface-muted` or `--accent-soft` (never a colour invented locally), sticky
headers keep an opaque background.

**AC11 - Density.** Reduce chrome that does not carry information: nested cards
inside cards collapse to one border; a panel inside a panel loses the inner
border; padding above 24px inside a component drops to `--space-6`. The goal is
more content per screen without crowding.

**AC12 - Dark mode parity.** Every changed colour resolves through a token, so
the dark theme follows automatically. No agent adds a
`html[data-theme="dark"]` block - if a value needs a dark variant, that is a
token gap: report it, do not patch it locally.

**AC13 - Accessibility is not traded for looks.** Body text stays at or above
4.5:1 and large text 3:1 against its own background. Do not touch the focus
ring tokens or the `:focus-visible` rule; do not remove an outline; do not
lower a muted text colour to a lighter grey to "calm it down". Do not replace a
text label with an icon alone.

**AC14 - No behaviour change.** No changed props, handlers, state, effects,
conditions, network calls or copy semantics. No renamed, deleted or newly
undefined CSS-module class - `page-module-css-classes.test.ts` reads classes
out of the stylesheet and matches them against every `styles.x` reference, and
`focusRing.wiring.test.ts` text-scans `globals.css`, `page.module.css`,
`TopBar.module.css`, `login.module.css`, `security.module.css` and
`TasksGrid.module.css`. Adding a class is allowed; removing one is not.

**AC15 - Ownership.** `src/app/globals.css` and `src/app/page.module.css` have
exactly one owner each (the orchestrator and the shared-stylesheet agent
respectively). Every other agent references them and edits neither. An agent
that needs a change in either REPORTS it and works around it.

**AC16 - Repo invariants hold.** No emojis (`src/lib/no-emojis.test.ts` owns
that rule). No new dependency. No new `localStorage` key (this group adds no
control). `"use server"` files are not touched at all.

---

## 3. Gates every agent runs before reporting

```
npx tsc --noEmit
npx eslint <its own touched files>
npx vitest run
```

Zero errors AND zero warnings. `npx next build` is run once by the orchestrator
per wave (compile line only - the prerender tail fails locally without Supabase
keys, and that is expected).

---

## 4. The disjoint split

Every agent gets an explicit allow-list. The two shared stylesheets are owned,
not shared. Directories below are exclusive to their group.

| Group | Surface | Files |
| --- | --- | --- |
| S | Shared stylesheet | `src/app/page.module.css` only |
| A | Auth + Account routes | `src/app/login/**`, `src/app/account/**` |
| B | App chrome | `TopBar.tsx`, `TopBar.module.css`, `InSessionBanner.tsx`, `InSessionBanner.module.css`, `manual/ManualRail.tsx`, `TabShell.tsx`, `TabHeader.tsx`, `InstitutionSwitcher.tsx`, `home/**`, `src/app/page.tsx` (the MUI `sx` block only) |
| C | Knowledge | `src/app/knowledge/**`, `components/knowledge/**`, `KnowledgeTab.tsx`, `KnowledgeTab.module.css` |
| D | Courses | `components/courses/**`, `CoursesTab.tsx`, `CoursePicker.tsx` |
| E | Tasks | `components/tasks/**`, `TasksTab.tsx` |
| F | Workflows + automation | `components/workflows/**`, `WorkflowsTab.tsx`, `WorkflowBuilder.tsx`, `WorkflowScopeControl.tsx`, `AutomationsTabView.tsx` |
| G | Files | `components/files/**`, `FilesTab.tsx` |
| H | Content (LMS) | `components/content-tab/**`, `ContentTab.tsx` |
| I | Recording + studios | `components/recording/**`, `RecordingTab.tsx`, `components/slide-studio/**`, `components/caption-studio/**`, `components/live-class/**` |
| J | Grading | `GradingTab.tsx`, `GradingResults.tsx`, `components/grading-results/**`, `components/grading-recording/**`, `components/github-grading/**`, `GithubGradingPanel.tsx`, `LiveFeedPanel.tsx`, `components/drafted-grades/**`, `DraftedGradesTab.tsx`, `DraftedGradesTab.module.css`, `MessageDraftsTab.tsx` |
| K | Repo grades | `components/repo-grades/**` |
| L | Version control | `VersionControlTab.tsx`, `components/repo-detail/**`, `components/bulk-repo/**`, `CopyRepoPanel.tsx`, `OrgManagementPanel.tsx`, `GithubSyncPanel.tsx`, `RepoSettingsPanel.tsx`, `RepoDetail.tsx`, `GithubRepoPicker.tsx`, `CopilotChatPanel.tsx` |
| M | Planning | `components/course-planning/**`, `components/lesson-plan/**`, `LessonPlanningForm.tsx`, `LessonPlanPreview.tsx`, `LecturePlanningTab.tsx`, `LecturePlanningRubricSection.tsx`, `LecturePlanCardList.tsx`, `LecturePlanPreviewModal.tsx`, `CoursePlanningTab.tsx` |
| N | Design studios | `components/ppt-design/**`, `components/artifact-design/**`, `PowerPointDesignTab.tsx`, `ArtifactDesignTab.tsx`, `SlideGraphicPreview.tsx`, `SlideGraphicPreview.module.css`, `DocStructureEditor.tsx` |
| O | Canvas + shared modals + overlays | `components/canvas-tab/**`, `CanvasTab.tsx`, `components/ui/**`, `ContextMenu.tsx`, `FilePreviewModal.tsx`, `CsvPreviewModal.tsx`, `DocumentPreviewModal.tsx`, `RubricPreviewModal.tsx`, `SyllabusPreviewModal.tsx`, `SyllabusTemplateLibrary.tsx`, `FinalizedSyllabusLibrary.tsx`, `AiChatFab.tsx`, `AiChatWindow.tsx`, `SelectionChatWidget.tsx`, `AccessibilityCenter.tsx`, `CartridgeDropPanel.tsx` |

| Q | Editors, calendar, leftovers | `RichTextEditor.tsx`, `RichTextSectionEditor.tsx`, `MonacoFileEditor.tsx`, `PdfFixEditor.tsx`, `OfficeAltEditor.tsx`, `RemediationEditor.tsx`, `ProblemsPanel.tsx`, `PublishToCanvasPage.tsx`, `WeekCalendar.tsx`, `ProviderToggle.tsx`, `MailInbox.tsx` |

**Group Q was added mid-wave and this table originally declared its files out
of scope.** The adversarial spec check named that omission as one of the top
five things a rival vendor would point at: those components render INSIDE
panels every other group was restyling, so leaving them at the old radii and
type puts a visible seam in a single screenshot. GROUP O then hit the stale
paragraph and correctly reported that nobody owned files it could see were
un-tokenized. Both were right; the group exists because of them.

Files still in no group - the watchers, providers and count hooks
(`WorkflowScheduleWatcher`, `WorkflowTriggerWatcher`, `VcCounts`,
`InstitutionCounts`, `FilesInbox`, `DraftedGradesInbox`,
`AccessibilityProvider`, `AppThemeProvider`) - render no chrome of their own
and are genuinely out of scope.

---

## 4b. Mid-wave amendments (2026-09-01, from the adversarial spec check)

A fresh senior-design agent read this document against the real stylesheets
while wave one was running. Its findings are folded in below. **Every one of
these overrides the section above it.**

**AM1 - White on navy has a token now; it never had a legal spelling.**
`page.module.css` carries 121 raw `#fff` / `rgba(255,255,255,a)` foregrounds
and `TopBar.module.css` 10 more, nearly all of them text on the NAVY chrome
(`.lfDetail`, `.lfRailHeader`, `.lfRailHint`, `.ccType`, `.bulkBarHead`, the
top bar). AC5 banned raw hex; no token resolved to white in both themes
(`--card-background`, `--field-background` and `--background` all flip dark),
so "tokenising" `color: #fff` on `.lfDetail` would have painted `#121b2e` on
`#1a2744` - **1.1:1, invisible, and green in a suite that renders nothing.**
Use `var(--on-navy)` and `var(--on-navy-muted)` (added to `globals.css`,
`:root` only, theme-invariant for the same reason `--focus-ring-on-navy` is).

**AM2 - AC4 exempts rings, markers and hairline edges.** A `box-shadow` that
is `inset`, or has zero blur, is not elevation and is out of scope. Only
blurred drop shadows tokenise. This protects, among others,
`TasksGrid.module.css:786` - an `inset 0 0 0 2px var(--accent-ink)` that IS the
focus indicator on a rule that also sets `outline: none`, so removing it would
leave the cell with no focus indicator at all -
`CoursesTable.module.css:197` (an arrival marker whose own comment says a
border would shift every column) and `page.module.css:3153` (a frozen-column
edge that is a border in a shadow's clothing).

**AM3 - A floating light element needs a border now that the page is flat.**
`--shadow-md` over the old gradient had ~1.09:1 of separation at the page's
bottom stop; on flat `#f5f6f8` a white surface has ~1.02:1. Any light-surfaced
menu, popover or dropdown takes `--shadow-md` **plus**
`1px solid var(--card-border)`.

**AM4 - AC3 governs `padding`, `margin` and `gap` only.** It does NOT govern
`width`, `height`, `min/max-width`, `top/right/bottom/left`, or control
heights. And: **a value already equal to a step is replaced by that step's
token and nothing else** - the smaller/larger preference applies only to values
that are not already on the grid. A `12px` margin becomes `var(--space-3)`,
never `var(--space-4)`. **Ties round DOWN** (`10px` -> `--space-2`, not
`--space-3`; `14px` -> `--space-3`; `1.25rem` -> `--font-size-xl`).

**AM5 - The micro-label idiom is pinned exactly.** Tracked-uppercase labels -
panel titles, table headers, section labels, everywhere - are
`var(--font-size-2xs)` / weight 700 / `letter-spacing: 0.06em` /
`var(--text-secondary)`. AC1's nearest-token rule does not apply to them, and
AC10's `--font-size-xs` for table headers is superseded by this. Wave one
already produced this idiom at 11px and 12px, at 0.04em and 0.07em, in four
surfaces reachable in four clicks; that is the divergence this pins shut.

**AM6 - Sizes below 0.68rem in fixed-width chips are a density device, not
drift.** `page.module.css:5656` `.ccType` is a fixed 96px chip at 0.62rem that
ellipsises, and its `max-width: 760px` media query shrinks it to 74px at
0.56rem. Raising both to the 11px floor grows the text ~11-23% inside a fixed
width AND makes the media query an exact duplicate of the desktop rule,
deleting the responsive shrink. Leave sub-0.68rem values in fixed-width chips
and columns; report them, do not raise them.

**AM7 - AC11 does not apply where the inner border is structural.** Leave it
where it bounds a scroll region (`overflow: auto/scroll`), a `position: sticky`
element, or an absolutely-positioned hover-revealed control.
`CoursesTable.module.css:425` (`.rosterTableWrap`, a nested scroll region),
`:78` (`.scroller`, what the sticky `th` sticks against) and `:297`
(`.cellMenu`, an absolutely-positioned reveal that paints `--card-background`
so it is legible over cell text) are the named cases.

**AM8 - Eight test files read source as text, not two.** AC14 named
`focusRing.wiring.test.ts` and `page-module-css-classes.test.ts`. Add:
`bulkBarCss.test.ts` (pins 17 `.bulk*` classes as present),
`taskNoteIndicator.wiring.test.ts` (freezes `.statusButton:hover`'s exact
`color-mix`, `--ttg-row-h` at 36/32/44px, `.statusCell { padding: 0 }`, and
that `.noteMarker` is targeted by exactly one selector),
`repoGradesSliceA.guards.test.ts`, `bulkBar.wiring.test.ts`,
`generatedPreviewModal.wiring.test.ts`,
`GenerateFromSelectionSection.checkpoints.test.ts`, and
`ui/modalAdoption.wiring.test.ts` (exact repo-wide count canaries:
`DIALOG_SITES.length === 50`, `ADOPTING_PATHS.size === 35` - adding a
`role="dialog"` or a `ModalShell` import anywhere reddens the suite for every
sibling). **No agent edits a test file. A value a test freezes is out of scope
and gets reported.**

**AM9 - The focus-ring leak is reopened by ADDING, not by touching.** AC13
forbade touching the focus tokens; the actual bug `globals.css` says not to
reintroduce is a LIGHT-background element nested inside navy chrome inheriting
`--focus-ring-on-navy` (#bfdbfe measures 1.42:1 on white). So: any new
light-background element inside `.bar`, `.lfRail`, `.lfDetail`, `.bulkBarHead`
or `.ccItem` MUST declare `--focus-ring-color: var(--focus-ring-default)`, and
any new navy container MUST declare `--focus-ring-color:
var(--focus-ring-on-navy)`. Report both so the test's container list can grow.

**AM10 - There is a global spinner, and it is a TOKEN, not a bare keyframe
name.** AC8 pointed at `page.module.css`'s `.spinner`, whose `@keyframes spin`
is CSS-Modules-scoped and therefore unreachable from any other stylesheet -
which is why 38 bare `"Loading..."` strings exist.

**AM10's first version was wrong and shipped two dead spinners.** It said to
write `animation: ta-spin 0.8s linear infinite` in a module stylesheet. Lightning
CSS - which Turbopack uses for every `*.module.css` - scopes animation-NAME
REFERENCES, not just `@keyframes` definitions, so that compiled to
`animation: .8s linear infinite <hash>__ta-spin` and matched no keyframes at
all. The rings rendered motionless. This was caught by reading the emitted
production CSS, not by any gate: it type-checks, it lints, it passes every
test, and it looks correct in the source. `:global()` is not an escape either -
Turbopack's own docs record that standalone `:local`/`:global` pseudo-classes
are unsupported, and both spellings were probed and rejected by the compiler.

The working form: `globals.css` defines the whole shorthand as a token,
`--ta-spin-animation: ta-spin 0.8s linear infinite`, and a module stylesheet
writes `animation: var(--ta-spin-animation)`. Idents inside `var()` are not
rewritten, and custom properties are never scoped.

**The general trap:** any IDENT shared across stylesheets is scoped inside a
module - animation names, and `grid-area` names too. Custom properties are
not. When something must be shared, share it as a token.

**AM11 - The silences, closed.** Each of these was going to be answered
differently by every agent:

| Question | The answer |
| --- | --- |
| Icon box size | 16px in dense rows, 20px in toolbars and buttons, 24px in headers. Nothing else. |
| Icon stroke weight | 1.5 |
| Icon-to-label gap | `var(--space-2)` |
| Disabled | `opacity: 0.5` plus `cursor: not-allowed`; never a colour swap, never a second opacity value |
| Row-action hover reveal | Copy `CoursesTable.module.css:297-382` WHOLE: opacity AND `pointer-events` AND `:focus-within` AND the `@media (hover: none)` always-visible branch. Copying only the opacity half is a bug that file's comments record as already fixed once. |
| selected vs active vs focused | selected = `--accent-soft` fill + a 2px inset accent ring; active/current = filled `--surface-muted` + accent left rail; focused = the global focus ring, untouched. Three states, three treatments, never shared. |
| Truncation | Single-line cells ellipsise with a `title`; multi-line prose wraps. A row never grows to fit. |
| Counts and badges | `--radius-pill`, `--font-size-xs`, weight 500, token surface + matching ink. |
| Loading | Spinner via `ta-spin` for anything over ~400ms; a muted single line otherwise. Never a bare `Loading...`. |
| Notices | Inline, at the top of the panel they concern, full width, `--radius-md`, token status surface. Never floating. |
| Zebra striping | Keep it where it exists, do not add it where it does not. |
| Form section dividers | `1px solid var(--border-soft)` |

**AM12 - AC17, the line ceiling.** `DEV_LOOP.md` makes exceeding 1000 lines a
verification failure, and this pass is additive to JSX (AC8's three states,
AC9's `aria-label` plus `title`). A file at or above 950 lines is CAPPED: the
agent reports rather than adds. At the time of writing:
`TasksGrid.module.css` 995, `ContentTab.tsx` 988, `CourseItemsView.tsx` 958,
`TasksTab.tsx` 946, `TasksGrid.tsx` 935, `DiscussionRepliesPanel.tsx` 932,
`CopyRepoPanel.tsx` 929, `GeneratedPreviewModal.tsx` 913,
`repo-grades/index.tsx` 912, `WorkflowsTab.tsx` 909. `page.module.css` is 6708
and is exempt as a pre-existing stylesheet nobody is splitting this group.

**AM13 - AC7 cited a class that is not where it said.** There is no
`.sectionTitle` in `page.module.css`; it lives in
`account/security/security.module.css:49` and is imported by all four account
pages. AC7's reference is corrected to that path. (This is the exact failure
`DEV_LOOP.md` records: an AC naming something that existed nowhere.)

**AM14 - `1em`-relative sizes are not automatically converted.** Converting
`fontSize: "0.9em"` inside a 13px panel to `var(--font-size-md)` makes the
child LARGER than its parent. Convert an `em` value only when the element is
not nested inside a smaller-than-default context; otherwise leave it and
report.

**AM16 - The page-title contradiction, resolved.** The type table assigns
`--font-size-3xl` to "page h1"; AC7 says a page title is `--font-size-2xl`.
GROUP A hit the contradiction and had to guess. The resolution: **an in-app
page or tab title is `--font-size-2xl`**, and `--font-size-3xl` is reserved for
the auth/login hero and for a full-screen empty state. A 28px heading on a
dense working screen is a marketing size; every product in the reference set
uses ~22px there.

**AM17 - The brand mark is exempt from the icon system.** AM11 pins icon boxes
to 16/20/24 and stroke to 1.5. `LogoMark` (34px box, 19px glyph, 1.8 stroke) is
the product's identity, not a UI icon, and is exempt - the same way a
logotype is exempt from a product's own icon library. GROUP B raised this
rather than guessing; it was right to.

**AM18 - AM5's colour rule, refined by what it broke.** GROUP S applied AM5's
`--text-secondary` uniformly and reported that it flattened five accent-
coloured kickers, and that on navy chrome the pinned colour is invisible. Both
reports were right. The rule is now:

- A micro-label that NAMES A GROUP (panel title, section label, column header)
  is `--text-secondary`. That is the common case and AM5 stands for it.
- A page-level KICKER above a title (`.eyebrow` and its siblings
  `.syllabusSectionHeading`, `.lessonSlideNum`, `.assignmentSectionLabel`,
  `.rteSectionLabel`) keeps `var(--accent-ink)`. An accent kicker is a
  deliberate treatment in every product in the reference set, not drift.
- On NAVY chrome the colour is `var(--on-navy-muted)`; `--text-secondary` is
  unreadable there. Same reasoning as AM1.
- A circular count bubble (`.navBadge` and its kind) keeps
  `--font-size-2xs` / weight 700 rather than AM11's `xs`/500 badge default:
  it is a fixed-diameter chip, so AM6's density-device logic applies to it.

**AM19 - A documented prior decision outranks AM5.** Two agents independently
declined to put a wide matrix's table header into the tracked-uppercase idiom,
each citing a recorded owner decision that all-caps destroys word-shape
scanning across a 40-column header (`TasksGrid`'s own comments, and
`docs/repo-grades-ux-overhaul-acceptance-criteria.md` U26b). Both were right
to. Where a file or an AC records a deliberate reason for diverging from a
convention, that reason wins and the agent reports it; AM5's "everywhere"
means "everywhere the choice was never actually made", not "override the
decisions somebody documented". This is a presentation pass, not a licence to
relitigate design decisions with reasons attached to them.

**AM20 - A non-zero gap never rounds to nothing.** AM4's "ties round down" was
read literally enough to turn `margin-top: 2px` into `0` and a badge's `2px`
vertical padding into `0` - which deletes the separation rather than
regularising it. Two agents did this and both flagged it, which is how it was
caught. The floor for any non-zero `padding`, `margin` or `gap` is
`var(--space-1)`. Rounding down applies BETWEEN steps, never THROUGH zero.
A value that was deliberately `0` stays `0`.

**AM21 - AM8's test-file ban has an escape hatch, because as written it would
have shipped a dead scanner.** AM8 said "no agent edits a test file". Three
test files WERE edited this group, and all three edits were correct - most
importantly `repoGradesSliceA.guards.test.ts`, whose `definesCardFrame`
matched the literal `border-radius: 24px`; tokenising that value would have
left the guard matching nothing, green forever, which is precisely
`DEV_LOOP.md`'s "scanner that matched nothing". The rule and the pass were in
direct conflict the moment any CSS was tokenised. The corrected rule: **an
agent may widen a source-text scanner to accept a new spelling, MUST add a
canary for every spelling it now accepts, and MUST NOT weaken or delete an
assertion.** Anything beyond widening still goes back to the orchestrator.

**AM22 - The account pages are a single borderless column, and that is a
decision, not drift.** GROUP A kept `login.module.css`'s contained card and
deleted the equivalent frame from `security.module.css` (shared by all four
account pages), so a user signs in through a bordered card on navy and lands
on a borderless column on flat grey. The reviewer correctly called this the
largest untraceable change in the diff. The call, recorded here so it IS
traceable: **the settings pages stay a single column** - that is the pattern
every product in the reference set uses for settings, and section 0's "flat
surfaces" applies - **and the login page keeps its card**, because an auth
screen is a focused single task, not a settings surface. The `max-width`
changes bundled with it (600px -> 48rem, 400px -> 26rem) are accepted as part
of that decision rather than as token conversions, which is what AM4 would
otherwise forbid.

**AM23 - An icon inside an IconButton inside a dense row is 16px.** AM11 gave
16px for dense rows and 20px for buttons and did not say which wins when a
control is both; two groups split, 16px and 20px, on byte-identical glyph
families. The rule is 16px. The one documented exception is
`recording/discussion-icons.tsx`, which stays at 20px: that cluster contains
the copy control this repo has already shipped once as "working, correct and
effectively invisible", and its size is a deliberate visibility fix. An
exception with a recorded reason is fine; two answers to the same question is
not.

**AM24 - `line-height` is part of AC1, not an optional extra.** The token
contract defines `--line-tight`/`--line-snug`/`--line-normal`; no AC clause
actually required using them. Eleven groups inferred the requirement and
converted; the shared stylesheet did not, so `page.module.css` still carries
81 line-height literals across 11 distinct values - the exact "noise, not
hierarchy" complaint this document opens with, left standing in the file every
other file imports. Map `<= 1.3` to `--line-tight`, `1.35-1.45` to
`--line-snug`, `>= 1.5` to `--line-normal`, and leave `line-height: 1` on
chips and single-line controls.

**AM25 - One styling authority per element.** An element carries EITHER a
CSS-module class OR an MUI `sx` block for a given property - never both. Which
one wins is decided by emotion's injection order, not by specificity, so a
duplicated declaration is a coin-flip that currently lands the same way every
time. Where both exist today, delete the duplicated declarations from one side
and keep only what the other cannot express (a pseudo-class, or a descendant
rule like `.settingsButton svg`, which genuinely outranks any single-class
emotion rule).

**AM26 - The two reviewers disagreed about the top-bar focus ring, and the
disagreement is resolved in favour of leaving it alone.** The chrome group gave
three top-bar controls a light `--field-background` fill inside the navy
`.bar`, which sets `--focus-ring-color: var(--focus-ring-on-navy)`, and did NOT
add the reset AM9 requires - arguing that `outline-offset: 2px` paints the ring
band outside the button, onto the navy. It asked to be checked rather than
trusted.

The general reviewer flagged it as an AM9 violation. The accessibility
specialist adjudicated it in detail: traced the ancestor chain (Button ->
`.actions`, which has no background -> `.bar`), confirmed the offset is
positive and pinned by `focusRing.wiring.test.ts`, confirmed `.bar` declares no
`overflow` and leaves 12px of clearance for a 4px ring, and computed that both
edges of the band sit on `#1a2744` at 10.43:1. It concluded that **adding the
reset would be a regression**, pinning the ring to `#1d4ed8` at 2.21:1 on navy
- and that `page.module.css` already records this same reasoning for
`.ccPublish`.

The specialist's analysis wins: it is the more specific one and it was
traced, not asserted. AM9 stands as written for a nested light element whose
own fill is adjacent to the ring; it does not apply where the offset puts the
whole band on the container. **This is settled by geometry that no test in
this repo can measure**, so it goes in the shipped Limits either way.

**AM15 - Report any new opaque surface colour.** `focusRing.wiring.test.ts`'s
contrast oracle uses a frozen `LIGHT_SURFACES` / `DARK_SURFACES` list that
still contains the two gradient stops this pass deleted. It can only measure
surfaces it knows about, so any agent introducing a new opaque surface reports
it for addition to that list.

---

## 5. Limits stated up front

vitest here is node-env and collects only `src/**/*.test.ts`. **No component is
rendered and no pixel is measured.** Every claim in this group about how a
screen looks is a claim about the source, verified by reading. The gates prove
the code compiles, lints and does not break the CSS-class and focus-ring text
scans; they prove nothing about the rendered result.
