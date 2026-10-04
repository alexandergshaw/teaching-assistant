# Run-setup baseline walk: one owner instrument for scroll, cursor and click cost on three surfaces

Status: OWNER INSTRUMENT. Docs only; no production code was written or changed. Authored 2026-10-04 by a `loop-seat` (Sonnet) at HEAD 519ef6a6, not yet adversarially checked.

**What this is, stated plainly.** Nothing in this document is machine-verifiable. No component renders under any test in this repo and there is no `.env`, so the scroll, cursor and click figures in the three smoothing scopes are CSS arithmetic or code-reading, and each scope flagged its pixel targets as proposals the owner ratifies. Running the snippets below on HEAD, in a real browser, produces the BASELINE that turns those proposed targets into ratified acceptance criteria. The owner's numbers then feed the build waves' acceptance criteria. No snippet here has been run against the real app: the only checks done on them were `node --check` for syntax and a hand-built fake DOM (section 8), which proves the snippets' arithmetic and output shape and nothing about the real page.

Owner request this serves (as carried by all three scopes): minimize SCROLL DISTANCE and CURSOR TRAVEL to set up a run, co-equal with click count, without dropping any confirm or guard.

Source scopes (all three say they are unchecked; last commit touching them, `git log --oneline -1 -- <the three files>` = `1decd617`; `git status --short docs` shows none of the three modified):

- GRADER: `docs/grader-smooth-scope.md` (184 lines, `wc -l`).
- WALKTHROUGH: `docs/walkthrough-announcement-clicks-scope.md` (601 lines, `wc -l`).
- REPO: `docs/repo-grader-smooth-scope.md` (558 lines, `wc -l`).

---

## 1. How to run this (applies to every snippet)

