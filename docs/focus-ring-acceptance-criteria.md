# Acceptance criteria - a visible, compliant keyboard focus indicator

Backlog group A from `docs/SESSION-HANDOFF-2026-08-10.md` section 2.1. That
document listed this work as BLOCKED on two design decisions. Both are taken
below, and both are settled by measurement rather than preference.

**Where the evidence lives.** An earlier revision cited `scratchpad/contrast*.js`
and a headless-Chrome fixture. Neither is committed, so neither could be re-run
by anyone reading this. The reproducible artifact is
`src/app/focusRing.wiring.test.ts`: it implements WCAG relative luminance and
contrast itself, against frozen literal surface lists, and every contrast figure
quoted below is asserted there. Run it rather than trusting this document. The
one claim that genuinely cannot be re-derived from the repo is AC5's clipping
geometry, which needed a real renderer - it is called out as such where it
appears.

---

## The defect

`--focus-ring-color` is a translucent wash. Measured worst case against the
surfaces it actually lands on:

| | value | worst ratio | |
|---|---|---|---|
| light | `color-mix(in srgb, var(--accent) 20%, transparent)` -> `#d3e0fb` | 1.14:1 | fail |
| dark | `color-mix(in srgb, var(--accent-ink) 35%, transparent)` -> `#35547e` | 1.90:1 | fail |

WCAG 1.4.11 Non-text Contrast (Level AA) requires 3:1 against adjacent colours.
This is decoration, not an indicator.

Separately, no MUI button shows a focus ring at all. `ButtonBase` in the
installed version sets `outline: 0` and ships no `.Mui-focusVisible` rule
whatsoever - its own propTypes documentation states that consumers must supply
focus styling. The app's global `:focus-visible` rule has equal specificity
(0,1,0) and emotion injects after the Next stylesheet, so the library wins on
source order.

**Citation correction.** Earlier notes in this repo's handoff cited "2.4.11
Focus Appearance (AA)". In the shipped WCAG 2.2 Recommendation, Focus Appearance
is **2.4.13, Level AAA**; **2.4.11 is Focus Not Obscured (Minimum), Level AA**, a
different criterion with no size or contrast test. The mandatory bar this work
targets is **1.4.11 (AA)**. The existing `1.4.11 / 2.4.7` comment in
`TasksGrid.module.css` was already correct.

---

## AC1 - the token becomes a real indicator

The ring is a THREE-token design. A single token cannot express what this needs,
because a navy container has to override the ring for its subtree while any
light-surfaced descendant has to opt back out - and a raw-hex opt-out would be
wrong in dark theme.

```css
--focus-ring-default   /* theme-aware: #1d4ed8 light, #bfdbfe dark */
--focus-ring-on-navy   /* #bfdbfe, defined ONLY in :root - navy is navy in both themes */
--focus-ring-color     /* what everything paints with; defaults to var(--focus-ring-default) */
```

| theme | `--focus-ring-default` | worst ratio | measured against |
|---|---|---|---|
| light | `#1d4ed8` | **3.40:1** | `--navy-highlight-strong` `#a7b9e0` |
| dark | `#bfdbfe` | **6.18:1** | dark `--navy-highlight-strong` `#364a75` |

Surfaces measured: `#ffffff`, `--surface-subtle`, `--surface-muted`, both stops
of the light page gradient, `--border-soft`, `--accent-soft-strong`, and BOTH
row-highlight tokens `--navy-highlight` / `--navy-highlight-strong`; in dark,
the background, the gradient bottom, paper, both surface tokens and both dark
row highlights. Every one clears 3:1.

**Correction, and why it matters.** An earlier revision of this document claimed
5.75:1 light and 10.30:1 dark. Those were measured over an incomplete surface
list that omitted the row highlights, which are the real worst case. The margin
is 3.40:1, not 5.75:1 - comfortable but far thinner than stated, and the figure
was sitting in a code comment written specifically to stop maintainers
second-guessing the design. The oracle's frozen surface lists now include them,
so the same omission cannot recur silently.

## AC2 - the navy chrome gets a scoped override, because it must

`#1d4ed8` measures **2.21:1** on `--navy`. This is not a case of picking a
better colour: an exhaustive search of the 24-bit colour space found **zero**
colours clearing 3:1 against the full light surface set AND the navy chrome
simultaneously. A local override is forced.

**Be precise about what makes it impossible**, because an earlier revision of
this document got the evidence wrong even though the conclusion was right.
Against only the five base light surfaces plus `--navy` and `--navy-soft`, over
1.5 million colours DO clear 3:1 (`#0077ff` is one). The set becomes infeasible
only once the light-theme row highlights are included: the binding constraint is
`--navy-highlight-strong` `#a7b9e0` against `--navy` `#1a2744`. It is NOT
`--navy-chip`, which the earlier revision cited - and citing it created a real
internal contradiction, since this same AC argues below that `--navy-chip` is
not a ring backdrop at all.

