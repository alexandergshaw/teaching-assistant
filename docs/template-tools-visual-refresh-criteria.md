# Template tools visual refresh acceptance criteria

## Evidence and scope

The two surfaces are currently visually inconsistent: `src/app/components/powerpoint-templates/index.tsx` uses an unstyled section, native controls and a plain library list, while `src/app/components/document-templates/index.tsx` mixes utility classes and individually styled controls. Adjacent presentation tools establish reusable patterns in `src/app/components/TabHeader.tsx`, `src/app/components/presentations/index.tsx`, and `src/app/components/presentations/pipeline/PipelineTab.tsx`: consistent headings, shared spacing tokens from `src/app/globals.css`, and outlined cards. Reuse one visual shell and token system across both tools while preserving each tool's natural sequence of steps.

This is presentational work. Preserve existing upload, analysis, review, save, reopen, fill/reuse, download, validation, and diagnostic behavior. It introduces no data path or failure mode, so no new diagnostic representation is required.

## Acceptance criteria

1. **Shared visual shell, natural workflows.** Both tabs use the app's heading hierarchy (Presentations eyebrow, tool title, task-oriented subtitle), typography, spacing, colors, borders, and radii. Use existing tokens, not one-off styling. Each tool retains its own sensible step order; the document abstraction/review/fill flow need not mirror PowerPoint classify/reuse. Group upload, library, review, and output actions into visibly distinct panels. Every panel has a semantic heading.

2. **Action hierarchy and states.** In each reachable state, exactly one next-step action is visually primary; secondary actions have lower visual emphasis. Empty, selected-file, busy, review, saved/reopened, success, and error states are identifiable from visible labels or messages, not color alone. Disabled controls visibly look disabled and expose a reason in adjacent text or accessible description.

3. **Scannable previews.** PowerPoint slides remain in source order, each slide's extracted text and role control are visibly grouped with its ordinal, and long text wraps within the panel. Document paragraphs remain in source order; retained and proposed replacement text have explicit labels, and original text remains available for changed paragraphs. Neither preview causes page-level horizontal overflow.

4. **Responsive geometry.** Verify at 1280×800, 390×844, and 320×720 CSS pixels. At all sizes, `document.documentElement.scrollWidth <= window.innerWidth`; no panel, text, or interactive target extends beyond the viewport; no targets overlap; and controls wrap or fill their panel. At 1280×800 and 390×844, the page title, current primary action, and saved-library heading are reachable without horizontal scrolling. Record their bounding rectangles; at mobile, panels are in one column.

5. **Theme and keyboard.** In both light and dark themes, record computed foreground/background pairs for body text and primary/secondary controls; each text pair meets 4.5:1 contrast and each control boundary/focus indicator pair meets 3:1, using a WCAG contrast calculation on the measured colors. Tab/Shift+Tab reaches every control in DOM reading order; each focused control has a visible indicator; Enter/Space activates the focused button; labels identify inputs and file controls.

6. **Behavior and test limits.** Existing relevant tests, type checks, and lint gates pass. Component tests in this repository do not render UI, so they do not satisfy any visual criterion.

## Required browser evidence

Use an authenticated browser against the build being reviewed. Save a matrix at `docs/evidence/template-tools-visual-refresh/matrix.md` and screenshots in that same directory, named `<tool>-<state>-<width>x<height>-<theme>.png`. The matrix has one row per exercised **tool × viewport × theme × state**, with screenshot path, recorded geometry/overflow result, contrast measurements, keyboard result, and any residual. Cover both tools at all three viewport sizes and both themes for each reachable state:

- PowerPoint Templates: empty library, file selected, analysis busy, slide-role review, saved/reopened, and error.
- Document Templates: empty library, file selected, abstraction busy, paragraph review, saved/reopened/fill, and error.

Reach transient busy/error states using normal browser throttling or a naturally failing request; do not alter production behavior merely to stage screenshots. If a state cannot be reached, put `unverified` in each affected matrix cell and name the owner plus exact follow-up instrument. If the authenticated browser or backing service is unavailable, record that residual; do not claim visual acceptance from source tests, type checking, or a feature branch alone.

## Round-two disposition and residuals

The owner chose to proceed with the recommended reading after the two-round criteria activity. These unresolved checks remain explicit residuals:

- **Leverage framing.** Owner: loop coordinator. Instrument: compare the final diff with `docs/loop/leverage.md` and record whether the change remains presentational, preserving the existing saved and reusable template workflows without claiming a new capability. Step: as-built review before closing the visual-refresh activity.
- **Contrast failure direction.** Owner: visual verifier. Instrument: for every tool, theme, and reachable state in the evidence matrix, record each measured foreground/background pair for body text, controls, boundaries, and focus, then compute its WCAG contrast. Any text pair below 4.5:1, non-text pair below 3:1, missing focus indicator, overlap, or target outside the viewport fails that cell. Step: final authenticated-browser pass.

## As-built review residuals

- **Busy-disabled control explanations.** Round-two independent check found that these controls are disabled while work is running without an associated reason: PowerPoint template name/source inputs, reload-library action and saved-library open actions; Document Templates fill inputs. Owner: UI implementer. Instrument: focused review of the listed controls in `src/app/components/powerpoint-templates/index.tsx` and `src/app/components/document-templates/index.tsx`, then independent source check that each busy-disabled control references visible reason text or the busy status through `aria-describedby`. Step: a new, separately bounded follow-up activity; the two-round implementation activity is closed.
- **Rendered UI evidence.** The app runtime stops before rendering because local Supabase URL/key configuration is absent; the deployed app requires authentication. Owner: app owner. Instrument: authenticated browser against a configured build, with the required states, viewports, themes, geometry, keyboard and contrast captured in `docs/evidence/template-tools-visual-refresh/matrix.md`. Step: before closing the visual-refresh backlog row. The current matrix is entirely unverified and contains no screenshots.
- **Leverage check.** The final change is presentational: it reuses `TabHeader`, app tokens and the existing upload, review, save, reopen, fill, download and reuse actions. It claims no new mechanism from `docs/loop/leverage.md`; the feature remains useful as a persistent in-app workflow already present in the saved templates. This conclusion is based on the final diff, not on a rendered browser check.

## Owner disposition

On 2026-10-16 the owner chose to publish the reviewed layout with residuals. This closes the current two-round implementation activity. The busy-disabled control explanations and all authenticated-browser screenshots, geometry, contrast, and keyboard evidence remain explicit follow-up obligations; they are not accepted as verified. The visual-refresh backlog row stays open until those obligations are completed.
