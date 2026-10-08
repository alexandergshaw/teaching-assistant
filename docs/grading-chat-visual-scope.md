# GRADING-CHAT-VISUAL - scope and recon (round 1, UNCHECKED)

Status: authored by the UX + architect scope seat. NOT yet checked by a fresh
`loop-checker`. Recon and plan only: no code, no CSS, no test was changed by
this seat. The only side effect of this seat's measurement run is the
regeneration of `docs/css-orphans.md`, which the orphan test rewrites by design
and which was already modified in the working tree before this seat started
(`git status --short docs/css-orphans.md` read ` M` before and after).

Backlog row: `docs/BACKLOG.md:234` (GRADING-CHAT-VISUAL). Owner request,
2026-10-05, verbatim: "the llm-like grading tool also needs a visual overhaul."
Taken as LOOK-AND-FEEL only; the grading flow works and must not regress.

Tree measured at HEAD `ebf32aea` (`git rev-parse --short HEAD`), working tree
dirty with sibling docs only (no file under `src/` was modified at the time of
the gate run; `git status --short src` empty).

Disposition table: not applicable. This is the first version of this scope and
restructures nothing.

---

## 0. Measured quantities and the command that produced each

| Quantity | Value | Command |
|---|---|---|
| `GradingChatPanel.tsx` lines | 241 | `@(Get-Content src/app/components/grading-chat/GradingChatPanel.tsx).Count` (PowerShell) |
| `ChatComposer.tsx` lines | 174 | same instrument |
| `LatestResultCard.tsx` lines | 35 | same instrument |
| `grading-chat.module.css` lines | 114 | same instrument |
| `GradingChatPanel.structure.test.ts` lines | 424 | same instrument |
| Classes defined in `grading-chat.module.css` | 10 (`stickyComposer compactField setupSummary latestCard latestCardHeader latestCardStudent latestCardScore latestCardField latestCardLabel latestCardText`) | read of the file, `:7,21,59,68,80,86,91,95,101,109` |
| `chatStyles.` reference lines in `src/app/**/*.tsx` | 11 (4 in the panel, 7 in the card) | `Get-ChildItem -Recurse -Include *.tsx -Path src/app \| Select-String -Pattern 'chatStyles\.' \| Measure-Object` |
| Orphan ratchet pin | `PINNED_ORPHAN_CEILING = 118`, asserted with `toBe` | `grep -n "PINNED_ORPHAN_CEILING =" src/app/components/courses/page-module-css-orphan-classes.test.ts` (`:316`); `toBe` at `:436` |
| `docs/css-orphans.md` total | 118 orphan candidates of 1246 defined across 31 stylesheets; no `grading-chat` section | `grep -n "grading-chat\|^Total:" docs/css-orphans.md` (no grading-chat hit; `:19` Total line) |
| `--surface-background` definitions in `src/` | 0 definitions, 1 use (`grading-chat.module.css:15`) | `grep -rn "\-\-surface-background" src` |
| Controls inventory lines (aria-label/label/id/onClick/onKeyDown/slotProps) | 16 lines across the three TSX files | `grep -n -E 'aria-label=\|label="\|id="grading\|onClick=\|onKeyDown\|slotProps' GradingChatPanel.tsx ChatComposer.tsx LatestResultCard.tsx \| wc -l` (Bash, in the grading-chat directory) |

### 0.1 Baseline gate at HEAD (green), per-argument wrapper lines

Command run (PowerShell, repo root), one path per argument:

```
npm run test:paths src/app/components/courses/page-module-css-classes.test.ts src/app/components/courses/page-module-css-orphan-classes.test.ts src/app/components/grading-chat/GradingChatPanel.structure.test.ts src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts src/file-size-ceiling.structure.test.ts src/source-bytes.structure.test.ts src/lib/no-emojis.test.ts src/app/components/tabs/topLevelTabs.wiring.test.ts
```

Wrapper output, quoted:

```
COVERED src/app/components/courses/page-module-css-classes.test.ts files=1 passed=10
COVERED src/app/components/courses/page-module-css-orphan-classes.test.ts files=1 passed=9
COVERED src/app/components/grading-chat/GradingChatPanel.structure.test.ts files=1 passed=40
COVERED src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts files=1 passed=6
COVERED src/file-size-ceiling.structure.test.ts files=1 passed=3
COVERED src/source-bytes.structure.test.ts files=1 passed=3
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/app/components/tabs/topLevelTabs.wiring.test.ts files=1 passed=37
Test Files  8 passed (8)   Tests  126 passed (126)
```

This is the baseline the wave must return to. It proves the structure of the
source and the stylesheets; it proves nothing about how any of it looks
(`docs/loop/this-repo.md` section 2: no component is rendered by any test).

---

## 1. Inventory of the current surface

### 1.1 Mount and ancestors (these decide the padding finding in N1)

- Mount: `src/app/page.tsx:785` `<GradingChatPanel .../>` inside a bare
  `<div style={{ display: ... }}>` (`:777-784`), an always-mounted
  display-toggled sibling. NOT wrapped in `TabShell`. Pinned by
  `topLevelTabs.wiring.test.ts` (green above); this scope does not touch
  `page.tsx`.
- Ancestor: `.tabContainer` (`src/app/page.module.css:14-27`): flex column,
  `background: var(--card-background)`, 1px `--card-border`, `--radius-xl`,
  `--shadow-lg`, `overflow: clip` (the comment at `:24-25` records that clip,
  not hidden, is what keeps `position: sticky` working). It has NO padding.
- The house tab frame is `TabShell` -> `<section className={styles.card}>`
  (`src/app/components/TabShell.tsx`), `.card` = padding `var(--space-6)`, gap
  `var(--space-6)` (`page.module.css:29-36`). The chat panel does not use it.
- Global reset: `* { padding: 0; margin: 0 }` (`globals.css:359-362`).

### 1.2 DOM tree, in order, with file:line

`GradingChatPanel.tsx` (default `export` at `:241`):

```
:163  <div className={styles.form}>                          // root: flex column, gap --space-5, NO padding
        pre-session (!sessionReady, :164-193)
:166    <div className={chatStyles.compactField}>            // label + MUI multiline TextField, instructions
:167      <label htmlFor="grading-chat-instructions">
:168      <TextField id=... multiline minRows={3} fullWidth size="small" disabled={sessionReady}>
:180    <div className={chatStyles.compactField}>            // same, rubric
        ready (:194-196)
:195    <p className={chatStyles.setupSummary}>              // one-line strip
:198  <div className={styles.ghActions}>                     // session bar
:199    <p className={styles.ghMeta}>{CHAT_SESSION_NOT_SAVED_DISCLOSURE}</p>
:200    {sessionReady && <p className={styles.ghMeta}>...locked for this session.</p>}
:203    {setupNote && <p className={styles.ghMeta}>...</p>}
:204    <Button variant="outlined" size="small" ...>New session</Button>
:209  {hasRows && driver.run ? (<>                           // stream
:211    <RubricProvenance run=.../>                          // shared: grading-results/RubricProvenance.tsx:20 -> <p className={styles.fieldHint}>
:212    <GeneratedRubricCard .../>                           // shared: <details className={styles.generatedRubricCard}>
:213    <GradingResults .../>                                // shared: <section className={styles.results}>, table .matrix in .matrixWrap
      </>) : (
:225    <p className={styles.ghMeta}>Set instructions and a rubric above, then drop in your first submission below.</p>
      )}
:228  <div className={chatStyles.stickyComposer}>            // dock
:229    {hasRows && driver.run && <LatestResultCard result=.../>}
:230    {submitError && <p role="alert" className={styles.ghMeta}>}
:235    <ChatComposer .../>
```