Every navy-backed container that hosts a focusable element declares
`--focus-ring-color: var(--focus-ring-on-navy);` in the same rule that sets its
navy background. Custom properties inherit, so no per-element change is needed.

| container | file |
|---|---|
| `.bar` | `TopBar.module.css` |
| `.lfRail` | `page.module.css` |
| `.lfDetail` | `page.module.css` |
| `.bulkBarHead` | `page.module.css` |
| `.ccItem:hover` | `page.module.css` |

`--focus-ring-on-navy` (`#bfdbfe`) measures 10.43:1 on `--navy`, 8.79:1 on
`--navy-soft`, 4.99:1 on `--navy-chip` (which resolves to `#4b5970`), and
**3.67:1** on the institution switcher's `.lessonInnerTabs` wash (`--field-border`
40% over navy, resolving to `#616d83`). That 3.67:1 is the true floor for this
token - tighter than any figure the earlier revision recorded - so a future
change to `--field-border` could push it under 3:1. It is the same value the
dark theme already uses, so this introduces one new colour in total, not two.

(The earlier revision put `--navy-chip` at 6.27:1. That came from a hand-estimated
flatten rather than a computed `color-mix`; the computed value is `#4b5970`.)

**Do NOT add the override to `login.module.css .page` or
`account/security/security.module.css .page`.** The reason given in the earlier
revision - "both are navy" - is wrong for login: in LIGHT theme `login .page` is
`linear-gradient(135deg, #f8fafc, #eef2ff)`, near-white, and it is navy only
under `html[data-theme="dark"]`, where the default ring is already `#bfdbfe`.
`security .page` genuinely is `var(--navy)`. Either way both host every
interactive control inside a nested WHITE `.card`, so an override there would put
a 1.42:1 ring on the login inputs. Getting the right answer from the wrong reason
is worth correcting, because the reason is what a maintainer reuses.

### The rule, stated so it cannot be misread

`outline-offset: 2px` paints the ring 2px OUTSIDE the focused element's border
box. The colours the ring is adjacent to are therefore the **parent's** fill, on
both sides - not the focused element's own background.

So:

- An element that **contains** what takes focus (a dropdown panel, a modal, a MUI
  `FormControl` root wrapping the real `<input>`) needs the reset, because the
  ring lands on its fill.
- An element that **is** what takes focus (a button, an icon button, a chip)
  needs **nothing**, however light its own background - its ring lands on
  whatever it sits on.

This is the single most misread rule in this change. Three separate implementers
independently reasoned "this element paints `--field-background`, so it is a
light surface, so it needs the reset," and each was wrong. One of those reached
the working tree: a reset was added to `.ccPublish` and reverted, because forcing
the light default there gives **1.86:1** on `--navy-soft` while hovered, replacing
a passing 8.79:1 indicator with a failing one. The fix was a regression.

Worked examples, all measured:

| element | what it is | ring lands on | correct |
|---|---|---|---|
| `.menu` (Settings dropdown) | white panel containing links/buttons | its own white fill | **reset** |
| `.previewModal` | white modal containing Close/textarea | its own white fill | **reset** |
| `.ccDueInput` | MUI FormControl root; the inner `<input>` focuses | its own white fill | **reset** |
| `.ccPublish` | a MUI Button | `.ccItem` (navy-soft on hover) | no reset |
| `.ccDue` | a MUI Button filled `--navy-chip` | `.ccItem` | no reset |
| AccessibilityPill | a MUI Button | the navy `.bar` | no reset |
| Switcher tab | a `role="radio"` button | `.lessonInnerTabs` wash | no reset |

## AC2b - the three resets, and why they are load-bearing

`TopBar.module.css .menu`, `page.module.css .previewModal` and
`page.module.css .ccDueInput` each declare
`--focus-ring-color: var(--focus-ring-default);`.

Without them, `--focus-ring-on-navy` inherits onto a white fill at **1.42:1** -
which is worse than making no change at all, since those controls would otherwise
have received the default ring at 6.70:1. The oracle asserts both the presence of
each reset AND that `--focus-ring-on-navy` measures under 3:1 on `#ffffff`, so
the resets are pinned as necessary rather than as decoration. It also asserts the
negative direction for `.ccPublish` / `.ccDue` / `.ccDueEmpty`, so the reverted
regression cannot come back.

`.previewModal` is the instructive one: `page.module.css` already carries about
fifteen `.lfDetail .x` rules dark-theming that subtree, and this element was
simply missed by that sweep. A container-scoped override is only as complete as
the sweep that re-skins its descendants.