1. Use Chrome or any browser with a DevTools console, logged in to the running app, zoom 100 percent.
2. Set the viewport with the device toolbar / responsive mode to **1366 x 768** (the default reference; the grader scope proposes it, `grader-smooth-scope.md:113`), run the snippet, record. Then repeat at **1920 x 1080**. The repo scope's AC5 explicitly fails on either size (`repo-grader-smooth-scope.md:375-376`). The walkthrough scope states its own criteria at **1280 x 720** (`walkthrough-announcement-clicks-scope.md:300,433,445`), so for the walkthrough surface run 1280 x 720 as well. Every snippet prints `viewport` (innerWidth x innerHeight): if it differs from what you meant, the numbers are for the printed size. A docked DevTools shrinks `innerHeight`; use responsive mode or an undocked DevTools.
3. Every snippet scrolls to the top first, then reports positions measured from the TOP OF THE DOCUMENT (so app chrome above the panel, the top bar and tab rails, is INCLUDED; the three scopes all say they did not measure it: `grader-smooth-scope.md:170`, `repo-grader-smooth-scope.md:184-185`). Chat and walkthrough also print `fromPanel` (offset from the panel's own top edge) because their scope estimates are panel-relative.
4. **Above the fold** means `bottom <= 0.8 x innerHeight` (614 px at 768, 864 at 1080), the rule from `repo-grader-smooth-scope.md:373-374`. The column `inViewport` is the looser `bottom <= innerHeight`, which is the grader scope's wording for AC-S1 ("visible without scrolling", `grader-smooth-scope.md:115`). Both are printed so you can ratify either.
5. A row that reads `NOT FOUND OR HIDDEN` means the control was not on screen in that state (for example the Post row before a draft exists), or a selector failed. See residual I-1.
6. `console.table` prints the per-control rows; the last console line is one JSON summary object to paste back.
7. Do NOT click anything that spends money or publishes. Where a snippet needs a state (a draft, an armed Post), the safe way to reach it is stated in that section.

---

## 2. Where each snippet came from

| # | Snippet | Surface | Provenance | What I changed or added |
|---|---|---|---|---|
| 1 | Chat setup walk | GRADING-CHAT grader, Chat sub-tab | NEW. The grader scope contains NO DevTools snippet: `grep -n "getBoundingClientRect\|innerHeight\|scrollHeight\|console\|DevTools" docs/grader-smooth-scope.md` returns nothing (the same grep over the other two scopes returns hits). It specifies only a "browser walk ... recording scroll px and the pointer path" (`grader-smooth-scope.md:168`, residual R-1) and AC-S1..S4 (`:115-118`). | Written from AC-S1..S4. Selectors are the ids and labels read from `GradingChatPanel.tsx:130-156` and `ChatComposer.tsx:101-169`. |
| 2 | Walkthrough setup walk | Announcement from a walkthrough panel | `walkthrough-announcement-clicks-scope.md:288-298` (section 3.4), consolidated. | The scope snippet dumps every visible control and declares a `want` regex (`:291`) it never uses. Even if used, `want` would not match the Post button: the button's accessible name is its aria-label, "Post draft N to Canvas" (`AnnouncementDraftSlot.tsx:314`, applied at `ui/ConfirmArmButtons.tsx:106`), not "Post to Canvas". Mine selects the named key controls by label or button text, keeps the panel-relative `top`, and adds the AC-1, AC-8, AC-5 and AC-13 derived numbers. The scope snippet itself remains valid if you want the full dump. |
| 3 | Repo Grades setup walk | Repo Grades | `repo-grader-smooth-scope.md:368-370` (AC5, one-liner for the buttons) plus its prose for `#repo-grades-course` and `#repo-grades-folder` (`:372-373`), consolidated. | The scope's button regex `^(Grade\|Nothing to grade\|Post\|Re-post)` also matches every per-cell "Grade" button (`RepoGradeCellControl.tsx:575`), flooding the output on a populated grid; I narrowed it to the column-header labels (`RepoGradesGrid.tsx:354-355,437`). Added the other setup controls by their ids (`RepoGradesControls.tsx`), and the AC5 and AC6 verdicts. |
| 4 | Repo Grades AC7 probe | Repo Grades | AC7 prose, `repo-grader-smooth-scope.md:380-382`. | New, 4 lines. Unlike the others it does NOT scroll: you scroll to the last graded row first. |
| 5 | GithubGradingPanel setup walk | Secondary Repo-grader surface | NEW. The repo scope names this surface's px as unmeasured (residual R7, `:550`) and gives no snippet for it. | Selectors by label text (`GithubGradingPanel.tsx:489,647,712,724,732`) and button text (`:555,751`). |

Snippet count: **5** (4 setup walks plus the AC7 probe).

---

## 3. Surface A: GRADING-CHAT grader, Chat sub-tab

**Click path to reach it** (`grader-smooth-scope.md` section 1, line 23): "Tools" top tab (`tab-sections.ts:40`) -> "Grading" rail chip (`manual-rail.ts:204`) -> inner "Chat" chip (`manual-rail.ts:158`). A returning user who last left on Chat lands there with 0 navigation clicks (persisted `ta-active-tab`, `ta-manual-view`, `ta-grading-view`, `ta-tools-section`, same line). The panel is an always-mounted, display-toggled div (`page.tsx:748-757`); the snippet aborts with a message if it is hidden.

**Stages to record.** (A) before the first submission: instructions and rubric empty or filled, no rows. (B) after at least one text submission has been graded, so the results block is on screen. Stage B is the AC-S2 case ("composer reachable after N rows", `grader-smooth-scope.md:116`) and needs a model key, so it is owner-run. Repeat B with about 10 rows if you can. Use Text mode for the first stage-A run; re-run once in URL mode if you use that (the START row names the control it found).

**Snippet 1 (paste into the console):**

```js
(() => {
  scrollTo({ top: 0, behavior: 'instant' });
  const H = innerHeight, W = innerWidth, fold = 0.8 * H;
  const shown = e => !!e && e.getClientRects().length > 0;
  const lab = (root, p) => {
    const l = [...root.querySelectorAll('label')].find(x => shown(x) && x.textContent.trim().startsWith(p));
    return l ? l.parentElement.querySelector('input:not([aria-hidden="true"]),textarea:not([aria-hidden="true"]),[role="combobox"]') : null;
  };
  const btns = (root, re) => [...root.querySelectorAll('button')].filter(b => shown(b) && re.test(b.textContent.trim()));
  const rowOf = (control, e) => {
    if (!shown(e)) return { control, top: null, bottom: null, left: null, cx: null, cy: null, aboveFold: 'NOT FOUND OR HIDDEN', inViewport: '-' };
    const r = e.getBoundingClientRect(), t = r.top + scrollY, b = r.bottom + scrollY;
    return { control, top: Math.round(t), bottom: Math.round(b), left: Math.round(r.left), cx: Math.round(r.left + r.width / 2), cy: Math.round(t + r.height / 2), aboveFold: b <= fold, inViewport: b <= H };
  };
  const band = rs => { const k = rs.filter(r => r.cx !== null); return k.length ? { bandH: Math.max(...k.map(r => r.cy)) - Math.min(...k.map(r => r.cy)), bandW: Math.max(...k.map(r => r.cx)) - Math.min(...k.map(r => r.cx)) } : null; };
  const pathPx = rs => { const k = rs.filter(r => r.cx !== null); let s = 0; for (let i = 1; i < k.length; i++) s += Math.hypot(k[i].cx - k[i - 1].cx, k[i].cy - k[i - 1].cy); return Math.round(s); };

  const lb = document.querySelector('label[for="grading-chat-instructions"]');
  if (!shown(lb)) return 'Chat panel not visible: open Tools > Grading > Chat first';
  const root = lb.parentElement.parentElement; // div.form, GradingChatPanel.tsx:129-131
  const rootTop = root.getBoundingClientRect().top + scrollY;
  const startEl = root.querySelector('button[aria-label="Send submission"]') || btns(root, /^Add$/)[0] || root.querySelector('button[aria-label="Attach a file"]');
  const startName = startEl ? (startEl.getAttribute('aria-label') || startEl.textContent.trim()) : 'Send/Add';
  const instr = rowOf('Instructions', document.getElementById('grading-chat-instructions'));
  const rub = rowOf('Rubric', document.getElementById('grading-chat-rubric'));
  const fld = rowOf('Composer field', lab(root, 'Submission text') || lab(root, 'Canvas or GitHub repo URL'));
  const start = rowOf('START: ' + startName, startEl);
  const rows = [instr, rub, rowOf('New session', btns(root, /^New session$/)[0]), fld, start];
  rows.forEach(r => { r.fromPanel = r.top === null ? null : r.top - Math.round(rootTop); });
  const four = [instr, rub, fld, start];
  console.table(rows);
  const summary = {
    surface: 'grading-chat', viewport: W + 'x' + H, scrollY: Math.round(scrollY), fold80px: Math.round(fold),
    spanInstructionsToStart: (instr.top === null || start.top === null) ? null : start.top - instr.top,
    bandH_AC_S3: band(four) && band(four).bandH, bandW: band(four) && band(four).bandW,
    cursorPathPx_instr_rubric_field_start: pathPx(four),
    allFourAboveFold: four.every(r => r.aboveFold === true),
    allFourInViewport: four.every(r => r.inViewport === true),
    panelHeightPx: Math.round(root.getBoundingClientRect().height), panelScrollHeight: root.scrollHeight,
    docScrollHeight: document.documentElement.scrollHeight
  };
  console.log(JSON.stringify(summary));
  return summary;
})();
```

**Table to fill** (targets are the grader scope's PROPOSALS, unchecked, ratified or overridden by you; `grader-smooth-scope.md:101` says the numbers are proposals and F5 asks you to ratify them):

| control | stage | current top px | above fold? | scope ESTIMATE (unmeasured) | target (PROPOSED) |
|---|---|---|---|---|---|
| Instructions | A | | | at least about 245 px tall per setup field (`:72`) | visible without scrolling (AC-S1, `:115`) |
| Rubric | A | | | same | visible without scrolling (AC-S1) |
| Composer field | A | | | composer at least about 620 px below the panel top, excluding chrome (`:73`) | visible without scrolling (AC-S1) |
| START: Send / Add | A | | | same | visible without scrolling (AC-S1) |
| bandH (spread of the four centres, the AC-S3 proxy) | A | | n/a | at least about 620 px (`:117`) | at most about 400 px vertical (AC-S3, `:117`; the scope calls this number unvalidated and not derived from anything) |
| START: Send / Add | B, rows 1 | | | at least 1.5 viewports below the panel top once rows accumulate (`:74`) | composer reachable with 0 px of page scroll (AC-S2, `:116`) |
| START: Send / Add | B, about 10 rows | | | same | same; the table scrolls inside its own region only |
| docScrollHeight | A and B | | n/a | no estimate | no target proposed |

Direction of failure: AC-S1 fails if any of the four controls reads `aboveFold` (or `inViewport`, your call) false in stage A; AC-S2 fails if the START row is not in the viewport in stage B (that is, sending submission 2..N needs page scroll); AC-S3 fails if `bandH` is above the figure you ratify. AC-S4 (an intake refusal appears in the same viewport as the composer, `:118`) is not a position measurement: trigger a refusal (for example empty instructions plus a submit) and look.

**Click-count baseline to confirm** (`grader-smooth-scope.md:42-53`, counted by reading, nothing run; convention: mouse click, OS-dialog pick or confirm click, Enter-to-send is the second number): P1 first-time text 6 ; 5. P1b first-time file 7. P1c first-time Canvas URL then post 9 ; 8. P2 returning, same assignment 2 ; 1. P2b returning, different assignment, Canvas and post 6 ; 5. P2c a live session adds 2. P3 another text submission 0-1. P3b K single files 2K. P3c repeat URL 1 ; 1. P4 post all 2. Your confirmed counts: ______

---

## 4. Surface B: walkthrough-announcement panel

**Click path to reach it** (`walkthrough-announcement-clicks-scope.md` section 1, lines 73-97): "Tools" top tab -> "Recording" rail chip (`manual-rail.ts:200`) -> Recording sub-tab "Announcement from a walkthrough" (`RecordingTab.tsx:596`, panel id `rec-panel-walkannounce` at `:879`, mounted `page.tsx:699`). The scope's own arrival table (line 94) records 0 clicks on a return when the last Recording view was this one (`ta-rec-view`), 1 click from another Recording sub-tab, and 2-3 via the floating action button.

**States to record.** (1) Idle: panel open, no draft. Course, Module, Notes, Start and Generate are present; Post is absent (`NOT FOUND OR HIDDEN`), which is expected. (2) With a draft: needs a capture and a model call, so owner-run; the Post row and the slot rows (Format, Written for, Visible, Subject, Message) appear. (3) Post armed: click **Post to Canvas once only**. That arms it and inserts a notice; it does not publish. **Do NOT click "Confirm post"**: that publishes to every student and cannot be recalled (`walkthrough-announcement-clicks-scope.md:391`). Run the snippet again; it prints the Confirm button's shift against the idle Post button (AC-5). Then click Cancel. Run (2) before (3) in the same page session: the snippet remembers the idle Post top in `window.__wtaPostTop` and a reload forgets it.

**Snippet 2 (paste into the console):**

```js
(() => {
  scrollTo({ top: 0, behavior: 'instant' });
  const H = innerHeight, W = innerWidth, fold = 0.8 * H;
  const shown = e => !!e && e.getClientRects().length > 0;
  const lab = (root, p) => {
    const l = [...root.querySelectorAll('label')].find(x => shown(x) && x.textContent.trim().startsWith(p));
    return l ? l.parentElement.querySelector('input:not([aria-hidden="true"]),textarea:not([aria-hidden="true"]),[role="combobox"]') : null;
  };
  const btns = (root, re) => [...root.querySelectorAll('button')].filter(b => shown(b) && re.test(b.textContent.trim()));
  const rowOf = (control, e) => {
    if (!shown(e)) return { control, top: null, bottom: null, left: null, cx: null, cy: null, aboveFold: 'NOT FOUND OR HIDDEN', inViewport: '-' };
    const r = e.getBoundingClientRect(), t = r.top + scrollY, b = r.bottom + scrollY;
    return { control, top: Math.round(t), bottom: Math.round(b), left: Math.round(r.left), cx: Math.round(r.left + r.width / 2), cy: Math.round(t + r.height / 2), aboveFold: b <= fold, inViewport: b <= H };
  };
  const hop = (a, b) => (a.top === null || b.top === null) ? null : { dy: b.top - a.top, dist: Math.round(Math.hypot(b.cx - a.cx, b.cy - a.cy)), underOneViewport: (b.top - a.top) < H };

  const root = document.getElementById('rec-panel-walkannounce');
  if (!shown(root)) return 'Walkthrough panel not visible: open Tools > Recording > "Announcement from a walkthrough" first';
  const pt = root.getBoundingClientRect().top + scrollY;
  const cbx = p => [...root.querySelectorAll('label')].find(x => shown(x) && x.querySelector('input[type=checkbox]') && x.textContent.trim().startsWith(p)) || null;
  const one = re => btns(root, re)[0] || null;
  const legend = [...root.querySelectorAll('legend')].find(x => shown(x) && /^Draft \d+$/.test(x.textContent.trim())) || null;
  const R = {};
  const rows = [
    ['Course', lab(root, 'Course')], ['Module or week', lab(root, 'Module or week')],
    ['Paste a previous announcement', lab(root, 'Paste a previous announcement')],
    ['Use emojis', cbx('Use emojis')], ['Research and cite', cbx('Research and cite')],
    ['Notes', lab(root, 'Notes for this walkthrough')],
    ['START: Start/Stop capture', one(/^(Start|Stop) capture$/)],
    ['GENERATE: Generate announcement', one(/^(Generate announcement|Generating)/)],
    ['Draft legend (slot top)', legend],
    ['Format to match', lab(root, 'Format to match')], ['Written for', lab(root, 'Written for')],
    ['Visible to students', lab(root, 'Visible to students')],
    ['Subject', lab(root, 'Subject')], ['Message', lab(root, 'Message (Markdown)')],
    ['POST: Post to Canvas / Schedule post (idle)', one(/^(Post to Canvas|Schedule post)$/)],
    ['CONFIRM: Confirm post / schedule (armed only)', one(/^Confirm (post|schedule)$/)]
  ].map(([n, e]) => (R[n] = rowOf(n, e)));
  rows.forEach(r => { r.fromPanel = r.top === null ? null : r.top - Math.round(pt); });
  const course = R['Course'], start = R['START: Start/Stop capture'], gen = R['GENERATE: Generate announcement'];
  const post = R['POST: Post to Canvas / Schedule post (idle)'], conf = R['CONFIRM: Confirm post / schedule (armed only)'], lg = R['Draft legend (slot top)'];
  if (post.top !== null) window.__wtaPostTop = post.top; // remembered so a second run, taken with Post armed, can print the shift
  const startFromPanel = start.top === null ? null : start.top - Math.round(pt);
  const postFromLegend = (post.top === null || lg.top === null) ? null : post.top - lg.top;
  console.table(rows);
  const summary = {
    surface: 'walkthrough-announcement', viewport: W + 'x' + H, scrollY: Math.round(scrollY), fold80px: Math.round(fold),
    startFromPanelPx_M_now: startFromPanel,
    AC1_bound_px_valid_on_HEAD_only: startFromPanel === null ? null : Math.min(Math.round(0.65 * startFromPanel), 450),
    postTopMinusSlotLegendTop: postFromLegend,
    AC8_bound_px_valid_on_HEAD_only: postFromLegend === null ? null : Math.round(0.7 * postFromLegend),
    hop_setupToStart: hop(course, start), hop_generateToPost: hop(gen, post),
    confirmTopMinusIdlePostTop_AC5: (conf.top !== null && window.__wtaPostTop !== undefined) ? conf.top - window.__wtaPostTop : 'run once idle (Post visible), click Post once, run again',
    panelHeightPx: Math.round(root.getBoundingClientRect().height), panelScrollHeight: root.scrollHeight,
    docScrollHeight: document.documentElement.scrollHeight
  };
  console.log(JSON.stringify(summary));
  return summary;
})();
```

**Table to fill** (targets are the walkthrough scope's AC-1, AC-5, AC-8 and AC-13, `:433,437,440,445`; the scope says the 0.65, 0.7 and 450 px figures are proposals you may re-set after running its 3.4 snippet on HEAD, `:451-454`):

| control | state | current top px (and fromPanel) | above fold? | scope ESTIMATE (unmeasured) | target (PROPOSED) |
|---|---|---|---|---|---|
| Course, Module, Notes, Paste box | 1 | | | Course/Module near the panel top (`:229-231`) | none |
| START: Start/Stop capture, `startFromPanelPx_M_now` | 1 | | | about 670 to 700 px into the panel (`:229`) | AC-1: at most 0.65 x M_now and at most 450 px at 1280 x 720, M_now being this very reading on HEAD; the snippet prints `AC1_bound_px_valid_on_HEAD_only` = the smaller of the two. Only meaningful for the first (HEAD) run. |
| GENERATE: Generate announcement | 1 | | | directly under the Start row, about 130 px horizontal (`:237-238`) | none numeric; AC-13 hop |
| `hop_setupToStart` (Course to Start) | 1 | dy ___ dist ___ | n/a | about 600 px apart (`:229-231`) | AC-13: under one viewport at 1280 x 720 (`underOneViewport` true) |
| `hop_generateToPost` | 2 | dy ___ dist ___ | n/a | about 760 to 960 px into the slot (`:258`) | AC-13 same |
| POST: Post to Canvas / Schedule post, via `postTopMinusSlotLegendTop` | 2 | | | about 760 to 960 px (`:258`) | AC-8: at most 0.7 x its current value; the snippet prints `AC8_bound_px_valid_on_HEAD_only`. HEAD run only. |
| `confirmTopMinusIdlePostTop_AC5` | 3 | | n/a | about 100 px shift (`:257,273`) | AC-5: absolute value at most 2 px |
| docScrollHeight, panelScrollHeight | any | | n/a | no estimate | no target proposed |

Direction of failure: AC-1 fails if the post-build Start `fromPanel` exceeds `AC1_bound_px_valid_on_HEAD_only` taken on HEAD; AC-8 fails if the post-build Post-minus-legend exceeds `AC8_bound_px_valid_on_HEAD_only` taken on HEAD; AC-5 fails if `confirmTopMinusIdlePostTop_AC5` has absolute value above 2; AC-13 fails if any hop is not `underOneViewport`.

**Click-count baseline to confirm** (`walkthrough-announcement-clicks-scope.md:153-161`, arithmetic over the control table; convention: in-app clicks only, the browser's screen-share picker and the Canvas walk excluded, a MUI select is 2): P1 returning with saved format, immediate post, no edit 5 (Start, Stop, Generate, Post, Confirm post). P2 midweek check-in 7. P3 scheduled 6+. P4 first ever, accept defaults, pick course 7. P5 first ever, everything set 13. P6 editing the draft adds 1. P7 a second walkthrough in one page session is not a counted path. Your confirmed counts: ______

---

## 5. Surface C: Repo Grades

**Click path to reach it** (`repo-grader-smooth-scope.md` section 0, lines 29-33): "Tools" top tab -> "Grading" rail chip (`manual-rail.ts:204`) -> "Repo Grades" (`manual-rail.ts:154`), mounted at `page.tsx:630`. The scope does not count these navigation clicks (residual R9, `:552`).

**Preconditions.** A course with a GitHub org, and a folder selected that has repos, so the grid and its Grade-all and Post buttons exist. If no grid exists the snippet adds a row saying so. Do NOT click Grade all (one model call per repo) or Post.

**Snippet 3 (paste into the console):**

```js
(() => {
  scrollTo({ top: 0, behavior: 'instant' });
  const H = innerHeight, W = innerWidth, fold = 0.8 * H;
  const shown = e => !!e && e.getClientRects().length > 0;
  const btns = (root, re) => [...root.querySelectorAll('button')].filter(b => shown(b) && re.test(b.textContent.trim()));
  const rowOf = (control, e) => {
    if (!shown(e)) return { control, top: null, bottom: null, left: null, cx: null, cy: null, aboveFold: 'NOT FOUND OR HIDDEN', inViewport: '-' };
    const r = e.getBoundingClientRect(), t = r.top + scrollY, b = r.bottom + scrollY;
    return { control, top: Math.round(t), bottom: Math.round(b), left: Math.round(r.left), cx: Math.round(r.left + r.width / 2), cy: Math.round(t + r.height / 2), aboveFold: b <= fold, inViewport: b <= H };
  };
  const band = rs => { const k = rs.filter(r => r.cx !== null); return k.length ? { bandH: Math.max(...k.map(r => r.cy)) - Math.min(...k.map(r => r.cy)), bandW: Math.max(...k.map(r => r.cx)) - Math.min(...k.map(r => r.cx)) } : null; };

  if (!shown(document.getElementById('repo-grades-course'))) return 'Repo Grades not visible: open Tools > Grading > Repo Grades first';
  const ids = [['Course', 'repo-grades-course'], ['Repo filter', 'repo-grades-org-prefix'], ['Assignment folder', 'repo-grades-folder'],
    ['Sort', 'repo-grades-sort'], ['README checkbox', 'repo-grades-use-readme'], ['Only-checked-rows checkbox', 'repo-grades-bulk-selection-only'],
    ['Code-scoring checkbox', 'repo-grades-run-code-scoring'], ['Instructions', 'repo-grades-instructions'],
    ['Rubric source', 'repo-grades-rubric-source'], ['Rubric', 'repo-grades-rubric'], ['Link panel heading', 'repo-grades-link-heading']];
  const rows = ids.map(([n, id]) => rowOf(n, document.getElementById(id)));
  const grade = btns(document, /^(Grade all|Grade \d+ selected|Nothing to grade)/);
  const post = btns(document, /^((Re-post|Post) \d+ grade|Posting)/);
  grade.forEach((b, i) => rows.push(rowOf('GRADE ALL [column ' + (i + 1) + ']: ' + b.textContent.trim().slice(0, 40), b)));
  post.forEach((b, i) => rows.push(rowOf('POST [column ' + (i + 1) + ']: ' + b.textContent.trim().slice(0, 40), b)));
  if (!grade.length) rows.push(rowOf('GRADE ALL (no grid yet: pick a course and a folder that has repos)', null));
  const course = rows[0], folder = rows[2];
  const g1 = rowOf('g1', grade[0] || null), p1 = rowOf('p1', post[0] || null);
  const four = [course, folder, g1, p1];
  console.table(rows);
  const summary = {
    surface: 'repo-grades', viewport: W + 'x' + H, scrollY: Math.round(scrollY), fold80px: Math.round(fold),
    innerHeightAtLeast720_AC5_precondition: H >= 720,
    AC5_allFourAboveFold_course_folder_grade_post: four.every(r => r.aboveFold === true),
    firstGradeTopMinusCourseTop: (g1.top === null || course.top === null) ? null : g1.top - course.top,
    bandH_AC6: band(four) && band(four).bandH, bandW_AC6: band(four) && band(four).bandW,
    AC6_bandWithinLimits_140h_900w_at_1920: band(four) ? (band(four).bandH <= 140 && band(four).bandW <= 900) : null,
    docScrollHeight: document.documentElement.scrollHeight
  };
  console.log(JSON.stringify(summary));
  return summary;
})();
```

**Snippet 4, the AC7 probe.** Scroll by hand until the LAST graded row is on screen, then paste. It does not scroll. Needs graded rows, which spend model calls, so owner-run.

```js
(() => {
  const H = innerHeight;
  const post = [...document.querySelectorAll('button')].filter(b => b.getClientRects().length > 0 && /^((Re-post|Post) \d+ grade|Posting)/.test(b.textContent.trim()));
  return {
    scrollY: Math.round(scrollY), innerHeight: H,
    postButtons: post.map(b => { const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom), onScreen: r.bottom > 0 && r.top < H }; })
  };
})();
```

**Table to fill** (targets are the repo scope's AC5, AC6, AC7, `repo-grader-smooth-scope.md:364-382`, all tagged OWNER there):

| control | current top px | above fold? | scope ESTIMATE (unmeasured) | target (PROPOSED) |
|---|---|---|---|---|
| Course (`#repo-grades-course`) | | | about y 150 (`:228-231`) | AC5: bottom at or above 0.8 x innerHeight, for innerHeight 720 or more, at 1366 x 768 AND 1920 x 1080 (`:373-376`) |
| Assignment folder (`#repo-grades-folder`) | | | about y 330 (`:228-231`) | AC5, same |
| GRADE ALL [column 1] | | | top of Grade all about 1,900 to 2,000 px below the tab card's top edge, before app chrome (`:221-222`, `:374`) | AC5, same; baseline to beat is the 1,900-2,000 figure |
| POST [column 1] | | | stacked within about 100 px of Grade all (`:232-233`) | AC5, same; AC7: still on screen after scrolling to the last graded row, with no scroll back up (`:380-382`) |
| `bandH_AC6` and `bandW_AC6` over Course, Folder, Grade all, Post | | n/a | about 1,850 px of vertical travel (`:228-231`) | AC6: at most 140 px high and 900 px wide at 1920 wide (`:377-379`); snippet prints `AC6_bandWithinLimits_140h_900w_at_1920` |
| Instructions, Rubric (`#repo-grades-instructions`, `#repo-grades-rubric`) | | | two textareas at `min-height: 220px`, 440 px above Grade all (`:215-216`) | none proposed directly; R2 collapses them, saving about 700 px (`:290`) |
| Link panel heading (`#repo-grades-link-heading`) | | | about 375 px (`:221-223`) | none proposed directly (R3 collapses it) |
| Probe: Post `onScreen` after scrolling to the last row | | n/a | none | AC7: `onScreen` true |
| docScrollHeight | | n/a | about 9,000-12,000 px to review 30 graded rows, 300-400 px per row (`:236-241`) | none proposed |

Direction of failure: AC5 fails if any of the four reads `aboveFold` false, or `innerHeightAtLeast720_AC5_precondition` is false and the viewport is smaller than the criterion covers; AC6 fails if either band exceeds its bound; AC7 fails if `onScreen` is false for the Post button. **A wording defect in the scope:** AC5 says the four rects must have `rect.bottom` "at or below 0.8 x innerHeight" (`:373-374`) while also saying it fails "if any exceeds the threshold" (`:375`); the intent, and the rule used here, is `bottom <= 0.8 x innerHeight`. Ratify that reading or correct it.

**Click-count baseline to confirm** (`repo-grader-smooth-scope.md:134-143`, counted by reading, RULING X-1 with setup separate from steady state; convention: a select or Typeahead is 2, OK on `window.confirm` is 1): P1 first time, first folder wanted 10 (12 if another folder). P2 returning, same course, folder, mapping, bindings confirmed 3 (the floor, lower means dropping the Post confirm). P3 returning with a new week's folder 7. P4 per graded repo on the bulk path 3 / N (0.1 at N = 30) plus 1 per hand-edited score. Your confirmed counts: ______

---

## 6. Surface C2: GithubGradingPanel (the repo grader's secondary surface)

**Click path to reach it** (`repo-grader-smooth-scope.md:34-38`): "Tools" -> "Grading" -> "Submissions" (`manual-rail.ts:153`) -> the "Grade from" select (`GradingTab.tsx:281-293`, id `grade-source`) -> "GitHub Repo" (`GradingTab.tsx:293`); the panel mounts at `GradingTab.tsx:326`. The chosen source persists (`repo-grader-smooth-scope.md:158`, citing `GradingTab.tsx:111,133`).

**Preconditions.** Add repos to the queue; the scope's 30-student estimates assume 30 rows (`:252-256`). Importing an org needs a GitHub token, so owner-run. Do NOT click Grade all or Run all tests.

**Snippet 5 (paste into the console):**

```js
(() => {
  scrollTo({ top: 0, behavior: 'instant' });
  const H = innerHeight, W = innerWidth, fold = 0.8 * H;
  const shown = e => !!e && e.getClientRects().length > 0;
  const lab = (root, p) => {
    const l = [...root.querySelectorAll('label')].find(x => shown(x) && x.textContent.trim().startsWith(p));
    return l ? l.parentElement.querySelector('input:not([aria-hidden="true"]),textarea:not([aria-hidden="true"]),[role="combobox"]') : null;
  };
  const btns = (root, re) => [...root.querySelectorAll('button')].filter(b => shown(b) && re.test(b.textContent.trim()));
  const rowOf = (control, e) => {
    if (!shown(e)) return { control, top: null, bottom: null, left: null, cx: null, cy: null, aboveFold: 'NOT FOUND OR HIDDEN', inViewport: '-' };
    const r = e.getBoundingClientRect(), t = r.top + scrollY, b = r.bottom + scrollY;
    return { control, top: Math.round(t), bottom: Math.round(b), left: Math.round(r.left), cx: Math.round(r.left + r.width / 2), cy: Math.round(t + r.height / 2), aboveFold: b <= fold, inViewport: b <= H };
  };

  const D = document;
  if (!lab(D, 'Add a student repository')) return 'GithubGradingPanel not visible: open Tools > Grading > Submissions and set "Grade from" to "GitHub Repo" first';
  const src = rowOf('Grade from (source select)', D.getElementById('grade-source'));
  const add = rowOf('Add a student repository', lab(D, 'Add a student repository'));
  const folder = rowOf('Grading folder', lab(D, 'Grading folder'));
  const lms = rowOf('Pull instructions/rubric from LMS assignment', lab(D, 'Pull instructions/rubric'));
  const ins = rowOf('Assignment instructions', lab(D, 'Assignment instructions (optional)'));
  const refr = rowOf('Reference repo for the rubric', lab(D, 'Reference repo'));
  const rub = rowOf('Rubric', lab(D, 'Rubric (generated'));
  const runT = rowOf('Run all tests (queue header)', btns(D, /^Run all tests$/)[0]);
  const gradeAll = rowOf('GRADE ALL', btns(D, /^(Grade all \(\d+\)|Grading \d+ repo)/)[0]);
  const rows = [src, add, folder, lms, ins, refr, rub, runT, gradeAll];
  const ql = [...D.querySelectorAll('label')].find(x => shown(x) && /^Queue \(\d+\)/.test(x.textContent.trim()));
  const box = ql && ql.parentElement && ql.parentElement.parentElement ? ql.parentElement.parentElement.children[1] : null;
  const qN = box ? box.children.length : null, qH = box ? Math.round(box.getBoundingClientRect().height) : null;
  console.table(rows);
  const summary = {
    surface: 'github-grading-panel', viewport: W + 'x' + H, scrollY: Math.round(scrollY), fold80px: Math.round(fold),
    spanSourceToGradeAll: (src.top === null || gradeAll.top === null) ? null : gradeAll.top - src.top,
    spanAddRepoToGradeAll: (add.top === null || gradeAll.top === null) ? null : gradeAll.top - add.top,
    runAllTestsToGradeAllDy: (runT.top === null || gradeAll.top === null) ? null : gradeAll.top - runT.top,
    queueRows: qN, queueBlockPx: qH, avgQueueRowPx: (qN && qH) ? Math.round(qH / qN) : null,
    docScrollHeight: document.documentElement.scrollHeight
  };
  console.log(JSON.stringify(summary));
  return summary;
})();
```

**Table to fill.** The scope proposes NO acceptance target for this surface (its AC1-AC10 are about Repo Grades; W6 is conditional on fork F1, `repo-grader-smooth-scope.md:432-435,512-514`) and records its px as unmeasured (R7, `:550`). So the target column is blank for you to set, or to leave blank if you decline W6.

| control | current top px | above fold? | scope ESTIMATE (unmeasured) | target |
|---|---|---|---|---|
| Grade from (source select) | | | n/a | none proposed |
| Add a student repository | | | n/a | none proposed |
| Grading folder | | | n/a | none proposed |
| Assignment instructions, Reference repo, Rubric | | | n/a | none proposed |
| Run all tests (queue header) | | | at the queue header, far from Grade all (`:254-255`) | none proposed |
| GRADE ALL | | | well over 2,500 px below the add-repo control on a 30-student queue (`:255-256`) | none proposed |
| `spanAddRepoToGradeAll` | | n/a | same | none proposed |
| `queueRows`, `queueBlockPx`, `avgQueueRowPx` | | n/a | 30 rows at about 55 px each, about 1,700 px (`:252`) | none proposed |

**Click-count baseline to confirm** (`repo-grader-smooth-scope.md:154-176`, counted by reading): first run about 14-15 (source select 2, org Typeahead 2 plus Import 1, Scan folders 1 plus pick 2, LMS pull about 5, Grade all 1), unchanged for new work; a returning run about 2 (re-pull, then Grade all), because instructions and rubric are not persisted (`:171-175`). Your confirmed counts: ______

---

## 7. What happens to the numbers

You paste each snippet's JSON summary and fill the tables. The orchestrator then replaces the scopes' proposed px figures with your measured baselines when the acceptance-criteria seat writes the build waves' criteria: the grader's AC-S1..S4 (F5 asks you to ratify the numbers and the 1366 x 768 reference), the walkthrough's AC-1/AC-5/AC-8/AC-13 (the scope names a re-set after the HEAD run), and the repo AC5-AC7. Where you leave a target blank, the scope's proposal ships flagged "proposed", as each scope already says.

---

## 8. What I could not determine, and the residual register

What was done to these snippets: `node --check` on each (exit 0 for all five), and one run of each against a hand-built fake DOM. For the chat, walkthrough and GithubGradingPanel snippets it mirrors the JSX structure I read (`GradingChatPanel.tsx:128-166`, `ChatComposer.tsx:99-169`, `GithubGradingPanel.tsx:486-570`); for the Repo Grades snippets it is only a flat set of elements carrying the ids, so it does not exercise their DOM structure at all. The fake DOM returns invented rectangles, so it shows the arithmetic and the output shape work; it shows nothing about the real page. The harness is a scratch file, not committed. Selectors were read from source, not observed in a browser.

| Id | Not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| I-1 | Every selector and label match (ids `grading-chat-instructions`, `grading-chat-rubric`, `rec-panel-walkannounce`, `repo-grades-*`, `grade-source`; button and label texts) is read from source at HEAD 519ef6a6, not observed in the rendered DOM | owner | run each snippet; a row reading `NOT FOUND OR HIDDEN` where the control is visibly on screen is a broken selector, and an undetected one means a wrong rect | the first run of each snippet |
| I-2 | The label-to-control helper assumes the control is inside the label's parent element (true in the JSX I read for the chat, walkthrough and Repo Grades fields). For GithubGradingPanel I did NOT open `GithubRepoPicker` or `LmsAssignmentPullSection`, so which element counts as "the" control for "Add a student repository", "Grading folder" and the LMS pull is unconfirmed; the rect may be a wrapper, not the input | owner | first run of snippet 5, eyeball the `top` of those rows against the page | first run of snippet 5 |
| I-3 | Chat panel root is taken as `label.parentElement.parentElement`; that is `div.form` per `GradingChatPanel.tsx:129-131`, not observed | owner | `panelHeightPx` should be close to the whole chat panel height; if it is the height of one field, the root is wrong and `fromPanel` is wrong | first run of snippet 1 |
| I-4 | Positions are from the document top at scroll 0 and include app chrome, which no scope measured; the scopes' estimates exclude it, so a measured value above an estimate is partly chrome | owner | compare the first control's `top` with its `fromPanel` (chat and walkthrough) | first run |
| I-5 | Responsive mode and a real resized window can differ (scrollbar width, device pixel ratio); wrapping breakpoints depend on width | owner | run once in a real window sized to the stated viewport if a number sits near a bound | before ratifying a bound |
| I-6 | The three scopes are unchecked; their proposed targets and click counts are quoted here as proposals, not verified | orchestrator | adversarial check of each scope (the loop-checker seat) | before any build wave consumes them |
| I-7 | No acceptance target is proposed for GithubGradingPanel (snippet 5); whether to set one is a scope decision | owner | fork F1 in `repo-grader-smooth-scope.md:512-514` | owner answers F1 |
| I-8 | AC-S4 (an intake refusal appears in the same viewport as the composer) is not captured by any snippet | owner | trigger a refusal and look | after the chat build wave |
| I-9 | The grader scope's AC-S1 wording ("visible without scrolling") and the 0.8 fold rule disagree for controls between 80 and 100 percent of the viewport height | owner | the snippet prints both `aboveFold` and `inViewport` | owner picks one when ratifying AC-S1 |

---

## 9. Commands and files behind every quantity here

- Line counts: `wc -l docs/grader-smooth-scope.md docs/walkthrough-announcement-clicks-scope.md docs/repo-grader-smooth-scope.md` returned 184, 601, 558 (Bash tool).
- HEAD: `git rev-parse --short HEAD` returned `519ef6a6`. Last commit on the three scopes: `git log --oneline -1 -- <the three>` returned `1decd617`.
- Absence of a grader snippet: Grep for `getBoundingClientRect|innerHeight|scrollHeight|console|DevTools|devtools` over the three scope files matched only `repo-grader-smooth-scope.md` and `walkthrough-announcement-clicks-scope.md`.
- Every `file:line` in sections 2 to 6 was opened. The scope documents were read whole. Source files opened: `GradingChatPanel.tsx:110-199`, `ChatComposer.tsx:95-174`, `page.tsx:520-545,612-640,700-770`, `manual-rail.ts:120-215`, `tab-sections.ts:30-48`, `GradingTab.tsx:276-296,315-335`, `RecordingTab.tsx:590-600`, `AnnouncementCourseFieldset.tsx:112-165,225-252`, `AnnouncementDraftSlot.tsx:114-176,232-252,290-321`, `ConfirmArmButtons.tsx:85-125`, `WalkthroughAnnouncementPanel.tsx:810-884`, `RepoGradesControls.tsx:325-345,474-500`, `RepoGradesGrid.tsx:405-440`, `RepoGradeCellControl.tsx:556-600`, `index.tsx:706-735` of `repo-grades`, `GithubGradingPanel.tsx:470-500,548-575,644-672,708-760`.
- Not opened: `GithubRepoPicker`, `LmsAssignmentPullSection` (see I-2), `ui/Typeahead.tsx` (so which DOM node carries `id="repo-grades-course"` is unconfirmed beyond "an element with that id exists", `RepoGradesControls.tsx:339`).
- Not run: tsc, lint, vitest, build, any browser render. The docs gate (`npm run docs:gate`) result is recorded in the hand-off report for this document, not here.

Disposition table: not applicable. This is a first version, not a restructure of a prior one.