`LatestResultCard.tsx` (35 lines):

```
:20  <section className={chatStyles.latestCard} aria-label=...>
:21    <div className={chatStyles.latestCardHeader}>
:22      <span className={chatStyles.latestCardStudent}>  :23 <span className={chatStyles.latestCardScore}>
:25    FEEDBACK_FIELDS.map -> <div className={chatStyles.latestCardField}>
:27        <span className={chatStyles.latestCardLabel}>  :28 <p className={chatStyles.latestCardText}>
```

`ChatComposer.tsx` (does NOT import `chatStyles`; imports `styles` only, `:26`):

```
:100 <div className={styles.form}>                           // gap --space-5 between the toggle row and the field row
:101   <div className={styles.ghActions}>
:102     <SegmentedToggle label="Submission type" Text|File|URL .../>   // shared ui component, uses RecordingControls.module.css .segmented/.segment
:113     file mode: hidden <input type=file> + :116 <IconButton aria-label="Attach a file">+</IconButton>
:123   text mode: <div className={styles.adaptRow}>          // F5 pin matches this exact literal
:125     <TextField multiline maxRows={6} fullWidth size="small" label="Submission text" slotProps={{input:{onKeyDown}}}/>
:140     <TextField size="small" label="Label (optional)"/>
:147     <IconButton aria-label="Send submission">Send</IconButton>
:153   url mode: <div className={styles.adaptRow}>
:155     <TextField type="url" fullWidth size="small" label="Canvas or GitHub repo URL" onKeyDown={submitOnEnter(...)}/>
:165     <Button variant="outlined">Add</Button>
```

### 1.3 Stylesheet map (every class, where defined, where used)

Imports and bindings (must be preserved): the panel imports
`styles from "../../page.module.css"` (`GradingChatPanel.tsx:32`) and
`chatStyles from "./grading-chat.module.css"` (`:33`); the card imports
`chatStyles` (`LatestResultCard.tsx:3`); the composer imports `styles`
(`ChatComposer.tsx:26`). The alias history is 503921ff (alias `chat` collided
with the substring `chat.module` of the filename and tripped the css guard;
renamed `chatStyles`) and 2076d971 (pins retargeted). The guard's reference
regex is `(?<![\w$])<localName>\.([a-zA-Z_$][\w$]*)`
(`page-module-css-classes.test.ts:226`) run over comment-stripped source, so ANY
binding name that also appears as `<binding>.<word>` in an import path or in
code is a hazard. A new binding must be checked against that regex.

| Class | Defined | Used at | Role |
|---|---|---|---|
| `chatStyles.stickyComposer` | `grading-chat.module.css:7-16` | `GradingChatPanel.tsx:228` | bottom dock: sticky, flex column, gap `--space-2`, padding-top `--space-2`, bg `var(--surface-background, var(--field-background))` |
| `chatStyles.compactField` | `:21-25` (+ `label` `:27-33`, `textarea` `:35-46`, `::placeholder` `:48-50`, `:focus` `:52-56`) | `GradingChatPanel.tsx:166,180` | setup field wrapper; re-supplies house `.field` chrome minus the 220px floor |
| `chatStyles.setupSummary` | `:59-63` | `GradingChatPanel.tsx:195` | one-line "set for this session" strip, plain text |
| `chatStyles.latestCard` | `:68-78` | `LatestResultCard.tsx:20` | bordered box, `max-height: 30vh`, scrolls inside itself |
| `chatStyles.latestCardHeader/Student/Score` | `:80-93` | `LatestResultCard.tsx:21-23` | name bold, score secondary, `justify-content: space-between` |
| `chatStyles.latestCardField/Label/Text` | `:95-114` | `LatestResultCard.tsx:25-29` | uppercase 11px label + pre-wrap text |
| `styles.form` | `page.module.css:99-103` | panel root `:163`, composer root `ChatComposer.tsx:100` | flex column gap `--space-5` (20px) |
| `styles.ghActions` | `:1574-1580` | panel `:198`, composer `ChatComposer.tsx:101` | wrapping center-aligned control row, `flex: none` |
| `styles.ghMeta` | `:1565-1568` | panel `:199,201,203,225,231` | 13px secondary text |
| `styles.adaptRow` | `:890-895` | composer `:124,154` | wrapping flex row, `align-items: flex-end`, gap `--space-2` |

Shared, NOT in scope and NOT touchable by this item: `GradingResults.tsx`
(`styles.results`, `.resultsHeader`, `.matrixWrap`, `.matrix`, mounted by four
surfaces per `docs/BACKLOG.md:232`), `RubricProvenance.tsx`,
`GeneratedRubricCard.tsx`, `SegmentedToggle.tsx` and `RecordingControls.module.css`.
Their look is inherited as-is (see residual R5).

### 1.4 Functional behaviour that must not change

| Behaviour | Where | Existing pin |
|---|---|---|
| Sticky composer (`position: sticky` + `bottom`) | `grading-chat.module.css:8-9` | structure test `:270-274` (`ruleBlock(".stickyComposer")` must contain `position: sticky` and a `top`/`bottom` offset) and `:261-268` (`ChatComposer` mount within 400 chars after the first `chatStyles.stickyComposer`) |
| Card inside the dock, above the composer, gated on `hasRows && driver.run` | panel `:229` | `:369-395` |
| Error alert inside the dock, after the results mount, before the composer | panel `:230-234` | `:318-333` |
| Enter-to-send (text: `slotProps.input.onKeyDown`; url: top-level `onKeyDown={submitOnEnter(...)}`) and Send focus retention | composer `:80-85,77,137,162` | `:35-60` |
| Send inside the `<div className={styles.adaptRow}>` that holds the "Submission text" field | composer `:123-150` | `:335-347` (F5; uses the exact literal `<div className={styles.adaptRow}>`) |
| Session lock: setup fields unmount when `sessionReady`; `disabled={sessionReady}` | panel `:73,164,176,190` | `:77-100`, `:277-290` |
| `compactField` on each field wrapper, never `styles.field`; textarea `min-height` is a px value below 220 | panel `:166,180`, css `:35-46` | `:292-316` plus `:63-68`, which asserts the panel source contains NO substring `styles.field` (so `styles.fieldHint` is also forbidden in the panel) |
| Append-vs-reset, New session confirm, disclosure rendered | panel | `:15-32,70-75,102-125` |
| No `ta-` keys other than the frozen four | all non-test files in the directory | `grading-chat-storage-keys.structure.test.ts` (6 tests), scans RAW source including comments |