## AC3 - MUI buttons receive the ring

`theme.ts` gains:

```ts
MuiButtonBase: {
  styleOverrides: {
    root: {
      "&:focus-visible": {
        outline: "2px solid var(--focus-ring-color)",
        outlineOffset: 2,
      },
    },
  },
},
```

Verified against the installed source, not from memory: this compiles to
`.css-hash:focus-visible`, specificity **(0,2,0)**, which beats ButtonBase's own
`outline: 0` at (0,1,0) regardless of injection order. No `:where()` appears
anywhere in that code path. `cssVariables` / `colorSchemeSelector` only wraps
ancestor colour-scheme selectors in `:where()`, never the component's own class,
so it does not interact.

Reach confirmed by reading each component's root definition: Checkbox, Radio and
Switch (via `SwitchBase`), plus Tab, MenuItem, IconButton and ListItemButton all
render a real `ButtonBase`.

**CSS layers remain off and must stay off.** The theme-level option in this
version is `modularCssLayers`, not `enableCssLayer` (that name now exists only as
a `StyledEngineProvider` prop, and this app renders no such provider). Both are
confirmed unset. Enabling either remains disqualified: `globals.css` has an
unlayered `* { padding: 0; margin: 0 }`, unlayered CSS beats layered regardless
of specificity, and every MUI component would lose its padding.

**This AC switches on focus rings that have never been visible.** Roughly twenty
MUI buttons across the app currently show nothing at all on keyboard focus. That
is the point of the change, but it means the navy inventory in AC2 had to be
exhaustive up front rather than caught by eye later.

## AC3b - a dark surface a CSS sweep structurally cannot see

`GeneratePanel.tsx` applies its slide fill as an INLINE style
(`<Card style={{...slideStyle}}>`), including `background: "#1a2744"` for the
"classic" theme, and hosts three `TextField`s and three `Button`s directly on it.
A CSS-only survey cannot find this, and AC3 makes it visible for the first time
by switching on rings that never rendered before - at 2.21:1.

The fill is **user-configurable arbitrary hex** (`backgroundColor` /
`backgroundColor2` in `src/lib/decks/types.ts`), not a fixed set, so a static map
would only have covered the classic case. The fix computes it:
`needsOnNavyFocusRing()` in `src/lib/focus-ring-fill.ts` classifies a fill as dark
by WCAG luminance (checking both stops for a gradient) and the panel sets
`--focus-ring-color` in the inline style object accordingly. Pure and
dependency-free, so it stays client-safe.

Generalisable point: any surface painted from JS rather than CSS is invisible to
a stylesheet audit. This one was found by an adversarial reviewer reading
components, not by grepping CSS.

## AC4 - the two non-focus consumers keep their exact appearance

Exactly two rules consume `--focus-ring-color` for something other than a focus
indicator. A new token `--accent-wash` carries the token's OLD expression
verbatim, per theme, and both repoint to it:

- `.lfCardSelected` / `.lfCardSelected:hover` - `background`
- `.deadlinesUploadStatus` - `border`

```css
/* :root */                --accent-wash: color-mix(in srgb, var(--accent) 20%, transparent);
/* html[data-theme=dark] */ --accent-wash: color-mix(in srgb, var(--accent-ink) 35%, transparent);
```

Because the expression is unchanged, both rules compute to exactly what they
render today. This is a provably zero-visual diff for them.

**Why not `--accent-soft`, which the handoff proposed.** `.lfCardSelected` sits
inside `.lfRail`, which is `background: var(--navy)` - and `--navy` is never
redefined for dark mode, so that rail is navy in BOTH themes.
`--accent-soft` is `field-background 88% + accent 12%`, i.e. near-white in light
theme. It would have put a near-white slab on a permanently navy rail.

**The second, less obvious reason the token must be separate.** AC2 scopes a
`--focus-ring-color` override onto `.lfRail`. `.lfCardSelected` lives inside
`.lfRail`. Had the non-focus consumers stayed on the ring token, that override
would have silently repainted every selected card's background. Two concerns
that inherit down the same tree need two tokens.

`.deadlinesUploadStatus` currently has no JSX consumer on `main` - its component
lives only in an unrelated detached worktree - so it renders nothing today. It is
fixed anyway, correctly, for whenever that feature lands.

## AC5 - the Tasks grid does not paint a double ring

`.gridFocusRing:focus-visible` keeps its inset ring and gains `outline: none`.

The grid's focusable cells are plain `th`/`td`/`button` elements that set no
`outline: none`, so they already receive the global outline today, layered on top
of their own inset ring. It is invisible only because the token is translucent.
The moment AC1 lands, every focused cell paints both.

