# Uploaded PowerPoint Slide Editor decisions

This records the implementation reading after the architecture's second check.

## Working-package contract

The browser owns the working `.pptx` bytes for the active page session. Each
direct edit or accepted regeneration sends the latest package bytes and a
replacement list for exactly one slide. The server derives the supported
paragraph IDs for that slide from those bytes, rejects any out-of-slide ID,
and returns the updated package. Repeating this operation on the returned
package composes accepted edits across slides without trusting a client-built
full-deck replacement map or storing an uploaded deck on the server. A
regeneration request sends the current package to the authenticated route so
the route can derive the selected slide's supported paragraphs; only that
derived text and the user's instruction reach the LLM. Candidates are
one-for-one replacements and remain client-side until accepted.

## V1 boundaries

- Slide order must match the presentation relationship order. The editor fails
  closed when the existing paragraph editor's numeric member order differs.
- Existing library limits apply: no more than 80 slides and 24,000 extracted
  text characters. Upload and every returned package must fit the 3.5 MiB
  base64 wire budget.
- Slides with no supported text are listed but cannot be regenerated. Text in
  field nodes, breaks, or mixed paragraph structures is not claimed as
  editable. Direct edits are limited to existing text paragraphs and preserve
  the slide count and order.
- The package writer retains untouched package parts. It may flatten mixed
  inline formatting in an edited paragraph; visual fidelity for representative
  files remains an owner/browser and PowerPoint check.
- The accepted criteria requested regeneration for any selected slide. This
  V1 limitation is explicitly disclosed in the UI and tracked for owner
  verification; it does not silently show a disabled action without reason.

## Evidence and residuals

The architecture's round-two checker found that a full replacement map could
not safely compose edits when the server authorized only one slide. This
decision resolves that blocker with the package-per-operation contract above.
The test instrument must prove a replacement from another slide is refused,
repeated accepted changes can be applied to different slides and exported,
and unchanged slides' package members stay unchanged. Owner/browser and
PowerPoint verification remains required for rendered appearance, keyboard
behavior, mixed formatting, relationships and candidate quality.