---

## 2. What "doesn't look good" - named, with the lines responsible

Confidence labels: READ = established by reading the source, no render needed;
HYPOTHESIS = a reading that the preview must confirm or kill. Nothing here was
seen on a screen (no `.env`, no auth, no rendered component in this
environment), and the prior verify recorded the same: the sticky and compact
mechanisms shipped against MECHANISM criteria with the numeric and look
acceptance left to an owner walk that has not happened
(`docs/BACKLOG.md:235`, "Numeric = OWNER residuals RG3-1..8";
`docs/grader-w3-surface-test-notes.md`). The surface has never been looked at
and judged.

| # | Issue | Confidence | Cause (file:line) |
|---|---|---|---|
| N1 | The panel has no frame and no padding: setup fields, session bar and composer run to the edge of the rounded `.tabContainer`. Siblings are framed (`GradingRecordingPanel.tsx:765` `.adaptPanel`; every `TabShell` tab is `.card` with 24px padding). | READ (no ancestor padding: `page.tsx:778-785`, `page.module.css:14-27`, root `GradingChatPanel.tsx:163`, `.form` `:99-103`, reset `globals.css:361`). Computed style in the preview confirms. | root is bare `styles.form` |
| N2 | The dock's background token does not exist. `var(--surface-background, ...)` always resolves to the fallback `--field-background`. In dark theme that is `#1e293b` (`globals.css:295`) sitting on a `--card-background` of `#121b2e` (`:289`): a lighter slab that does not match its container. Light theme hides it (both `#ffffff`, `:20,26`). | READ for the undefined token (0 definitions, section 0); dark-slab mismatch is a reading of two token values | `grading-chat.module.css:15` |
| N3 | The dock has no edge. It is padding-top only (`:14`), no border, no shadow, no bottom padding, so scrolling rows slide under a hard unmarked cut, and the composer's lower edge touches the bottom of the viewport. The composer reads as a continuation of the page, not as an input. | READ | `:7-16` |
| N4 | The latest-result card is not distinct. Same background and border as the setup fields and as the dock around it (`:70-77` `--field-background` + `--field-border` on a dock that is also `--field-background`), a plain bold name, and a plain secondary-color score; the three feedback fields are stacked at equal weight. It does not read as "the reply". | READ (token equality); weight judgement is HYPOTHESIS | `:68-114` |
| N5 | The intake error is gray 13px prose. `role="alert"` carries the semantics but the look is `ghMeta` (secondary color, `page.module.css:1565-1568`), indistinguishable from the disclosure line above the results. The house error treatment is `controls.notice controls.noticeDanger` (`RecordingControls.module.css:224-240`, used at `GradingRecordingPanel.tsx:818-832`). | READ | `GradingChatPanel.tsx:230-234` |
| N6 | The composer's Send is `<IconButton>Send</IconButton>` (`ChatComposer.tsx:147-149`): a circular icon target (MUI IconButton radius 50%) holding a word, no visible resting border or fill. URL mode's "Add" is an outlined `Button` (`:165`) - the two modes use different button idioms. File mode's only control is an `IconButton` containing the character `+` (`:116-118`). | READ for the component choice; how it paints is HYPOTHESIS (hover circle around a word) | `ChatComposer.tsx:116,147,165` |
| N7 | The composer row wraps awkwardly. `fullWidth` gives the field `width: 100%` inside `.adaptRow` (`flex-wrap: wrap`, `page.module.css:890-895`), so the Label field and Send cannot fit on the first line and drop to a second line below a full-width field; in URL mode the Add button drops below the URL field the same way. | HYPOTHESIS from the CSS (flex-wrap + a 100% item); confirm in the preview | `ChatComposer.tsx:129,159` with `.adaptRow` |
| N8 | The session bar is a ragged wrap row. Up to three long `ghMeta` sentences (the disclosure is 118 characters) and the "New session" button all sit in one `flex-wrap` row (`.ghActions`), so the button lands wherever the last sentence ends. When the session is ready the strip above it (`setupSummary`, 14px) and the line "Instructions and rubric are locked for this session." (`:201`) say nearly the same thing twice. | READ for structure; wrapping is HYPOTHESIS | `GradingChatPanel.tsx:195-207`, `grading-chat.module.css:59-63` |
| N9 | The empty state is one 13px gray sentence floating between the session bar and the dock (`:225`). Nothing says "this is where graded rows will appear". Its copy also still says fields are "above" although they collapse to a summary line once the session is ready (recorded as RG3-polish at `docs/BACKLOG.md:235`). | READ | `:225` |
| N10 | The setup textarea may carry double chrome. `.compactField textarea` (`grading-chat.module.css:35-46`) puts a 1px border, 8px radius, 16px padding and a background on the native textarea, but the textarea sits inside a MUI OutlinedInput that already draws its own outline and, for a small multiline field, 8.5px 14px root padding with 0 textarea padding (`node_modules/@mui/material/OutlinedInput/OutlinedInput.js:107-113,159-162`, MUI 9.0.1). The module rule has higher specificity (class + element) than MUI's single-class rules, so it likely wins: a bordered box inside an outlined box, 16px inside 8.5px, plus a second focus ring (`:52-56` outline 2px on top of MUI's own focus border). The rule was written for the house native-`textarea` `.field` (`page.module.css:148-166,229-240`), not for a MUI field. | HYPOTHESIS. Strongest candidate for a visibly "off" field, but it is also the house pairing in `GradingTab.tsx` (`.field` + MUI multiline), so it may be accepted look. Kill or confirm by reading computed `border-top-width` and `padding-top` of the textarea in the preview. | `grading-chat.module.css:35-56` |
| N11 | No hierarchy between regions: setup, session bar, stream and dock are all separated by one uniform `--space-5` gap (`page.module.css:102`) with no divider or surface change, so the page reads as one flat stack, not as a "config on top, conversation in the middle, input docked at the bottom" chat-like surface. The UX seat's own doc declared the look out of its scope and left it to the owner walk (`docs/grading-chat-ux.md:218-225`). | READ (uniform gap) / judgement | `GradingChatPanel.tsx:163`, `page.module.css:99-103` |

Not named as issues because they were checked and are fine: the type scale
(uppercase 11px tracked label at `:27-33` is the house `.field label`,
`page.module.css:154-160`), the radius and border tokens in use, and the
copy (not changed by this item).

---

## 3. The app's visual language - what is reused

All values read from `src/app/globals.css` unless noted (light line / dark line).

