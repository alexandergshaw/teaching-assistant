# FAB open animation - UX + scoping pass

Author: loop-seat (UX + scoping). Date: 2026-10-12. Status: DRAFT for the
adversarial check. Production files edited by this pass: NONE (`git status
--short src` returned empty before and after this pass was written).

Owner request, verbatim: "need an animation for the fab when it's opened".
Owner style direction (relayed by the coordinator): "smooth, sleek, clean".

Every quantity below names the command that produced it. Where I could not
measure, I say so (section 11).

---

## 0. One-paragraph answer

There is exactly ONE floating action button in the app: the MUI `Fab` at
`src/app/components/FabQuickActionsMenu.tsx:182`. Clicking it opens a MUI
`Menu` of six quick actions (`:144-178`). Today the trigger itself does not
animate at all (its glyph is a static sparkle), and the menu already runs MUI's
DEFAULT `Grow` transition with an AUTO duration (computed ~280-300 ms, not
measured - section 2). So the baseline is "partial": the menu grows in, the
button does not react. Recommended: (a) the trigger glyph cross-rotates from the
sparkle to an X over 200 ms on open and 150 ms on close, and (b) the menu's
existing `Grow` is TUNED (explicit 200/150 ms, a non-overshooting ease-out)
instead of replaced. No stagger, no spring, no new keyframes. Reduced-motion is
already handled globally and must NOT get a second mechanism.

---

## 1. Locate the FAB

Commands: `Grep "Fab\b|SpeedDial|fab|floating" src` (74 files matched, almost all
comments or `fab`-named helpers), then `Grep "material/Fab|<Fab\b|SpeedDial"
src --include=*.tsx`.

| Candidate | Where | Is it "a FAB that opens"? |
|---|---|---|
| MUI `Fab` quick-actions trigger | `src/app/components/FabQuickActionsMenu.tsx:182-206`, mounted once from `src/app/components/AiChatFab.tsx:803-815`, which `src/app/layout.tsx:175` mounts for every route | YES. The only MUI `Fab` in `src` (the `material/Fab` grep returns only `FabQuickActionsMenu.tsx:55,182`). |
| `.fab` CSS class | `src/app/page.module.css:5045` | NO. Dead. `Grep "styles\.fab\b|\.fab\b" src` finds no `styles.fab` consumer, and `docs/css-orphans.md:114` lists `.fab` as an orphan. The live Fab is styled by `sx` (`FabQuickActionsMenu.tsx:190-203`). Do NOT revive this rule. |
| `.selectionAiButton` | `src/app/page.module.css:4022`, used from `SelectionChatWidget.tsx:190` | NO. A 28 px (`--control-height-sm`) circle that appears on a text selection and starts a chat; it is not opened and does not open a menu. |
| SpeedDial | none | The old SpeedDial was replaced by the Menu (header comment `FabQuickActionsMenu.tsx:3-6`; `Grep SpeedDial` finds only comments). |

How "open" is tracked: `const [anchorEl, setAnchorEl] = useState<HTMLElement |
null>(null); const open = Boolean(anchorEl);` (`FabQuickActionsMenu.tsx:116-117`).
The trigger toggles it (`:126-128`), ArrowUp/ArrowDown open it (`:133-138`), the
Menu's `onClose` and every item click close it (`:119-124`, `:213`).
`aria-expanded={open}` is already wired (`:186`), `aria-label="Quick actions"`
is a static string (`:184`).

What renders when it opens: a MUI `<Menu>` (`:209-255`) with `anchorOrigin`
top/right and `transformOrigin` bottom/right (`:214-215`), i.e. the menu sits
directly above the button, right-aligned, and expands upward. Six items
(`:144-178`: chat, live-class, checklist, legibility, recording-tools,
accommodations). Note the header comment at `:45` says "five entries" - it is
stale since N7 added the sixth; not my change to make.

Why the Fab stays clickable while the menu is open (this matters because the
open-state icon is itself a close control): the Fab is `zIndex: 9999`
(`FabQuickActionsMenu.tsx:194`) and MUI's modal default is 1300, so the Fab sits
above the menu's backdrop and `handleTriggerClick` toggles it closed
(`:127`).

