# Lecture Slide Spec

The rules every Gemini-generated lecture deck follows, captured so the same
structure can be reproduced by any other slide generator (e.g. the Course Engine
API). This describes slide content and ordering; rendering is a separate concern
(see the bottom section).

## 1. Slide object shape

```jsonc
{
  "title": "string",            // required
  "bullets": ["string", ...],   // required (may be empty array)
  "code": "string",             // optional; raw source with real newlines
  "codeLanguage": "string"      // optional; e.g. "python", "javascript"
}
```

A deck is `{ "presentationTitle": "string", "slides": [ ... ] }`.

## 2. Deck-level ordering

1. Slide 1 - Title / overview. Lists the key topics/objectives. No code.
2. Body. Walk the objectives in order. Each objective produces a concept slide
   (prose, no code); if that concept is a coding concept, the concept slide is
   immediately followed by a fixed 4-slide unit (section 3).
3. Non-coding concepts produce just the concept slide (no unit).
4. (Optional) a references/sources slide at the end.

## 3. The coding-concept unit

A coding concept (loop, conditional, variable, function, class, data structure,
etc.) MUST be followed immediately by exactly these four slides, in this exact
order:

| # | Title prefix | Purpose | `code` content | `bullets` |
|---|---|---|---|---|
| 1 | `Example:` | Demonstrate the concept with a correct, self-contained snippet | The worked example (+ `codeLanguage`) | <=1 short caption |
| 2 | `Walkthrough:` | Explain that example line by line | Identical to the Example's code | Line-by-line explanation (several bullets) |
| 3 | `Practice:` | Pose a simple coding challenge on the same concept | Identical to the Example's code - a reference only | 1-2 bullets stating the task |
| 4 | `Answer:` | Correct, runnable solution to that practice challenge | Its own distinct solution code (+ `codeLanguage`) | <=1 caption |

Pattern per coding concept:

```
Concept (no code) -> Example -> Walkthrough -> Practice -> Answer
```

Title prefixes (`Example:`, `Walkthrough:`, `Practice:`, `Answer:`) are
significant - downstream logic uses them to identify slide roles.

## 4. Code-attachment rules

- Concept / title / references slides: never carry code.
- All four unit slides carry `code` + `codeLanguage`. None of
  Example/Walkthrough/Practice may be left codeless.
- There is exactly one "reference snippet" per concept: the Example's code. The
  Walkthrough and the Practice slides BOTH display that same reference snippet,
  verbatim.
  - The Practice slide's code is a read-only reference, giving students a worked
    example to consult while they attempt the challenge.
  - The Practice slide must NOT contain the solution to its challenge, a
    partial/starter version of the solution, or any code that reveals the
    answer. It is not "modified starter code" - it is the unchanged Example
    snippet.
- Only the Answer slide carries the solution to the practice challenge, as its
  own distinct code (different from the reference snippet).
- Enforcement to apply: scan slides in order, remembering the most recent
  `Example:` slide's `code`/`codeLanguage`. For every following `Walkthrough:` or
  `Practice:` slide, overwrite its code with that remembered reference snippet -
  not "fill if missing," but a hard override, so a generated Practice snippet can
  never leak the answer. Never touch `Answer:` slides.

## 5. Bullet limits

- Small counts: the lesson-planning path uses max 3 bullets, the lecture-deck
  path max 4. Each bullet is one self-contained idea.
- The Walkthrough legitimately uses its full budget for the line-by-line
  explanation.

## 6. Non-programming modules

If the module teaches no programming: omit `code`/`codeLanguage` everywhere and
omit the entire Example/Walkthrough/Practice/Answer unit - concept slides only.

## Rendering (informational)

How this repo renders the slides above. Another generator that emits its own
`.pptx` can mirror this or not.

- Code + 2 or more bullets (the Walkthrough case) -> two columns: code left,
  bullets right, full height - avoids clipping.
- Code + at most one caption (Example / Practice / Answer) -> stacked: caption on
  top, full-width code panel below.
- No code (concept / title) -> bullets use the full content area.

The shared renderer lives in `src/lib/pptx.ts` (`buildSlidesPptx`); the slide
data is produced by the Gemini slide actions in `src/app/actions.ts`
(`generateLessonPlanAction` and `generateSlidesForAssignment`), with
`propagateExampleCodeToFollowups` enforcing the section 4 reference-code rule.
