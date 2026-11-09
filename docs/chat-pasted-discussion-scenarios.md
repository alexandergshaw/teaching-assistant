# Pasted discussion boards: scenario audit

This is an intake and verification matrix, not a claim that the application can
recognize every learning platform or that a source-only test renders the UI. Use
synthetic names and content in fixtures. A pasted board is untrusted input, not
instructions to the parser or grader.

## Current path and risks

`pastedSubmissions.ts` recognizes multiple explicit `Student:`, `Student name:`
or `Name:` headings, optionally numbered, or nonempty blocks separated by a line
of hyphens. It does not recognize a typical copied discussion listing. When it
returns no rows, `SubmissionDrop.tsx` exposes a single-student name and Grade
text path; an entire unrecognized board can therefore be submitted under one
name. A heading or separator within a student's prose can also create a false
boundary. Existing rows are editable and reviewed before the multiple-row
handler submits them sequentially, halting after a refusal or uncertain result.

The handler passes each row as a plain text composite through `ChatComposer.tsx`,
`GradingChatPanel.tsx` and `prepareCompositeSubmissionAction`. It does not build
the `discussionAxes` produced by the Canvas discussion extraction path in
`src/lib/grade/extraction.ts`. Parsing names alone does not establish that
initial posts and replies are scored on the intended separate rubric axes.

## Scenario matrix

| Area | Cases to exercise | Required outcome |
| --- | --- | --- |
| Existing input | Explicit and numbered headings, standalone separators, single entry, blank lines, CRLF and Unicode | Preserve supported behavior. Do not identify numbered prose as a person or silently turn a failed multi-person parse into one student's grade. |
| Discussion listing | Repeated thread titles, unread markers, author followed by posting date/time, multiple paragraphs, counts and profile or last-post metadata | Recognize only a supported unambiguous shape. Never use a last-reply author or navigation label as the post author. Account for all non-whitespace text as a contribution, identified metadata, or a visible unresolved remainder. |
| Layout variants | Canvas, Brightspace, Blackboard or Moodle style copies; locale/date/time-zone variations; edited, deleted, anonymous or missing authors; alternate reading order | Exercise representative synthetic samples; do not claim broad platform support from one fixture. Unknown or incomplete layouts must stay reviewable and cannot silently dispatch as attributed rows. |
| Boundaries | Multiple paragraphs, quotations, code blocks, pasted links, a literal `Name:` or `Student:` line in a post, horizontal rules, timestamps and title-like prose | Preserve the original contribution content; ambiguous boundaries require a visible correction, not an automatic split. Preserve links as text; disclose material that plain-text paste cannot retain. |
| Identity | Multiple posts from one person, same display name for different people, punctuation, apostrophes, hyphens, diacritics, right-to-left and non-Latin names, case/Unicode normalization, overlong names | Do not silently merge people or infer an identity from a similar name. Ask for resolution where unique identity is not supported by evidence. Validate against `CHAT_LABEL_MAX_CHARS` in `chatSubmissionIntake.ts` and detect collisions after the exact downstream normalization. |
| Replies and nesting | Initial post plus replies, peer replies, nested replies, author replying to self, no initial post or no replies, unknown parent and repeated participant | Preserve and classify contributions only when evidence supports the distinction. Do not claim two-axis grading unless the actual entry carries validated initial/reply axes to the engine; otherwise explicitly disclose the scoring scope and hold ambiguous parts. |
| Partial and malformed | Partial selection, clipped first/last record, missing timestamp or body, duplicate headers, mixed recognizable and unrecognized blocks, preamble and footer, empty posts, malformed dates | Expose uncertainty and all unassigned text. A plausible subset is not proof that the full paste was parsed. Require resolution before affected work is submitted. |
| Size and content types | Large boards and individual posts; UTF-8 and JSON wire expansion; attachments, images, rich formatting, inaccessible links and truncated source text | Check both intake and model limits. Name omitted or unavailable material and do not grade it as though complete. A refusal must leave input available for correction. |
| Review and dispatch | Edit names/content, remove or combine entries deliberately, same-name collisions, rapid repeated Grade, partial acceptance, refusal, network rejection, session reset and reload | Show editable segments and unresolved material before affected dispatch. Preserve accepted/uncertain status, stop after uncertain outcomes, and never automatically repeat paid grading. Review must allow a person to resolve ambiguity without losing source text. |

## Evidence and verification

- Unit tests should pin literal synthetic fixtures, author ownership, contribution
  boundaries, exact body coverage, and explicit uncertainty. Include negative
  cases that look like headers in prose and mixed supported/unsupported blocks.
- Handler-level tests should prove paste to review to actual per-student grading
  inputs, edited corrections, duplicate/overlong identities, no single-student
  fallback for a recognized ambiguous board, and partial/refused/uncertain retry
  behavior. Validate grading-axis behavior at the actual engine boundary when
  reply scoring is offered.
- Tests should exercise configured limits and verify that a clipped or missing
  attachment is not presented as complete evidence. Live provider behavior and
  external course rendering require separate verification.
- An authenticated browser walk must check large-paste responsiveness, desktop
  and narrow layouts, keyboard/focus, visible source coverage and edits, and the
  final review before grading. Never submit real student work merely to verify
  the UI without the appropriate authorization.