Keeping the inset ring and suppressing the outline is correct for two
independently measured reasons:

1. **The inset ring was already compliant.** `--accent-ink` measures 4.63:1
   worst in light and 4.66:1 in dark, including against the warning tint
   composited over the cell. The CSS comment attributes the choice to the
   app-wide token falling under 3:1; what this change makes obsolete is that
   *reason*, not the ring's adequacy.
2. **The outline is physically broken inside this grid.** A fixture mirroring
   `.scrollRegion` (`overflow: auto`, `border-radius: 14px`) with a sticky
   frozen column, rendered in headless Chrome: the ring's **top edge is clipped
   away entirely** by the scroll container's padding box, and its **left edge is
   painted over** by the `position: sticky; z-index: 1` frozen column, while a
   normal body cell is `position: static` and paints below it. Only the right
   and bottom edges survive - a two-sided ring. The inset ring in the same
   fixture renders whole.

`.scrollRegion:focus-visible` already reached the same conclusion for the
viewport by using `outline-offset: -2px` (inward).

## AC6 - nothing else changes meaning

The other 21 consumers of `--focus-ring-color` all use it as an `outline` inside
a `:focus` / `:focus-visible` rule. No consumer anywhere wraps the token in
`color-mix`, `rgba()` or an opacity at the point of use, so none of them change
meaning when the input stops being translucent. No `.ts` or `.tsx` file
references the token at all.

---

## Tests

No test in the repo asserts anything about focus styling, `--focus-ring-color`,
`outline`, or `.gridFocusRing`. vitest here is node-env and collects only
`src/**/*.test.ts`, so no component is ever rendered.

That does not mean this change is untestable. A test can read the CSS from disk
and compute the contrast itself. Required:

1. **A contrast oracle.** Parse both `--focus-ring-color` declarations out of
   `globals.css`, parse the surface tokens, compute the WCAG ratio in the test,
   and assert >= 3:1 against a FROZEN literal list of surfaces. Frozen literals,
   not values re-read from the same file - otherwise the test re-derives the
   answer from the thing it is checking and can never fail.
2. **A sabotage canary that is run and seen to fail.** Feed the oracle the
   pre-change values (`#d3e0fb`, `#35547e`) and assert it rejects them. Write
   this BEFORE the change and confirm it fails against HEAD.
3. The navy override exists on each of the five containers in AC2, and does
   NOT exist on the two login/security pages.
4. `--accent-wash` is defined in both theme blocks, and neither non-focus
   consumer references `--focus-ring-color` any more.
5. `theme.ts` defines `components.MuiButtonBase.styleOverrides.root` with a
   `&:focus-visible` entry whose outline references the token.
6. `.gridFocusRing:focus-visible` sets `outline: none` and keeps its inset
   box-shadow.

Pin the FACT and the ORDERING, never the spelling. Assertions that pin literal
source text have twice in this project forced worse implementations.

## Two existing tests read files this change edits

- `taskNoteIndicator.wiring.test.ts` parses `globals.css` by slicing the dark
  block from `html[data-theme="dark"] {` to the first `\n}`. Adding tokens inside
  that block is safe provided no stray brace is introduced. Its
  `declaration(darkBlock, "--accent") === ""` assertion is NOT tripped by
  `--accent-wash`: the helper's regex requires `${prop}\s*:`, and the block's
  existing `--accent-ink` already proves that suffix case behaves. It also
  full-text-parses `TasksGrid.module.css`, which AC5 edits.
- `page-module-css-classes.test.ts` fails if `.lfCardSelected` is renamed or
  removed while `LiveFeedPanel.tsx` still references it. Repoint its value; do
  not rename the class.

## Verification is not available through the running app

The app cannot render locally: `src/middleware.ts` throws
`Your project's URL and Key are required` on every route including `/login`, so
the dev server returns 500/404 for everything. This is the same missing-local-env
limitation that makes `npm run build` exit 1 after "Compiled successfully".
Visual checks go through headless-Chrome fixtures.

## Out of scope, recorded deliberately

- `InputBase` sets `&:focus { outline: 0 }` at (0,2,0), so text inputs beat the
  global rule on specificity. They are not left without an indicator - the
  outlined notch recolours to `primary.main` (5.17:1 on white) - so this is a
  separate, non-blocking problem.
- `HtmlEditor.tsx` sets `outline: "none"` on a contentEditable div, removing its
  native indicator with nothing in its place. Pre-existing, untouched here.
- `.instInput`, `.liveFeedTableWrap` and `.bulkBtnPrimary` are dead selectors on
  `main` with no JSX consumer. Not revived, not deleted, just recorded.