Which FAB the owner means: the quick-actions Fab, with high confidence, because
it is the only one. The residual ambiguity is not "which button" but "which thing
opens": the menu, or the floating windows (AI chat, Live Class, Checklist) that a
menu item then opens. See fork F2 (section 9).

---

## 2. Current transition - baseline

Quoted from the tree:

- Trigger button: no motion of its own. The Fab's `sx` (`:190-203`) sets
  position/colour/shadow and `"&:hover": { background: ... }` only. MUI's own
  Fab transitions only `background-color`, `box-shadow`, `border-color`
  (`node_modules/@mui/material/Fab/Fab.js:55`). The glyph `<MenuTriggerIcon />`
  (`:205`) is a static sparkle SVG (`fab-icons.tsx:103-115`). Nothing rotates,
  swaps or fades when `open` flips.
- Menu: NOT instant. `<Menu>` is given no `transitionDuration`, so it takes
  MUI's default `'auto'` (`node_modules/@mui/material/Menu/Menu.js:79`), and
  Popover wraps the paper in `Grow` by default
  (`node_modules/@mui/material/Popover/Popover.js:292`). `Grow` animates
  `opacity` and `transform: scale(x, x^2)` from 0.75 (so scale(0.75, 0.5625))
  (`Grow.js:20-45`). Because the Popover sets the paper's transform-origin to
  the menu's bottom-right (`FabQuickActionsMenu.tsx:215`), it grows out of the
  button's top-right corner.
- Auto duration is a function of the menu's rendered height:
  `Math.round((4 + 15 * (h/36)**0.25 + (h/36)/5) * 10)`
  (`node_modules/@mui/material/styles/createTransitions.js:40-48`). I evaluated it
  with `node -e` for plausible heights: 200 px -> 281 ms, 232 px -> 292 ms,
  260 px -> 300 ms, 300 px -> 312 ms. The real height is UNMEASURED (no
  component renders here), so "about 280-310 ms, exit about the same" is an
  estimate, not a fact. In `Grow` the transform runs for 0.666 of the duration and
  the opacity channel runs the full duration on the THEME default easing
  (`Grow.js:79-81`: opacity gets `{duration, delay}` with no `easing`); only
  the transform channel receives the `easing` prop (`Grow.js:83-86`).
- Global motion rules already in force: `src/app/globals.css:105-106`
  (`--transition-fast: 120ms ease`, `--transition-base: 180ms ease`) and the
  reduced-motion block `src/app/globals.css:413-421` (sets `animation-duration`,
  `animation-iteration-count`, `transition-duration` to `0.01ms !important` on
  `*`, `*::before`, `*::after`).