| Concern | Token or class | Value light / dark | Source |
|---|---|---|---|
| Container surface | `--card-background` | `#ffffff` / `#121b2e` | `globals.css:20 / 289` |
| Raised field / card surface | `--field-background` | `#ffffff` / `#1e293b` | `:26 / 295` |
| Subtle inset surface | `--surface-subtle` | `#f8fafc` / `#111a2e` | `:64 / 297` |
| Muted surface (assistant bubble) | `--surface-muted` | `#f1f5f9` / `#182338` | `:65 / 298` |
| Hairline | `--border-soft` | `#e2e8f0` / `#253248` | `:63 / 296` |
| Field border | `--field-border` | `#cbd5e1` / `#334155` | `:25 / 294` |
| Text | `--text-primary` / `--text-secondary` / `--text-muted` | `#0f172a #475569 #94a3b8` / `#e2e8f0 #94a3b8 #64748b` | `:22-24 / 291-293` |
| Accent | `--accent`, `--accent-ink` | `#2563eb`, `#2563eb` / `#60a5fa` ink | `:27,165 / 302` |
| Spacing | `--space-1..6` | 4 8 12 16 20 24 px | `:88-93` |
| Radius | `--radius-xs/sm/md/lg` | 6 8 12 16 px | `:109-112` |
| Type | `--font-size-2xs/xs/sm/md/lg/xl` | 11 12 13 14 16 18 px | `:71-76` |
| Line height | `--line-snug`, `--line-normal` | 1.4, 1.55 | `:82-83` |
| Shadows | `--shadow-xs/sm/md` | downward offsets only | `:159-161` |
| Control heights | `--control-height-sm/md/lg` | 28 34 40 px | `:99-101` |
| Danger notice | `--danger-surface`, `--danger-border` | adaptive via `--danger` on the same root element | `:187-188`, theme note `:210-217` |

Precedents (the overhaul copies these, it does not invent):

- Chat composer dock: `.selectionChatInputRow` (`page.module.css:4610-4618`):
  `border-top: 1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)`,
  `background: var(--surface-subtle)`, `flex-shrink: 0`. Its send control
  `.selectionChatSend` (`:4646-4660`) is a filled accent square.
- Assistant message surface: `.selectionChatAiMsg` (`:4225-`): `--surface-muted`,
  `--radius-md`, `--line-normal`.
- Inset card with an accent rail: `.workflowDetailCell` (`:6504-6507`):
  `background: var(--surface-subtle); border-left: 3px solid var(--accent)`.
- Dashed empty drop-style box: `.fileField` (`:162-176`): `1px dashed`,
  `--radius-sm`, `--field-background`.
- Status pill: `.ghBadge` + `.ghBadgeAccent` (`:1589`, `:1652`).
- Danger notice: `controls.notice` + `controls.noticeDanger`
  (`RecordingControls.module.css:224-240`).
- Padded tab section: `.card` (`page.module.css:29-36`), the TabShell frame.
- Segmented toggle already in the composer (`SegmentedToggle.tsx`,
  `RecordingControls.module.css:143-185`); not modified.
- Contrast (computed with a throwaway script, `scratchpad/contrast.mjs`,
  WCAG relative luminance): `--accent-ink` on `--surface-subtle` 4.94:1 light
  and 6.82:1 dark; `--text-secondary` on `--surface-subtle` 7.24:1 light and
  6.76:1 dark; `--text-primary` on `--surface-subtle` 17.06 / 14.07. Both
  theme definitions were read for every token above. Print, forced-colors and
  UA `color-scheme` contexts were NOT examined (stated floor per
  `docs/loop/seats.md`, Visual seat).

Constraint that shapes the choice: the Button idiom. `GradingResults.tsx:558`
renders `Post N grade(s) to Canvas` as `variant="contained"` when Canvas
posting is available, and the repo allows one filled primary per screen state
(CC1, `docs/loop/seats.md` and `ui/buttonVariant.ts`). So Send must stay
outlined, matching URL mode's `Add`; a filled Send would be a second primary.

---

## 4. The proposed overhaul, class by class

Direction (recommended reading of the ambiguous request): a calm, conservative,
reuse-the-app's-language pass that turns a flat stack into three readable
regions - setup config on top, results in the middle, a docked input at the
bottom whose latest reply sits directly above it. No bubbles, no avatars, no
animation, no new colors. If the owner's "overhaul" means something bolder
(a full chat transcript, a new layout), that is a different, larger item; this
one is explicitly look-and-feel on the existing structure.

All new declarations below use tokens from section 3. "NEW" = a class that does
not exist yet and must be referenced in the same wave (orphan ratchet).

### 4.1 Frame (fixes N1)

`GradingChatPanel.tsx:163`: `className={styles.form}` -> `className={`${styles.card} ${styles.form}`}`.
Reuses `.card` (padding `--space-6`, `page.module.css:29-36`) so the panel gets
the same 24px frame as every `TabShell` tab. Both classes are in the same
stylesheet, so `.form`'s later `gap: --space-5` (`:102`) deterministically
overrides `.card`'s `gap: --space-6` (`:34`); either gap is acceptable, so no
correctness depends on that order. The 24px root padding also gives the sticky
dock 24px of rest space under it at the end of the page. NO new class. The pin
"keeps `styles.form`" (`structure.test.ts:63-68`) still holds
(`styles.form` stays in the source; `styles.card` does not contain the
forbidden substring `styles.field`).

Rejected alternatives: `styles.adaptPanel` (adds a border and radius-lg box
inside the already-bordered `.tabContainer`; double frame); a new `.panel`
class (reinvents `.card`).

### 4.2 Setup block (N10, N11)

`.compactField` (`:21-25`) keep as is. `.compactField label` (`:27-33`) keep
(house label). `.compactField textarea` (`:35-46`) change to remove the
native-textarea chrome so the MUI outline is the only border:
`width: 100%; min-height: 72px; font: inherit; color: inherit;
line-height: var(--line-normal);` and DROP `padding`, `border`,
`border-radius`, `background`, `resize`; DROP the `:focus` rule (`:52-56`) and
the `::placeholder` rule (`:48-50`) because MUI paints both. The `min-height:
72px` stays a literal px value below 220 (pinned, `structure.test.ts:307-315`
reads `min-height:\s*(\d+)px`). Order constraint: the plain
`.compactField textarea {` rule must remain the FIRST occurrence of the string
`.compactField textarea` in the file, because `ruleBlock` takes the first match
(`structure.test.ts:250-258,309`). This step is CONDITIONAL on N10 being
confirmed in the preview; if the computed style shows no double chrome, leave
the textarea rule alone and record the finding as killed.

`.setupSummary` (`:59-63`): restyle as a status strip:
`display: flex; align-items: center; gap: var(--space-2);
padding: var(--space-3) var(--space-4); border: 1px solid var(--border-soft);
border-radius: var(--radius-md); background: var(--surface-subtle);
font-size: var(--font-size-md); color: var(--text-secondary);
line-height: var(--line-normal);`. Precedent: `.selectionChatInputRow` surface
and `.generatedRubricCard` (`page.module.css:558-565`) border treatment.