Baseline verdict: PARTIAL. Menu = default auto-duration Grow (approximately
0.3 s, which is slower than the owner's "sleek 150-250 ms"); trigger = static.
The most likely reason the owner reads this as "no animation" is the static
trigger (nothing about the button itself changes), plus a Grow whose start scale
is already the MUI default every other popover shares and so reads as nothing
special. I cannot confirm that perception from here.

---

## 3. Design - "smooth, sleek, clean"

### 3.1 Vocabulary reused (greps, so nothing is invented)

| Idiom in the tree | Citation | Use here |
|---|---|---|
| `cubic-bezier(0.2, 0, 0, 1)` at 230 ms | `src/app/components/content-tab/modules/useDragReorder.ts:83` | The ease-out curve. Fast departure, long soft landing, both control y-values inside [0,1] so it cannot overshoot. |
| `cubic-bezier(0.32, 0.72, 0, 1)` at 320 ms | `src/app/components/AccessibilityCenter.tsx:94-95`, applied at `:319` | Not used (320 ms is outside the owner's range); cited as the second ease-out in the tree. |
| `--transition-base: 180ms ease` "disclosure, panel state" | `src/app/globals.css:106`, `docs/aesthetics-pass-acceptance-criteria.md:103-107` | The nearest token to a menu disclosure; my 200 ms sits just above it because the owner asked for 150-250. |
| MUI `Grow` as the popover transition | `Popover.js:292` | Kept - it is what every Menu/Select/Popover in the app already uses, so the FAB menu stays in the same family. |
| `@keyframes` | `globals.css:407` (`ta-spin`), `page.module.css:4329`, `:4751`, `columnDrag.module.css:66`, `RecordingControls.module.css:274`, `DiscussionRepliesPanel.module.css:358` | None are entrance transitions; none reused. This design needs no keyframes - transitions on a state change are enough. |
| Reduced motion | single global block, `globals.css:413-421`; the comment at `globals.css:103-104` and `aesthetics-pass-acceptance-criteria.md:106-107` say "do not add a second mechanism" | Reused as-is. |

### 3.2 What animates (and what deliberately does not)

1. TRIGGER GLYPH (new). Two stacked 24 px layers inside the Fab, cross-faded
   and quarter-turned on the single `open` boolean that already exists:
   - sparkle layer: closed = `opacity 1, rotate(0deg)`; open = `opacity 0,
     rotate(90deg)`.
   - X layer (new `FabCloseIcon`, 24 px, `strokeWidth 1.5`, `currentColor`,
     `aria-hidden`, same family as `fab-icons.tsx:103-115`): closed = `opacity 0,
     rotate(-90deg)`; open = `opacity 1, rotate(0deg)`.
   Reading: the sparkle spins away a quarter turn while an X spins into place, a
   conventional and unmistakable "this is now a close control", and the sparkle
   (deliberately chosen at `fab-icons.tsx:95-102`) is untouched at rest.
2. MENU PAPER (tuned, not replaced). Keep `Grow`. Make the timing explicit and
   shorter: `transitionDuration={{ enter: 200, exit: 150 }}` and an easing via
   `slotProps.transition.easing` (see 3.3).
3. NOT animated, on purpose: per-item stagger (owner said not "staggered-heavy";
   it also adds per-item code against `MenuList`'s roving-tabindex contract, header
   `:20-23`); FAB scale/pulse/bounce; shadow growth; backdrop dimming (the
   backdrop is invisible today and stays so).

### 3.3 Numbers (all in ONE leaf so they are testable)

| Quantity | Value | Why |
|---|---|---|
| Open duration (menu + glyph) | 200 ms | Inside the owner's 150-250; between `--transition-base` 180 and `useDragReorder` 230. |
| Close duration (menu + glyph) | 150 ms | Exit shorter than enter: a close should get out of the way; bottom of the owner's range. |
| Easing, transform channel and glyph | `cubic-bezier(0.2, 0, 0, 1)` | Reused from `useDragReorder.ts:83`. y1 = 0, y2 = 1: no overshoot, so it can never read as bouncy or springy. |
| Glyph rotation | 90 deg out / -90 deg in | Quarter turn: noticeable but not flashy. |
| Menu start state | `Grow` default scale(0.75, 0.5625) + opacity 0 | Not configurable through MUI's props (`Grow.js:20-45`). Honest limit: this is more scale than "subtle". See fork F1. |
| Direction, open | menu unfolds up and left from the button's top-right corner (existing `transformOrigin`); glyph sparkle -> X | |
| Direction, close | reverse, at 150 ms; the glyph reverses in step because both key off the same `open` | The glyph's transition reads the TARGET state: on close it uses the close duration. |

Because `Grow` runs its transform channel for 0.666 of the configured duration
(`Grow.js:90-102`, `:130-133`) and its opacity channel for the full duration, the
menu's visible scale motion lasts about 133 ms on open and 100 ms on close while
the fade completes at 200/150. That is intentional "sleek" and is a consequence of
MUI's implementation, not a number I chose; stated so the checker does not read
the 200 as the scale duration.

Easing caveat, said plainly: the `easing` prop reaches only the transform channel
(`transitions/utils.js:101-112` and `Grow.js:83-86`). The menu's opacity channel
stays on MUI's theme default `cubic-bezier(0.4, 0, 0.2, 1)`
(`createTransitions.js:12`), which is also non-overshooting. I did not fight it.

### 3.4 Reduced motion - nothing to add

The global block (`globals.css:413-421`) forces `transition-duration: 0.01ms
!important` on every element. That wins against both the glyph's inline
`transition` (inline normal declarations lose to author `!important`) and against
`Grow`'s inline `node.style.transition` (`Grow.js:79-86`). So under
`prefers-reduced-motion: reduce` the glyph snaps and the menu snaps.
This is a CASCADE READING; no browser rendered it here (section 11, R1). Do NOT add
`useMediaQuery`/`matchMedia`: the tree's own rule is one mechanism
(`globals.css:103-104`). One known seam, existing today and not made worse:
`Grow`'s react-transition-group timeout (150 ms on exit) still holds the invisible
paper mounted for that long after the visual snap, so the invisible backdrop can
still intercept a click for up to 150 ms (today it is the ~300 ms auto duration).

---

## 4. Write set

All paths are in `src/app/components/`. The first three are production, the last
two are tests.

| File | Change | Lines now (`wc -l < file`) | Estimated after |
|---|---|---|---|
| `fab-motion.ts` (NEW, plain `.ts` leaf, no React runtime import) | constants `FAB_OPEN_MS`, `FAB_CLOSE_MS`, `FAB_EASING`, `FAB_MENU_TRANSITION_MS = {enter, exit}`, `FAB_MENU_EASING = {enter, exit}`, and pure `fabIconLayerStyle(layer: "sparkle" \| "close", open: boolean): CSSProperties` (type-only import from `react`) | n/a | ~60 |
| `FabQuickActionsMenu.tsx` | import the leaf; replace `<MenuTriggerIcon />` at `:205` with a 24x24 stack of two layers styled by `fabIconLayerStyle`; add `transitionDuration` and `slotProps.transition.easing` to the `<Menu>` at `:209-217`; update the header comment | 260 | ~300 |
| `fab-icons.tsx` | add `export function FabCloseIcon()` (24 px X, `aria-hidden="true"`, `focusable="false"`) next to `MenuTriggerIcon` | 115 | ~130 |
| `fab-motion.test.ts` (NEW) | unit oracle, section 6.1 | n/a | ~90 |
| `FabQuickActionsMenu.wiring.test.ts` | append source-text pins, section 6.2 (the file already exists and already has the `keepMounted` guard) | 79 | ~140 |

Files deliberately NOT in the write set, with the reason:
- `AiChatFab.tsx` - 951 lines (`wc -l`), under the 1000 ceiling by 49 but it needs
  no change: `FabQuickActionsMenu` owns the trigger and the menu.
- `page.module.css` - not touched. Measured 7075 lines (`wc -l <
  src/app/page.module.css`). There is NO line ceiling on CSS: the ceiling test only
  enumerates `.ts`/`.tsx` (`src/file-size-ceiling.structure.test.ts:106`,
  `/\.(ts|tsx)$/`), so a CSS module near 1000 is unguarded either way, and this
  design adds no CSS at all (inline style objects + MUI props). The dead `.fab`
  rule at `:5045` stays dead.
- `globals.css`, `theme.ts` - no new tokens and no theme-wide transition override;
  a theme override would retime every MUI popover in the app (blast radius far
  beyond the owner's request).

Ceiling risk: none. Largest touched file after the change is
`FabQuickActionsMenu.tsx` at about 300 lines. Measure at gate time with
`wc -l < <file>` (this repo's mandated count; `docs/loop/this-repo.md:195`).

Reachability check (the surface is a layer): the new exports are called from
`FabQuickActionsMenu.tsx`, which `AiChatFab.tsx:803` mounts and `layout.tsx:175`
mounts globally. The wiring test in 6.2 pins that the wiring file imports and uses
every export, so the leaf cannot ship dead.

Other tests that read these files and must stay green:
`src/app/components/accommodations/accommodations.structure.test.ts:27-30` and
`accommodations.wiring.test.ts:42` read `FabQuickActionsMenu.tsx` as source. The
first scans it for `ta-accom-*` keys (exact set must stay two); the new code adds
no `ta-` string, and must not (also `componentStorageKeys.structure.test.ts` scans
`src/app/components/` non-recursively for `ta-` tokens: use `data-` or none, and
do not write the literal `ta-` after a non-alphanumeric in any comment).

---

## 5. Acceptance criteria

Each pass condition names: the object compared, the instrument producing each
quantity, and the direction of failure. Rendered motion is not machine-checkable
here; criteria that depend on it are marked OWNER-WALK and are not claimed proven.

AC1 - Timing in range. Object: `FAB_OPEN_MS`, `FAB_CLOSE_MS` exported from
`fab-motion.ts` versus the owner's "roughly 150-250 ms". Instrument: vitest
assertion in `fab-motion.test.ts` (imports the constants). Pass: 150 <= CLOSE <=
OPEN <= 250. Fails if either constant leaves the range OR close exceeds open.

AC2 - Cannot overshoot. Object: the easing string `FAB_EASING`. Instrument: the
test parses the four numbers out of `cubic-bezier(a, b, c, d)`. Pass: a and c in
[0,1] (valid curve) and b and d in [0,1] (no overshoot, i.e. not springy). Fails if
any y value is below 0 or above 1, or the string is not a `cubic-bezier(...)`.

AC3 - Glyph states frozen. Object: `fabIconLayerStyle(layer, open)` output for the
four (layer, open) pairs versus a hand-written literal table (opacity and transform
exactly as in 3.2). Instrument: vitest `toEqual` on those fields. Pass: all four
match. Fails if any layer shows the wrong glyph for the state, the rotation sign
flips, or an opacity is not 0/1.

AC4 - Glyph timing follows the TARGET state. Object: the `transition` string
returned for `open=true` versus `open=false`. Instrument: vitest substring checks
for `${FAB_OPEN_MS}ms` and `${FAB_CLOSE_MS}ms` plus `FAB_EASING`. Pass: open uses
the open duration, closed uses the close duration, both name `opacity` and
`transform`, both use `FAB_EASING`. Fails if the two directions share a duration
or either omits a property.

AC5 - Menu is wired to the same constants. Object: the `<Menu ...>` opening tag in
`FabQuickActionsMenu.tsx`. Instrument: `readFileSync` source-text test (existing
`extractMenuOpenTag` helper, `FabQuickActionsMenu.wiring.test.ts:16-26`). Pass: the
tag has a `transitionDuration=` whose value is NOT the string `"auto"` and
references an identifier imported from `./fab-motion`, and the file's
`slotProps` carries `transition` with an `easing` from the same module. Fails if
`transitionDuration` is absent or `"auto"`, or the easing is a literal that can
drift from the glyph's.

AC6 - Both glyphs mounted, both decorative, label stable. Object:
`FabQuickActionsMenu.tsx` source and `fab-icons.tsx` source. Instrument: source-text
test. Pass: the file renders `MenuTriggerIcon` AND `FabCloseIcon` inside the Fab;
`aria-label="Quick actions"` remains a static string literal (no `open ?` ternary
on it); `aria-expanded={open}` remains; `FabCloseIcon`'s `<svg` carries
`aria-hidden="true"`. Fails if either glyph is dropped, the accessible name is made
dynamic (a screen reader would announce "Close" on a control whose role is still
"Quick actions"), or the new svg is exposed to AT.

AC7 - One reduced-motion mechanism. Object: `FabQuickActionsMenu.tsx`,
`fab-motion.ts`, and `globals.css`. Instrument: source-text test. Pass: neither
TS file contains `prefers-reduced-motion`, `matchMedia` or `useMediaQuery`; AND
`globals.css` still contains the `@media (prefers-reduced-motion: reduce)` block
with `transition-duration` and `!important`. Fails if either TS file grows a second
mechanism, or the global block is deleted/weakened (the animation would then run
for users who asked for none).

AC8 - Existing contracts untouched. Object: `keepMounted` absence, the six `actions`
entries, the `accommodations` entry shape. Instrument: the existing
`FabQuickActionsMenu.wiring.test.ts` and the two accommodations tests listed in
section 4. Pass: all still green with the same assertions. Fails if any goes red
(a regression: e.g. `keepMounted` added to make the close animation easier).

AC9 - OWNER-WALK, smooth/sleek/clean (not machine-checkable here). Object: the
rendered Fab and Menu. Instrument: the owner opening the app. Pass: open and close
read as one continuous, quiet motion; the glyph and the menu start and end
together; nothing overshoots, wobbles or flashes; with the OS "reduce motion"
setting on, both snap with no motion. Fails if the menu appears before or after the
glyph turns, the glyph jumps rather than turns, or any motion persists under
reduce-motion.

AC10 - No new gate failures. Object: tsc, eslint, and the new/touched files.
Instrument: `npx tsc --noEmit` (no output, one caller only), `npm run lint` (pass =
exit 0 and no NEW warning in the touched files, measured against the same command
run before the change; do not pin a count, `docs/loop/this-repo.md:26`), and the
test run in section 8. Fails on any new tsc output, new lint warning in a touched
file, or red test.

---

## 6. Structure / source pins (nothing renders under vitest here)

### 6.1 `fab-motion.test.ts` - pure unit oracle

Covers AC1-AC4. The AC3 table is a FROZEN LITERAL (do not derive it from the
function under test, per `docs/loop/traps-tests.md` on refactors and oracles):

| layer | open | opacity | transform |
|---|---|---|---|
| sparkle | false | 1 | `rotate(0deg)` |
| sparkle | true | 0 | `rotate(90deg)` |
| close | false | 0 | `rotate(-90deg)` |
| close | true | 1 | `rotate(0deg)` |

Also assert both layers carry `pointerEvents: "none"` (the Fab is the only click
target) and `FAB_MENU_TRANSITION_MS` equals `{ enter: FAB_OPEN_MS, exit:
FAB_CLOSE_MS }`.

### 6.2 `FabQuickActionsMenu.wiring.test.ts` - appended pins

Covers AC5-AC8. Pin the FACT and the ordering, not the spelling
(`docs/loop/traps-tests.md`, "Source-text tests over-specify"): that the file
imports from `./fab-motion`; that the `<Menu` opening tag contains
`transitionDuration=` not followed by `"auto"`; that `FabCloseIcon` and
`MenuTriggerIcon` both appear between `<Fab` and `</Fab>`; that the `aria-label`
attribute value is a plain string literal; that neither TS source matches
`/prefers-reduced-motion|matchMedia|useMediaQuery/`; that `globals.css` contains
the reduced-motion block. Fail-closed extraction: like the existing helper, throw a
readable error when an anchor (`<Fab`, `</Fab>`) is not found so a restructure
cannot make the pin pass vacuously.

---

## 7. Sabotage mutations (each must turn exactly the named test red)

Apply to a COPY-backed working file (back up with `cp` first; `git checkout --` on
an uncommitted file destroys the chunk's work - `docs/loop/traps-tests.md` and
memory "Sabotage restore needs a copy"). No two agents sabotage on the tree at
once.

| # | Mutation | Expected red |
|---|---|---|
| M1 | `FAB_EASING` -> `cubic-bezier(0.34, 1.56, 0.64, 1)` (springy) | AC2 test |
| M2 | `FAB_OPEN_MS` -> 400 | AC1 test |
| M3 | `FAB_CLOSE_MS` -> 100 | AC1 test |
| M4 | `FAB_CLOSE_MS` -> 260 (close longer than open and out of range) | AC1 test |
| M5 | swap sparkle open opacity to 1 | AC3 oracle |
| M6 | flip the close layer's closed rotation to `rotate(90deg)` | AC3 oracle |
| M7 | make `fabIconLayerStyle` ignore `open` when choosing the duration | AC4 test |
| M8 | delete `transitionDuration` from the `<Menu>` (restores MUI 'auto') | AC5 pin |
| M9 | set `transitionDuration="auto"` explicitly | AC5 pin |
| M10 | remove `<FabCloseIcon />` from the Fab | AC6 pin |
| M11 | `aria-label={open ? "Close" : "Quick actions"}` | AC6 pin |
| M12 | remove `aria-hidden="true"` from `FabCloseIcon` | AC6 pin |
| M13 | add `useMediaQuery("(prefers-reduced-motion: reduce)")` to the menu | AC7 pin |
| M14 | delete the `@media (prefers-reduced-motion` block from `globals.css` | AC7 pin |
| M15 | add `keepMounted` to `<Menu>` | existing `keepMounted` guard (AC8) |

Each mutation is reverted from the cp backup and the test is re-run green before
the next. Evidence required in the verify report: the per-mutation red/green
lines, not a summary.

---

## 8. Gate commands (verification report quotes the per-argument lines)

Multi-file check, so the wrapper, not raw vitest (`docs/loop/this-repo.md:51-66`):

```
npm run test:paths src/app/components/fab-motion.test.ts src/app/components/FabQuickActionsMenu.wiring.test.ts src/app/components/accommodations/accommodations.structure.test.ts src/app/components/accommodations/accommodations.wiring.test.ts src/app/components/componentStorageKeys.structure.test.ts src/file-size-ceiling.structure.test.ts src/source-bytes.structure.test.ts src/lib/no-emojis.test.ts
```

Pass: every argument prints `COVERED`; any `NOT COVERED` fails the gate. Plus,
as separate single callers: `npx tsc --noEmit` (no output) and `npm run lint`
(exit 0, no new warning in touched files). The build gate is the `Compiled
successfully` line only (`this-repo.md:94-95`). Run `git status --short` against
this write set (section 4) before the verify, and confirm no
`.claude/worktrees` copy was edited (`this-repo.md:270-275`).

---

## 9. Forks (each with my recommended reading; default ON, nothing ships dark)

F1 - Tune MUI's `Grow` (recommended) versus replace it with a custom
fade+translate transition component.
- Recommended: TUNE. It is a handful of props, keeps the menu in the same family
  as every other MUI popover in the app, and cannot disturb the `keepMounted`
  invariant or focus management. I am starting from this reading.
- Cost of being wrong: `Grow`'s start scale (0.75 x 0.5625, `Grow.js:20-45`) cannot
  be reduced through props. If the owner finds it too large on the walk, the
  follow-up is a ~25-line custom transition component passed as
  `slots.transition` (Popover accepts any component here, `Popover.js:292-312`),
  replacing the prop tuning; the glyph work and the constants leaf are reused
  unchanged. Rework is one file plus pins, not a redo.

F2 - Scope: animate only the trigger and its menu (recommended), or ALSO the
floating windows the menu items open (AI chat, Live Class, Checklist Overview).
- Recommended: trigger + menu only. Reasons, all from the tree: the windows are
  mounted by `{chatOpen && <AiChatWindow/>}` etc. (`AiChatFab.tsx:865-933`) and
  their open state is PERSISTED (`readLS("chat-open", false)` at `:87`, same for
  live-class `:88`, checklist `:96`), so they mount already-open on every reload;
  an entrance animation would replay on every page load unless it is guarded by a
  first-render flag. `AiChatWindow` is also shared with `SelectionChatWidget`
  (`SelectionChatWidget.tsx:7`), so an entrance there changes a second surface.
  The windows also have no transition rule today (`page.module.css:5080-5096`,
  `.chatModal`, has none).
- Cost of being wrong: if "when it's opened" meant the chat window, this ships the
  wrong thing and the owner redirects with one message; the window entrance then
  becomes its own item (own scope, own two rounds). Filing it as a separate backlog
  row is the orchestrator's step; I have not edited `docs/BACKLOG.md`
  (`Grep` of `docs/BACKLOG.md` for FAB + animation/transition/motion finds no
  existing row).

F3 - Glyph on open: sparkle -> X (recommended) versus rotate the sparkle only.
- Recommended: sparkle -> X. An X is the established "this closes it" affordance
  and the Fab really is a working close control while open (section 1, z-index).
  Cost of being wrong: dropping the X layer is a deletion of one layer and its
  pins; rotate-only is a strict subset.

Nothing here needs an owner decision to start; all three are acted on as my
reading, recorded as mine, not as owner rulings.

---

## 10. Diagnostics representation and leverage claim

- Leverage claim (DEV_LOOP "Criteria"): not applicable. This is a presentational
  polish of an existing control; it builds no capability a user newly reaches
  (DEV_LOOP: the claim is for "a capability a user reaches - not a bug fix, a
  refactor, ..."). Stated, not assumed.
- Diagnostics representation (DEV_LOOP, owner 2026-10-11): none, and justified.
  The change adds no data path and no new failure mode: no fetch, no persisted key,
  no state beyond the existing `open` boolean. A pure presentational change is the
  exception DEV_LOOP names. If a checker disagrees, the only candidate failure
  worth surfacing is "the transition never ran", which no app-level diagnostic can
  observe.
- Persisted-control rule (memory "Persist UI control state"): no new control. The
  Fab's open state is intentionally ephemeral and stays so.
- Emoji rule: none introduced; `src/lib/no-emojis.test.ts` is in the gate.

---

## 11. Residual register

| # | Not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R1 | The rendered motion: that open/close reads smooth, sleek and clean; the glyph and menu stay in step; reduced-motion snaps both (the cascade argument in 3.4) | repo owner | the owner opening the app in a real browser, with and without the OS "reduce motion" setting (AC9). This environment renders no component (`this-repo.md:134-139`, `:262-264`) and the app cannot be driven without env vars (`:259-261`) | the post-push owner walk; recorded as one backlog row by the orchestrator |
| R2 | The real menu height, hence the true current auto-duration (my 280-310 ms is a formula evaluation, not a measurement) | repo owner | browser devtools (computed `transition-duration` on the Menu paper while it opens) during the same walk | R1 walk; informational only, does not gate the change |
| R3 | Whether Grow's fixed start scale is "subtle enough" (fork F1) | repo owner | the same walk | R1 walk; if no, the F1 follow-up item |
| R4 | Whether the owner meant the floating windows (fork F2) | repo owner | one reply to the owner, riding alongside the build | answered before or at the R1 walk |
| R5 | Backlog row and REGRESSION baseline for the Fab menu's motion: BACKLOG has no FAB-animation row; `docs/REGRESSION.md` mentions `FabQuickActionsMenu` only for the accommodations work (`grep -a -n FabQuickActionsMenu docs/REGRESSION.md`, entries near line 42641) | orchestrator | `grep -a` for the new entry, per DEV_LOOP "Baseline" | filed at disposal / the batched regression pass for this group; I did not write either (out of my write set) |

---

## 12. What I could not determine

- Any pixel value or timing as actually rendered (no render, section 11 R1/R2).
- Whether the browser honours a stylesheet `!important` over MUI's inline
  `node.style.transition` exactly as I argue in 3.4 - I am confident of the cascade
  rule (author `!important` beats inline normal) but this is a reading, not a run.
- Whether `Menu`'s `slotProps.transition.easing` reaches `Grow` in the installed
  MUI 9.0.1 exactly as read: I traced `Menu.js` -> `Popover.js:286-312` ->
  `utils.js:101-112` by reading, not by running it; the implementer's first
  `tsc` plus the AC5 pin only prove the prop type-checks and is present, not that
  it takes effect. Folded into R1.
- Sonnet-tier caveat: this is an authored scope; the checker should attack the
  Grow-channel claims in sections 2 and 3.3 hardest, since they rest on my reading
  of vendored MUI source (`Grow.js`, `Popover.js`, `utils.js`, `createTransitions.js`).

---

## 13. Measurement log (command -> quantity)

| Quantity | Command |
|---|---|
| Only MUI Fab is `FabQuickActionsMenu.tsx:55,182` | `Grep "material/Fab\|<Fab\b\|SpeedDial" src --include=*.tsx` |
| `page.module.css` 7075 lines | `wc -l < src/app/page.module.css` (also `awk 'END{print NR}'`, same) |
| `FabQuickActionsMenu.tsx` 260, `AiChatFab.tsx` 951, `fab-icons.tsx` 115, `FabQuickActionsMenu.wiring.test.ts` 79, `globals.css` 421 | `wc -l < <file>` |
| Auto durations 281/292/300/312 ms for 200/232/260/300 px | `node -e` evaluating the `createTransitions.js:47` formula |
| MUI 9.0.1 | `grep '"version"' node_modules/@mui/material/package.json` |
| Ceiling test scans only `.ts/.tsx` | `src/file-size-ceiling.structure.test.ts:106` (opened) |
| `.fab` orphan | `Grep "styles\.fab\b\|\.fab\b" src` and `docs/css-orphans.md:114` |
| Reduced-motion single block | `Grep prefers-reduced-motion src/app/globals.css` (`:413-421`); 17 occurrences repo-wide across 10 files (`Grep -c`); I did not open the nine non-global files, so I do not claim what they do |
| Production files unchanged | `git status --short src` (empty) |