### 4.3 Session bar (N8)

NEW `.sessionBar` replaces `styles.ghActions` on `GradingChatPanel.tsx:198`:
`display: flex; align-items: flex-start; justify-content: space-between;
gap: var(--space-4); flex-wrap: wrap;`.
NEW `.sessionMeta` on a new wrapper `<div>` placed around the three `<p>`
(`:199-203`): `display: flex; flex-direction: column; gap: var(--space-1);
flex: 1 1 320px; min-width: 0;`. The three `<p className={styles.ghMeta}>` are
unchanged, so the pinned `{CHAT_SESSION_NOT_SAVED_DISCLOSURE}` render and the
copy are unchanged. The "New session" Button stays as the second flex child.
The two overlapping messages in the ready state are NOT merged here (copy is
out of scope); the strip (4.2) plus the single meta column is what is visually
grouped. This is the DOM change in the wave: one wrapper div (named).

### 4.4 Stream and empty state (N9, N11)

NEW `.stream` wrapper replacing the fragment at `GradingChatPanel.tsx:210-223`
around `RubricProvenance`, `GeneratedRubricCard`, `GradingResults`:
`display: flex; flex-direction: column; gap: var(--space-3);`, so the
provenance hint and the rubric card sit close to the table they describe
instead of 20px away like every other region. OPTIONAL: drop it if the preview
shows no gain (it adds a DOM node). It does not touch the shared components
and does not disturb the `<GradingResults` slice pin (`structure.test.ts:134-139`).

NEW `.streamEmpty` on the `<p>` at `:225` in place of `styles.ghMeta`:
`padding: var(--space-6) var(--space-4); border: 1px dashed var(--field-border);
border-radius: var(--radius-md); text-align: center;
color: var(--text-secondary); font-size: var(--font-size-md);
line-height: var(--line-normal);` (dashed-box precedent `.fileField`,
`page.module.css:170-176`). Copy unchanged. (The stale "above" wording is the
known RG3-polish nit and is a copy item, left to the owner decision in 7.)

### 4.5 Dock (N2, N3, N4, N5)

`.stickyComposer` (`:7-16`), keep `position: sticky; bottom: 0; z-index: 2;
display: flex; flex-direction: column;` (pinned and functional) and change:
`gap: var(--space-3); padding: var(--space-3) 0 var(--space-4);
background: var(--card-background); border-top: 1px solid var(--border-soft);`.
`--card-background` replaces the nonexistent `--surface-background`, so the
dock is opaque AND the same color as the container it sits in, in both themes
(N2). The hairline gives the dock its edge (N3), and matches the app's own
composer dock (`.selectionChatInputRow` `:4610-4618`). Mechanism proxy only:
sticking requires no clipping-ancestor overflow (`.tabContainer` uses `clip`,
`page.module.css:24-26`); unchanged and not provable here.

`.latestCard` (`:68-78`): keep `display: flex; flex-direction: column;
max-height: 30vh; overflow-y: auto;`, and change to
`gap: var(--space-3); padding: var(--space-3) var(--space-4);
border: 1px solid var(--border-soft); border-left: 3px solid var(--accent);
border-radius: var(--radius-md); background: var(--surface-subtle);`
(`.workflowDetailCell` precedent). The card is now a different surface and has
an accent rail, so it is visibly "the reply" above the input (N4).
`.latestCardHeader` (`:80-84`): add `align-items: baseline`.
`.latestCardStudent` (`:86-89`): keep weight 700, add
`font-size: var(--font-size-md)`. `.latestCardScore` (`:91-93`): change to
`font-weight: 700; font-variant-numeric: tabular-nums; color: var(--accent-ink);
flex-shrink: 0;` (4.94:1 light / 6.82:1 dark on `--surface-subtle`, measured
above). Optional taste iteration: render the score through `styles.ghBadge` +
`styles.ghBadgeAccent` (`page.module.css:1589,1652`); NOT recommended by
default because `GradeResult.totalScore` is a `string` that can be empty for
an ungraded latest row (`src/lib/grade/types.ts:198-205,238`), which would
draw an empty pill, and a guard would be a logic change. `.latestCardField`,
`.latestCardLabel`, `.latestCardText` (`:95-114`): keep; `.latestCardText`
add `font-size: var(--font-size-md)`.

Intake error (N5): `GradingChatPanel.tsx:231`
`className={styles.ghMeta}` -> `className={`${controls.notice} ${controls.noticeDanger}`}`
with a new `import controls from "../recording/RecordingControls.module.css";`
(the exact import and binding `SegmentedToggle.tsx:21` already uses under a
green css guard; 56 `.tsx` files import this sheet, measured by `grep -rl "RecordingControls.module" src --include=*.tsx | wc -l`). Keep `role="alert"` and the
position (inside the dock, after the results mount, before the composer).
Contrast of the danger notice is the house pair already shipped on the
Recording panels; no new color pair is introduced.

### 4.6 Composer (N6, N7)

`ChatComposer.tsx` gains `import chatStyles from "./grading-chat.module.css";`
(the same binding name as the panel; it must not be `chat`, see 1.3).

- Root `<div className={styles.form}>` (`:100`) -> `<div className={chatStyles.composer}>`
  with NEW `.composer { display: flex; flex-direction: column;
  gap: var(--space-2); }`. Reason: inside the dock the 20px `.form` gap is too
  loose between the toggle row and the field row. `.composer` is NOT combined
  with `.form` on the same element, because two single-class rules from two
  different stylesheets would tie on specificity and be ordered by CSS bundle
  order.
- Keep `<div className={styles.adaptRow}>` on both mode rows UNCHANGED
  (the F5 pin matches that exact literal, `structure.test.ts:340`). Fix the wrap
  (N7) by removing `fullWidth` from the text-mode and url-mode fields and
  giving them `className={chatStyles.composerGrow}`:
  NEW `.composerGrow { flex: 1 1 240px; min-width: 0; }`; the Label field gets
  `className={chatStyles.composerLabel}`: NEW `.composerLabel { flex: 0 1 180px; }`
  (180px is already one of the ten existing field widths listed at
  `docs/REGRESSION.md:866-867`, so no new magic number). With flex-grow the
  field fills the row beside Label and Send and wraps only on narrow widths.
  `fullWidth` is not pinned anywhere (`grep -n fullWidth` over the structure
  test returns nothing). Whether the MUI root class (single class, emotion) and
  the module class tie on `flex` is moot: MUI's root sets no `flex`.
- Send (N6): replace `<IconButton aria-label="Send submission" ...>Send</IconButton>`
  (`:147-149`) with `<Button variant="outlined" aria-label="Send submission"
  disabled={disabled || !text.trim()} onClick={handleSendText}>Send</Button>`.
  Same handler, same `disabled`, same `aria-label` (F5 pin `:345` still finds
  it inside the row), same visible word. Outlined, not contained, because of the
  CC1 constraint in section 3. `Button` is already imported (`:23`).
- File mode (N6): the `+` `IconButton` (`:116-118`) becomes a small outlined
  `Button` with visible text, keeping `aria-label="Attach a file"` and the same
  `onClick`. Text is a COPY change (see owner decision OD1); if the owner
  declines, keep the `+` and only add `variant`-matching styling through a
  class.
- URL mode: `Add` button (`:165`) unchanged (already outlined); only the field
  loses `fullWidth` and gains `composerGrow`.
- Vertical alignment: `.adaptRow` bottom-aligns (`align-items: flex-end`,
  `page.module.css:894`). A medium MUI Button next to a small TextField can sit
  about 1px off; the preview checks it (R7). If it is visible, add
  `size="small"` to the buttons and compare.

No other file is touched. `LatestResultCard.tsx` needs no TSX change in the
default plan (CSS-only); `SegmentedToggle`, `page.module.css`, `page.tsx`,
`GradingResults*`, `RubricProvenance`, `GeneratedRubricCard` are read-only.

### 4.7 New classes summary and the css-guard implications

NEW classes: `sessionBar`, `sessionMeta`, `stream` (optional), `streamEmpty`,
`composer`, `composerGrow`, `composerLabel`. Each is referenced by a TSX in the
same wave, which is the only thing keeping the orphan ratchet at exactly 118.
No new class lives in `page.module.css` (frozen, 7034 lines per the backlog
note at `docs/BACKLOG.md:235`). New bindings: `controls` in the panel,
`chatStyles` in the composer; both are safe against the guard's reference regex
(`controls` already coexists with its import path in `SegmentedToggle.tsx:21`;
`chatStyles` is the alias that was chosen to avoid the `chat.module` collision).

---

## 5. Constraints the guards impose on the plan (traps to avoid)

1. Orphan ratchet is exact: `expect(totalOrphanCount).toBe(PINNED_ORPHAN_CEILING)`
   with the pin at 118 (`page-module-css-orphan-classes.test.ts:316,436`). It
   moves in BOTH directions:
   - defining a class that no importing file references raises it (red);
   - adopting a currently-orphaned `page.module.css` class (for example
     `chatModal*`, `courseCard*`, `clearFileButton`, listed in
     `docs/css-orphans.md`) lowers it (red until the pin is lowered in the same
     change, which turns this visual item into a ratchet edit; avoid);
   - a `:global(.Mui...)` selector is counted as a "global selector orphan"
     (`docs/css-orphans.md` global-selector caveat), so it raises the total.
     Therefore do not use `:global(...)` in `grading-chat.module.css`; style
     MUI through `className` props and element selectors only.
2. The panel source must not contain the substring `styles.field`
   (`structure.test.ts:63-68` uses `not.toContain("styles.field")` over the
   whole file). `styles.fieldHint` contains it. Use `ghMeta`, `emptyState`-like
   local classes, never `styles.fieldHint`, in the panel.
3. `ruleBlock()` takes the first occurrence of the selector string and the first
   `}` after the first `{` (`structure.test.ts:250-258`): no nested braces
   inside `.stickyComposer` or `.compactField textarea`; no earlier selector
   that begins with `.stickyComposer` or `.compactField textarea` may precede
   the plain rule.
4. The `.compactField` wrapper must be the nearest `<div` before each setup
   field id (`structure.test.ts:293-305`, `lastIndexOf("<div", idIdx)`): do not
   nest a div between the wrapper and the TextField.
5. Mount order inside the dock is pinned: wrapper < `LatestResultCard` < alert
   < `ChatComposer`, and the composer within 400 chars of the first
   `chatStyles.stickyComposer` (`:261-268,318-333,369-378`). Do not reorder or
   insert more than a few lines between them.
6. `ta-` keys: scanned from raw source of every non-test `.ts/.tsx` in
   `grading-chat/` (`grading-chat-storage-keys.structure.test.ts:31-39`);
   comments included. Do not type any `ta-...` token in a comment or string.
7. File-size ceiling is 1000 lines over `src/` (`LIMIT = 1000`,
   `docs/loop/this-repo.md` section 1). The three TSX files are 241/174/35;
   the plan adds on the order of 20-40 lines in total, not a risk.
8. No emojis, anywhere, including CSS `content:` strings
   (`src/lib/no-emojis.test.ts` owns the rule).
9. LF line endings and no BOM (`src/source-bytes.structure.test.ts`); the Write
   tool materializes a `\uXXXX` escape literally, so type no escapes.

---

## 6. Machine-checkable acceptance criteria and the validation path

### 6.1 Machine AC (structure/CSS pins; none measures appearance)

Each row names the object compared, the instrument, and the direction of
failure. The gate is the wrapper with one path per argument, as in 0.1.

| ID | Object under comparison | Instrument | Pass | Fails when |
|---|---|---|---|---|
| M1 | Every `chatStyles.X`, `styles.X`, `controls.X` reference in the three TSX files vs the class set defined in the stylesheet that file's own import resolves to | `npm run test:paths src/app/components/courses/page-module-css-classes.test.ts ...` (line `COVERED ... page-module-css-classes.test.ts files=1 passed=10`) | all pass | a referenced class is undefined (typo, deleted class) |
| M2 | Total orphan count across the 31 stylesheets vs `PINNED_ORPHAN_CEILING` | `page-module-css-orphan-classes.test.ts` (`passed=9`) | measured == 118 | a new class is defined but not referenced (rises), or an orphaned shared class is adopted (falls), or a `:global(.Mui...)` is added (rises) |
| M3 | The existing 40 panel/composer/card source pins | `GradingChatPanel.structure.test.ts` (`passed=40`) unmodified | all 40 pass with NO edit to the test file | any pin in section 1.4 or 5 is violated. Pin edits are not planned; if the test seat decides one is needed (it should not), it is a named retarget, never a loosening |
| M4 | The `ta-` key set in `grading-chat/` non-test sources vs the frozen four | `grading-chat-storage-keys.structure.test.ts` (`passed=6`) | set unchanged | a key is added or removed, including in a comment |
| M5 | Every `.ts/.tsx` in `src/` vs 1000 lines | `src/file-size-ceiling.structure.test.ts` (`passed=3`) | all within the ceiling | any file over 1000 |
| M6 | Source bytes and emoji scan | `src/source-bytes.structure.test.ts`, `src/lib/no-emojis.test.ts` | pass | BOM, control byte, emoji |
| M7 | Mount in `page.tsx` | `src/app/components/tabs/topLevelTabs.wiring.test.ts` (`passed=37`) and `git diff --stat -- src/app/page.tsx` empty | pass and empty diff | `page.tsx` touched or the always-mounted shape changed |
| M8 | No control removed: the multiset of control handles before vs after | `grep -n -E 'aria-label=\|label="\|id="grading\|onClick=\|onKeyDown\|slotProps' <3 TSX files>` at HEAD (16 lines) vs after the wave; every handle present at HEAD must appear after (a `+`/`Send` swap keeps `aria-label`) | no handle lost | a `label=`, `aria-label=`, `id=`, `onClick`, `onKeyDown` or `slotProps` handle present at HEAD is missing |
| M9 | The write set vs the assignment | `git status --short` against section 8's file list, plus no `.claude/worktrees` copy edited | exactly the listed files (+ the regenerated `docs/css-orphans.md`) | any other path changed, or a preview harness file left in the tree |
| M10 | New-class coverage (test seat to author, suggested) | a source pin that each NEW class in section 4.7 appears both in `grading-chat.module.css` and in a TSX | present in both | a class defined but unreferenced |

Sabotage the test seat should run (each must go red, then be restored from a
`cp` backup, never `git checkout`): (a) delete `.latestCard` -> M1 red;
(b) define `.unusedProbe` -> M2 red; (c) add `styles.fieldHint` to the panel
-> M3 red (proves the section 5.2 trap is real); (d) add a `ta-probe` string to
a comment in the composer -> M4 red; (e) change the Send handle's `aria-label`
-> M3 F5 pin red and M8 shows the diff.

### 6.2 The look - validated by the built-in browser, with honest limits

The look is validated by screenshot, not by any test. What was found out about
whether that is possible here (reading, NOT yet exercised - recon only):

- The real page cannot be reached. `src/proxy.ts` runs on every non-static
  route and `updateSession` constructs a Supabase client from
  `process.env.NEXT_PUBLIC_SUPABASE_URL!` / `..._ANON_KEY!`
  (`src/lib/supabase/proxy.ts:213-214`); there is no `.env`
  (`docs/loop/this-repo.md` section 1, build gate) and every non-public path is
  redirected to `/login` without a session. `.claude/launch.json` already
  defines a `dev` server on port 3000.
- Only `PUBLIC_PATH_PREFIXES = ["/login", "/auth", "/api/cron", "/api/triggers",
  "/api/github/webhook"]` bypass the gate (`src/lib/access.ts:319-325`).

Proposed path (UNVERIFIED; the first build step is a feasibility spike):

1. Start `dev` with non-secret placeholder values for the two public Supabase
   env vars passed on the dev server's own process environment (not written to
   any file, not committed), so the root layout's `SupabaseProvider`
   (`src/app/layout.tsx:13`) can construct a client. Whether the provider
   renders without a reachable backend is NOT known.
2. Create a throwaway, UNTRACKED harness route under a public prefix (for
   example `src/app/login/gc-preview/page.tsx`) that renders the same ancestor
   chain: `<div className={pageStyles.tabContainer}>` ... and (a) the REAL
   `GradingChatPanel` for the pre-session state (setup fields, session bar,
   empty state, composer in all three modes, localStorage key
   `ta-grading-chat-input-mode` is flipped by clicking the toggle), and (b) a
   composed replica of the mid-session DOM (`LatestResultCard` with a fixture
   `GradeResult`, `ChatComposer`, a short fixture `GradingRun` through
   `GradingResults`) inside the real `chatStyles.stickyComposer` wrapper. The
   mid-session look cannot be reached on the real panel: producing rows needs
   `/api/grade-run-item` and a Gemini key, neither of which exists here. So the
   mid-session screenshots validate the CSS on a replica; the existing wiring
   pins (M3) are what cover that the real panel emits the same classes in the
   same order. The harness is a copy and can drift from the panel; say so in
   the verify report.
3. Before/after screenshots at 1280x720, 768x1024 (`resize_window` tablet) and
   375x812 (mobile), light and dark. The app has exactly one dark route,
   `html[data-theme="dark"]` (`docs/REGRESSION.md:23255-23259`), so dark is
   forced by setting that attribute with the page JS tool. `layout.tsx` is
   recorded as resolving the media query in JS and writing the attribute
   (`docs/REGRESSION.md:23256-23258`), so the pane's `colorScheme` emulation
   after a reload MAY also work; that was not tested here, so set the attribute
   directly and do not rely on the emulation.
4. Instrument readings the screenshots cannot carry, via the page JS tool:
   `getComputedStyle` of the setup textarea (`border-top-width`,
   `padding-top`, `outline-width` on focus) for N10; the bounding box of the
   dock vs `window.innerHeight` (suggested bar for the human check: the dock
   at most about half the viewport at 1280x720 with a populated card and a
   6-row composer; a proposed bar, not derived); bottom alignment of the Send
   button and the field (N7).
5. Delete the harness; `git status --short` must show it gone before any gate
   or commit, and the harness must not exist while any sibling item runs the
   css or orphan tests (it imports `grading-chat.module.css` and
   `page.module.css`, so it is scanned by the guard).

If the spike fails (the layout will not render without a backend, or the dev
server cannot start), the fallback is an OWNER walk on a deployed preview. In
that case say so explicitly; do not present a hand-copied static HTML of the
panel as a preview of the real surface.

Shared-resource note: the sibling REPO-HEADER-VISUAL item also wants the
preview. `next dev` writes `.next/` and holds port 3000; two dev servers on one
tree race. Serialize the two items' preview steps (R8).

---

## 7. Owner decisions (every answer terminates this activity)

This activity ships the plan in section 4 with the defaults below applied. The
answers are applied as transcription; none reopens anything.

- OD1 (copy-touching, small): file mode's `+` becomes a text button. Options:
  (a) a small outlined button reading "Add files" (recommended; mirrors URL
  mode's "Add"), (b) keep the `+` glyph and only restyle. Cost if wrong: one
  line.
- OD2 (hierarchy): whether the panel also gets the sibling-style title and
  subtitle header (`adaptPanelHeader/Title/Subtitle`,
  `page.module.css:913-948`, as `GradingRecordingPanel.tsx:766-773`). Options:
  (a) no header in this item (recommended: it adds copy and the request is
  look-and-feel), (b) add a one-line title and subtitle (new copy, which the
  owner would have to write or approve). Cost if wrong: one wrapper and two
  lines.

What is already running on the recommended reading: nothing. This is a scope
artifact; no build has started and none can until the scope is checked
(`docs/loop/` rule: a build from an unchecked scope is not dispatchable).

---

## 8. Wave plan

One wave, CSS-first. Everything is in one wave because the new classes and the
TSX that references them must land together (an orphan or an undefined class is
red on its own), and the write set is four files in one directory.

W1 write set (exact paths):
- `src/app/components/grading-chat/grading-chat.module.css` (edit)
- `src/app/components/grading-chat/GradingChatPanel.tsx` (class bindings,
  `controls` import, `sessionMeta`/`stream` wrappers)
- `src/app/components/grading-chat/ChatComposer.tsx` (`chatStyles` import, class
  names, remove `fullWidth`, Send/Attach `Button`)
- `src/app/components/grading-chat/LatestResultCard.tsx` (no change in the
  default plan; listed because the optional score badge, if chosen at the
  preview, touches it)
- `docs/css-orphans.md` is regenerated by M2 and must be staged only if the
  test changed it

Each new class's caller is in the same wave (the CSS and its TSX are both in
the write set), so no export ships without its caller.

Not in the write set: `page.tsx`, `page.module.css`, `GradingResults*`,
`grading-results/*`, `SegmentedToggle*`, `RecordingControls.module.css`, the
repo-grades files (the sibling item), any test file (M3 is expected to pass
unedited; the test seat may ADD pins, e.g. M10, in a new test file or
extension of the structure test).

Order inside the wave: (1) harness feasibility spike and BEFORE screenshots
(the before set is the only baseline for "no regression"); (2) CSS and class
bindings; (3) preview iteration with the owner's taste as the arbiter; (4) gate
per 0.1 with every M-row; (5) AFTER screenshots attached to the verify report.
Gate commands are the section 0.1 wrapper line, plus `npx tsc --noEmit` and
`npm run lint` run by exactly one caller (the wave gate; `tsc` races on
`tsconfig.tsbuildinfo`) and the `npm run build` compile-line check
(`docs/loop/this-repo.md` section 1; the prerender tail failure is expected
and is not a signal).

Seats for the chunk (recorded triggers): Acceptance criteria and Test seat run
(always, `docs/loop/seats.md`). Architect + reuse ran here (any change touching
more than two files). UX ran here (user-visible change). Visual/aesthetic ran
here (layout, spacing, colour change; section 3 is its tokens-per-theme work).
Accessibility: triggers on "any change to markup" - this chunk changes markup
(a wrapper div, `IconButton` to `Button`, the alert's classes), so it is NOT
triaged out; it is a reading-only pass with the standing ceiling that no
component is rendered. The role of the Send/Attach controls stays a native
`<button>` and the `aria-label`s and `role="alert"` are kept; the removal of
the custom textarea `:focus` outline (4.2) is the one focus-visible change and
must be confirmed in the preview. Data/storage: not triggered (no persisted
shape, no `ta-` key). Security: not triggered (no action, egress, or model text
reaching the DOM; the card already renders text nodes). Reliability and
operability/admin: not triggered (no failure mode, no config). The owner
excluded the data, admin, security and SRE seats for this item; the triggers
above are the recorded reasons, for the verifier to rule on against the built
diff.

Leverage claim: none. This is a visual refactor of an existing surface, not a
new capability a user reaches (`DEV_LOOP.md`, "The loop / Criteria": the
document opens with a claim only when the chunk builds or changes a
capability); fired trigger recorded.

---

## 9. Residual register

Each entry has an owner, an instrument and the step that will measure it.

| ID | Not proven now | Owner | Instrument | Step |
|---|---|---|---|---|
| R1 | Whether the result looks good: spacing, hierarchy, the dock edge, the latest card as "the reply", the setup strip | Repo owner (taste) with the W1 implementer driving | Before/after screenshots in the built-in browser at 1280x720 / 768x1024 / 375x812, light and dark, shown to the owner | W1 steps 1 and 3, then the owner walk |
| R2 | Whether the preview path works at all (placeholder Supabase env, public-prefix harness, root layout rendering without a backend) | W1 implementer (spike); verifier re-runs | `preview_start` the `dev` config, navigate to the harness, `read_page` and a screenshot; success = the panel's setup fields are in the DOM | W1 step 1; failure converts R1 to an owner walk on a deployed preview and is stated in the verify report |
| R3 | N10: double chrome on the setup textarea | W1 implementer | `getComputedStyle(textarea)` `border-top-width`, `padding-top`, focus `outline-width` before and after, via the page JS tool | W1 step 1 (before), step 3 (after); kills or confirms 4.2 |
| R4 | N7: composer row wrap and Send/field bottom alignment, all three modes | W1 implementer | screenshots at 1280 and 375 plus `getBoundingClientRect().bottom` of Send and the field | W1 step 3 |
| R5 | The populated results stream (the `GradingResults` table, "Grading Results" heading and its buttons, `RubricProvenance`, `GeneratedRubricCard`) is inherited unchanged and may remain the dominant eyesore; it is shared by four mounts (`docs/BACKLOG.md:232`) and lives in `page.module.css` | Orchestrator (decides whether to file a follow-on row) | the populated-state screenshot from the composed replica, plus the owner's reaction at the walk | W1 verify; if the table is the complaint, file a new row scoped to the shared files with its own collision check |
| R6 | Dark-theme contrast for every new pair: computed only for accent-ink, text-secondary and text-primary on `--surface-subtle` (section 3); the danger notice pair is the shipped house pair but not re-measured here; print, forced-colors, UA `color-scheme` not examined | W1 verifier | re-run the contrast script (`scratchpad/contrast.mjs`) over the final pairs plus a dark-theme screenshot with `html[data-theme="dark"]` set | W1 verify |
| R7 | The dock height on short viewports (card up to 30vh plus alert plus a composer up to 6 rows plus the new gap and padding) | W1 implementer | dock `getBoundingClientRect().height` / `window.innerHeight` at 1280x720 and 1366x768 with a populated card | W1 step 3; if over the proposed half-viewport bar, reduce `.latestCard max-height` or the dock padding |
| R8 | Serialization of the preview with the sibling REPO-HEADER-VISUAL (one `.next`, one port) and the harness file being untracked in a shared tree that a sibling's guard tests would scan | Orchestrator | `git status --short` shows no harness path at every gate; only one `next dev` running | Before W1 dispatch (confirm the sibling's preview window) and at the W1 gate |
| R9 | Sticky behaviour in the real layout (clip ancestors, scroll container) | Repo owner | owner walk (carried forward from RG3-1, `docs/BACKLOG.md:235`) | The SMOOTH-BASELINE walk; unchanged mechanism, the plan only restyles the box |
| R10 | The setup field no-rows copy says "above" while the fields may be collapsed (RG3-polish) | Repo owner | n/a (a copy decision) | Folded into OD2; if declined it stays a known nit |

---

## 10. What this seat could not determine

- Nothing in this document was seen rendered. Every statement about how a
  region paints (N1 through N11) is a reading of source and tokens;
  HYPOTHESIS rows are marked. N1's "no padding" is the most certain
  (no padding exists on the root, `.form`, the bare wrapper, `.tabContainer`
  or the reset), but even it is confirmed only by a computed-style read in the
  preview.
- Whether the preview route works with placeholder env values (R2).
- Whether the MUI-versus-module cascade really produces double chrome (R3).
  MUI 9.0.1's padding values were read from
  `node_modules/@mui/material/OutlinedInput/OutlinedInput.js`; the CSS bundle
  order between emotion and the module sheet was not examined.
- Whether `align-items: flex-end` aligns a medium Button with a small TextField
  to the pixel.
- Print, forced-colors and `color-scheme` behaviour of any new pair.
- This artifact has not been checked by a peer. Round 1 of two.
