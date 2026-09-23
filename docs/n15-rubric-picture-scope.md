# N15-rubric-picture: scope

Backlog row `N15-rubric-picture` (`docs/backlog.yml:173`, located by
`grep -n "N15-rubric-picture" docs/backlog.yml`). This document is a SCOPE, not a
design and not a plan: it establishes what exists, what the model path costs, where
the walls are, and which fork the owner still owns. The shape of the remedy belongs
to an architect pass that consumes this.

**Authored by a Sonnet seat. A fresh checker on a stronger model reads this before
its consumer does.** Written to be checked: every quantity names the command that
produced it, every absence claim is paired with a canary run through the same
instrument in the same call, and everything I could not determine is named rather
than filled in.

## 0. The epistemic key, and the instruments

Three labels are used throughout and they are not interchangeable:

- **MEASURED** - produced in this checkout today (2026-09-23) by the command shown.
- **READING CLAIM** - traced from a control to the code behind it by opening the
  file. **Nothing renders under vitest here** (`docs/loop/this-repo.md:109-114`:
  node env, `src/**/*.test.ts` only, no jsdom, no render call), so every claim about
  markup, focus, keyboard behaviour or what an instructor sees is a reading claim.
- **NOT DETERMINED** - stated, never inferred. **No model call can be exercised
  here**: there is no `.env` and the network is blocked under vitest
  (`docs/loop/this-repo.md:122-128, 218-227`), so nothing below asserts what Gemini
  actually returns for any image.

Greps were run from the repo root through the Bash tool (Git Bash); line counts were
taken with BOTH instruments (PowerShell `@(Get-Content $f).Count` and Bash
`wc -l < $f`), because this repo has two counters that disagree.
`Measure-Object -Line` is never used.

### 0.1 One correction to a cited document, measured

`docs/a39-architecture.md:931` cites `src/file-size-ceiling.structure.test.ts:39`
for `LIMIT = 1000`. MEASURED: `grep -n "LIMIT = " src/file-size-ceiling.structure.test.ts`
returns `41:const LIMIT = 1000;`, and `grep -n "lineCount > limit"` returns `140`.
The value is right, the line is two off. Cite `:41` and `:140`.

---

## 1. The finding that reframes the row, and the disposition against A39

**The row's own instrument names a modal that the row's own named surface does not
render.** The row is titled "on the assignment-upload grading tool" and its
instrument cites `RubricInputModal.tsx:127`. MEASURED:

```
grep -rn "RubricInputModal" src --include=*.tsx --include=*.ts
#   -> renders at GradingRecordingPanel.tsx:979 and SnapshotGradingPanel.tsx:948 only
grep -n "Modal|onPaste|onDrop|dataTransfer" src/app/components/GradingTab.tsx   # (alternation)
#   -> 3 lines, all of them TYPE imports or comments about FilePreviewModal; exit 0
```

`GradingTab.tsx` - the zip/Canvas/Live Feed/GitHub upload surface, path A in
`docs/a39-census.md` - renders no rubric modal, no paste handler and no drop handler.
Its rubric is a bare MUI multiline `TextField` with `name="rubric"`
(`GradingTab.tsx:309-322`) inside `<form action={formAction}>` (`:228`), backed by
plain `useState("")` at `:79-80`. So "add an image path to the rubric modal on the
assignment-upload tool" describes a combination that does not exist.

**This is the first thing an architect must settle and it is a product fork, not a
derivation.** Section 9 states it with a recommendation.

### 1.1 Overlap with A39, and who owns what

`docs/a39-architecture.md` is committed and its waves already write most of the files
N15 would want. MEASURED by reading its wave tables at `:1193-1341`:

| File | A39 wave that writes it | What N15 would want to do to it |
|---|---|---|
| `src/app/components/GradingTab.tsx` | waves 1, 2, 4, 5 | add an image intake beside the rubric field |
| `src/app/components/grading-recording/RubricInputModal.tsx` | wave 3b | widen `ACCEPTED_EXTENSIONS` and add a vision path |
| `src/app/components/grading-recording/GradingRecordingPanel.tsx` | wave 3a (extraction) + 3b | caller |
| `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` | wave 3a + 3b | caller |
| `src/app/components/grading-recording/grading-rows.test.ts` | wave 3b (canary bump) | same canary |
| `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` | wave 3b (canary bump) | same canary |
| `src/app/components/autoGradeTransition.wiring.test.ts` | waves 1, 2 | source-text reader of `GradingTab.tsx` |

**RULING I RECOMMEND, and it is a legitimate finding rather than a dodge: N15 is a
WAVE OF A39, not an independent item, and it must land AFTER A39 wave 3b.** Three
reasons, each measured rather than argued:

1. **Every file N15 wants is in an A39 wave's write set.** Running them concurrently
   violates the disjointness rule (`docs/DEV_LOOP.md:247-274`): the intersection is
   not empty, it is nearly total.
2. **N15's only real leverage rides on A39 wave 2's storage.** Section 8 below. An
   extracted rubric that is not persisted and not version-stamped is a strictly
   worse chat: the instructor re-photographs per assignment and pays a model call
   for it. A39 wave 2 builds `rubric-memory.ts` and the run's `rubricUsed` /
   `rubricFingerprint` stamps (`docs/a39-architecture.md:1234-1240, 519-546`).
3. **Both panels are at the ceiling and A39 wave 3a already pays for it.** MEASURED:
   `GradingRecordingPanel.tsx` = 990 and `SnapshotGradingPanel.tsx` = 970 by both
   instruments (section 7). A39 wave 3a shrinks both to `<= 940` before any feature
   line lands. N15 arriving first would have to pay that extraction itself, or ship
   an `ALLOWED_OVERAGE` entry, which `docs/loop/this-repo.md:148` forbids.

**What N15 owns that A39 does not, so it is not absorbed entirely.** A39 never
changes what a rubric intake ACCEPTS. Its wave 1 widens `GradingTab.tsx:238`'s
`accept` for SUBMISSIONS (`docs/a39-architecture.md:1213`), not for the rubric, and its
wave 3b edits `RubricInputModal.tsx:28-34` to delete the non-persistence comment, not
`:127`'s extension list. MEASURED: `grep -n "ACCEPTED_EXTENSIONS" docs/a39-architecture.md`
exits 1 with no output; canary `grep -c "RubricInputModal" docs/a39-architecture.md`
returns `7` through the same instrument. The image-intake decision is genuinely unowned.

---

## 2. What exists: the image-intake census

Enumerated from every `accept=` attribute in the tree, then traced BOTH ways for each
candidate - control to model call, and model call back to control - because this repo
has shipped a capability with no surface AND a surface that calls nothing.

MEASURED:

```
grep -rn "accept=" src --include=*.tsx | grep -v "\.test\." | wc -l          # 33
grep -rn "accept=" src --include=*.tsx | grep -v "\.test\." | grep -c "image/"  # 5
grep -rn "acceptNoSuchAttributeXyz=" src --include=*.tsx    # canary, exit 1, no output
```

**Five of the 33 lines name an image type; FOUR are real controls.** The fifth,
`AddCourseForm.tsx:137`, is a comment about its own `accept="image/*"` two hundred
lines below - counted here because a grep count that silently folds a comment into a
control count is exactly the kind of quantity this repo has been bitten by. Full
traces of the four:

### 2.1 TextbookPhotoModal - the closest working template in the tree

**This is the finding that matters most for item 1 of the brief: a complete
paste + drop + browse image intake, with a vision model call and an editable review,
already exists and is wired.** Traced end to end, every line opened:

| Stage | `file:line` | What is there |
|---|---|---|
| Intake, browse | `TextbookPhotoModal.tsx:355-366` | `<input type="file" accept="image/*,application/pdf">` behind a "Choose file" button |
| Intake, drop | `:291-296` | `onDrop` reads `e.dataTransfer.files?.[0]` |
| Intake, paste | `:157-174` | `paste` listener on the Dialog's own Paper element (never `document`), walks `clipboardData.items` for `item.kind === "file"` |
| Type gate | `:146-154` | `isAcceptedFile`; a rejected file gets a named message |
| Size gate | `:207-211` | `checkFileWireBudget(file.size, "That file")` BEFORE any bytes are read |
| Transport | `:215-217` | `readFileBase64(file)` -> `UploadedFile` -> `extractTextbookFromImageAction([uploaded], provider)` |
| Model call | `src/app/actions/textbook-research.ts:212-273` | second server-side budget check at `:231-235`, `filesToLlmParts` at `:238`, `callLlm` at `:255` |
| Result | `TextbookPhotoModal.tsx:218-232` | fields land in EDITABLE text fields; an all-empty read gets its own non-error notice rather than silently blanking the form |

**So image intake is not new work in this repo. It is a port.** The parts that would
be reused rather than invented: the paste listener shape, the drop handler, the
two-sided budget check, `UploadedFile`, `filesToLlmParts`, and the
extract-into-an-editable-control result pattern.

### 2.2 The snapshot-grading rubric path - an image rubric ALREADY reaches the model

Two independent paths, both shipped, both on path G:

**(a) The rubric-role shot.** An image pasted or dropped onto
`SnapshotGradingPanel.tsx` enters the tray (`:550-553` paste, `:707-722` drop, via
`extractPastedImageFiles` / `isFileDragTypes` from `src/lib/chat/attachments.ts:234,83`),
is re-encoded by `useSnapshotCapture.ts:190-209`, can be tagged role `"rubric"`
(`snapshot-shot.ts:27`), and is sent to the grading call as `inlineData`
(`src/app/actions/snapshot-grade.ts:91-92`) under a prompt whose RUBRIC section is the
only source of grading standards (`snapshot-grade-prompt.ts:56`).

**(b) The Alt+R capture-to-transcript path (N14, `7c1c63f`).** `captureFrame()` ->
`snapshotTranscribeRubricAction(base64, provider)` (`useSnapshotRubricCapture.ts:21,122`)
-> a dedicated one-image OCR action (`src/app/actions/snapshot-transcribe-rubric.ts:28-66`)
-> `SnapshotRubricCaptureReview.tsx`, which shows the image beside an EDITABLE
transcript and requires a Confirm press before the text becomes the rubric.

**The two are different products and the row must not conflate them.** (a) sends the
PIXELS to the grading call and never produces reviewable text. (b) produces TEXT the
instructor reviews, and only that text is graded against. Section 5 turns on this.

### 2.3 The documented dead end, which is exactly the reachability defect N15 names

`SnapshotGradingPanel.tsx:536-546`, verbatim in source: "MAJOR-3 correction:
RubricInputModal has no image-paste handler of any kind (it only accepts
.docx/.pdf/.txt/.md via its file input) - so with this guard in place, pasting a
rubric screenshot while the modal is open reaches nothing at all and silently does
nothing." A user action the app's own source predicts and then drops.

### 2.4 The two gates that refuse an image, confirmed with canaries

```
grep -n "png|jpg|jpeg|image/" src/lib/syllabus-upload-validation.ts \
  src/app/components/grading-recording/RubricInputModal.tsx     # exit 1, NO OUTPUT
grep -n "docx|pdf" <same two files>                             # canary, exit 0, 5 lines

grep -n "callLlm|generativelanguage|inlineData|llm-files|@/lib/llm" \
  src/app/actions/syllabus-upload.ts                            # exit 1, NO OUTPUT
grep -n "callLlm|inlineData" src/app/actions/snapshot-transcribe-rubric.ts
#                                                                canary, exit 0, 3 lines
```

(Alternations written with `|` above; the runs used `grep -E`-style patterns through the
Bash tool. Neither absence grep was piped through `head`.)

So, confirmed against the tree and not against the row's memory:

- `ACCEPTED_EXTENSIONS = ".docx,.pdf,.txt,.md"` at `RubricInputModal.tsx:127`.
- `ALLOWED_EXTENSIONS` agrees at `src/lib/syllabus-upload-validation.ts:20`, and
  `MAX_FILE_SIZE = 25 * 1024 * 1024` at `:18`.
- `extractTextFromFile` (`src/app/actions/syllabus-upload.ts:39-70`) handles `.txt` /
  `.md` / `.docx` / `.pdf` and `throws` on anything else at `:69`. Zero LLM calls in
  the whole file. There is no vision fallback.
- A scanned PDF that extracts to whitespace is ALREADY handled, but only by copy:
  `rubric-input.ts`'s `describeSuspiciousExtractionMessage` tells the instructor this
  app has no OCR and to paste the text instead (`RubricInputModal.tsx:83-89`).
  **That message becomes false the moment N15 ships and is part of its write set.**

### 2.5 The other three image controls, for completeness

- `src/app/components/course-planning/SyllabusMode.tsx:351` -
  `accept="image/*" multiple` (textbook images for adaptation).
- `src/app/components/courses/AddCourseForm.tsx:375` - `accept="image/*"`, whose
  own comment at `:137` notes a non-image can slip past the browser filter.
- `src/app/components/recording/SourceDevicesPanel.tsx:449` - `accept="image/*"`
  (a recording background image; not a model path at all).

None is a rubric path; none is a template better than 2.1.

---

## 3. The model path: it exists, it is proven, and the call shape already carries images

**The decision the brief says the whole row turns on - whether the current call shape
can carry an image - is already settled in this repo's favour, and I can cite the
type.** `LlmPart` is a union that includes `{ inlineData: { mimeType: string; data: string } }`
(`src/lib/llm.ts:35`). `callLlm` takes `contents[].parts` of that type
(`src/lib/llm.ts:377` for the provider parameter). Three shipped call sites pass an
image through it:

| Call site | How the image is carried |
|---|---|
| `src/app/actions/snapshot-transcribe-rubric.ts:43-57` | one `inlineData` part beside one text part |
| `src/app/actions/snapshot-grade.ts:91-92` | one `inlineData` part per selected shot |
| `src/app/actions/textbook-research.ts:238,253-260` | `filesToLlmParts` maps each `UploadedFile` to a part |

`src/lib/llm-files.ts:23-25` is the routing rule: `isGeminiInlineSupported(mimeType)`
returns true for `application/pdf` and anything starting `image/`; everything else is
text-extracted server-side. **So a PDF page of a rubric and a photograph of a rubric
take the same path, and a `.docx` does not.**

### 3.1 What it costs, and what I cannot price

MEASURED from the code: the OCR action sets `temperature: 0, maxOutputTokens: 4096`
(`snapshot-transcribe-rubric.ts:54`); the textbook action sets `temperature: 0.1,`
`maxOutputTokens: 768` (`textbook-research.ts:258`). **NOT DETERMINED: the dollar cost
of one vision call.** No API key exists in this checkout
(`docs/loop/this-repo.md:225-227`) and no model call can be exercised. What IS
determinable and matters for section 5: a rubric-extraction call is **one call per
assignment**, against a grading run that is **N + 2 calls** on the zip path
(`docs/a39-architecture.md:75-78`). The confirm step in section 5 protects the N; the
call it costs is the 1.

### 3.2 Two traps in the precedent, both of which would be inherited silently

**TRAP 3A - the hardcoded MIME.** `snapshot-transcribe-rubric.ts:38-40` validates with
`detectImageMimeFromBase64`, which returns `image/jpeg`, `image/png` or `image/webp`
(`src/app/components/snapshot-grading/snapshot-parse.ts:43-56`) - and then `:51` sends
`{ inlineData: { mimeType: "image/jpeg", data: base64 } }` unconditionally. On path G
this is harmless because every byte reaching it was re-encoded to JPEG by
`useSnapshotCapture.ts`. **Reused as-is on a path where a PNG or WebP can arrive
un-re-encoded, it mislabels the bytes to the model.** Any reuse must either pass the
detected MIME through, or guarantee JPEG by construction. This is a defect in the
precedent, not in N15, and it is only a defect once N15 reuses it.

**TRAP 3B - the embedded provider.** `LlmProvider = "gemini" | "other" | "embedded"`
(`src/lib/llm.ts:22`), and `GradingTab.tsx:61` reads the instructor's selection via
`useLlmProvider()`. `textbook-research.ts:216-221` refuses `"embedded"` with a named
reason BEFORE the guard and before any work. `snapshot-transcribe-rubric.ts` does
**not** - it is only ever called with `DEFAULT_PROVIDER` (`useSnapshotRubricCapture.ts:122`).
On the upload surface the provider is user-selectable, so the refusal is required and
the textbook action is the model to copy, not the snapshot one.

---

## 4. The size constraint: two different walls, and the naive path hits the lower one

### 4.1 The numbers, and where each comes from

| Quantity | Value | Source |
|---|---|---|
| `serverActions.bodySizeLimit` | `"10mb"` | `next.config.ts:15` (`cat next.config.ts`) |
| Vercel platform request-body cap | `4.5 * 1024 * 1024` = 4718592 B | `src/lib/upload-budget.ts:37` |
| This repo's wire budget | `3.5 * 1024 * 1024` = 3670016 B | `src/lib/upload-budget.ts:40` |
| base64 inflation | `4/3` | `src/lib/upload-budget.ts:43` |
| Largest file on disk that fits the wire budget | **2752512 B = 2.625 MB** | `node -e` over `Math.floor(3.5*1024*1024/(4/3))`, i.e. `maxFileBytesForWireBudget()` at `upload-budget.ts:66-68` |
| Largest file on disk that fits the PLATFORM cap | 3538944 B = 3.375 MB | same command over `4.5*1024*1024` |
| Snapshot encode width cap / quality | 1920 / 0.92 | `snapshot-shot.ts:47,50` |
| Per-image wire cost after that encode | ~0.455 MB at 1080p, ~0.90 MB at 4K | `snapshot-shot.ts:12-19`, which records six 1080p shots at 2.73 MB and six 4K shots at 5.40 MB |

**`bodySizeLimit: "10mb"` is NOT the operative limit and the brief's framing of it as
"the obvious one" is a trap this repo already documented.** `upload-budget.ts:5-9`,
verbatim: Vercel caps the body at roughly 4.5 MB at the platform layer,
`bodySizeLimit` cannot raise it, and a request over the cap is rejected BEFORE the
function runs - so any check inside the action never executes and the user sees an
opaque failure. The 10 MB setting is dead ceiling above a 4.5 MB floor.

### 4.2 What a phone photo weighs against that

**NOT DETERMINED, and I will not invent it: I have no phone photo in this checkout to
weigh, and this environment cannot produce one.** What IS determinable is the
threshold the code enforces, and it is low: **any file over 2.625 MB on disk is
refused by `checkFileWireBudget`**, and anything over 3.375 MB on disk fails at the
platform before this app's code runs at all. A 12-megapixel JPEG straight off a phone
commonly sits in the 2-5 MB range; I am recording that as an **owner-confirmable
residual (RES-N15-1)**, not as a measurement, because the honest form of this finding
is: **the refusal threshold is 2.625 MB and it is plausible for a single phone photo
to exceed it, so the design may not assume the naive path succeeds.**

### 4.3 The answer the repo already built, and it is client-side downscale

The brief's three options are refuse / downscale / route differently. **Downscale is
already implemented, for an arbitrary `File`, and it is 20 lines.**
`useSnapshotCapture.ts:190-209`:

```
const encodeFile = useCallback(async (file: File): Promise<string | null> => {
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { return null; }
  try {
    const targetWidth = resolveSnapTargetWidth(bitmap.width);   // min(w, 1920)
    const targetHeight = Math.round(bitmap.height * (targetWidth / bitmap.width));
    const ctx = ensureCanvas(targetWidth, targetHeight);
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    const dataUrl = ctx.canvas.toDataURL("image/jpeg", SNAP_JPEG_QUALITY);
    return dataUrl.split(",")[1] ?? null;
  } finally { bitmap.close(); }
}, []);
```

Its own doc comment at `:45-50` states the invariant this buys: "every byte leaving the
client for every shot - captured, pasted, or dropped - is JPEG at the same
quality/width cap. Never passes a PNG through untouched." **That also closes TRAP 3A
by construction**: after this, `mimeType: "image/jpeg"` is true rather than hopeful.

**RECOMMENDED SHAPE (an architect's to confirm): downscale first, then refuse, and
never refuse silently.** Concretely - re-encode through the shipped encoder; check
`checkWireBudget(base64.length, ...)` on the CLIENT before dispatch (as
`useSnapshotRubricCapture.ts:115-119` does) AND again in the action (as
`snapshot-transcribe-rubric.ts:41-42` does, with its own comment "never trust the
client-side pre-flight alone"); on failure render a named reason, not a spinner that
ends. The double check is not belt-and-braces: the client check is what keeps the
failure legible, and the server check is what makes it true.

### 4.4 The wall nobody has counted, and it is specific to GradingTab

**On path A the rubric shares one Server Action body with the submissions zip.**
`GradingTab.tsx:228` is a single `<form action={formAction}>`; the zip rides it as
`name="studentSubmissions"` (`:234-239`, the input itself at `:234`) and the rubric as `name="rubric"` (`:316`);
`gradeAction` pulls both off the same `FormData` (`src/app/actions/grading.ts:709,713`).
MEASURED: `grep -nE "upload-budget|checkWireBudget|checkFileWireBudget|bodySize" src/app/actions/grading.ts`
exits 1 with no output; canary `grep -c "formData.get" src/app/actions/grading.ts`
returns **8** through the same instrument. **There is no wire-budget check anywhere on the
zip grading path today.** Adding image bytes to that form makes an existing
unmeasured limit worse.

**Consequence for the design: an image rubric on path A must NOT ride the grading
form.** It must be its own round trip - extract to text first, put the text in the
field, then submit - which is what both existing precedents already do
(`TextbookPhotoModal` and `RubricInputModal` each extract in a separate action and fill a
control). That is a finding, and it is also a residual for the zip path itself
(RES-N15-5).

### 4.5 The transport fork nobody has to guess at

Two shipped transports, and they have different limits:

| Transport | Limit | Precedent |
|---|---|---|
| base64 in a Server Action body | **2.625 MB on disk** | `TextbookPhotoModal`, `snapshot-transcribe-rubric` |
| browser -> Supabase Storage -> server downloads | **25 MB** (`syllabus-upload-validation.ts:18`) | `RubricInputModal.tsx:180-196` |

`syllabus-upload-validation.ts:8-16` says this in its own words: the 25 MB limit "is no
longer sized against a server action's request body limit - the file now goes straight
from the browser to Supabase Storage." **So if the design routes through Storage the
size wall moves by a factor of roughly ten and the downscale becomes optional rather
than load-bearing.** The cost is that Storage needs a signed-in Supabase client
(`RubricInputModal.tsx:157-160` refuses when `!user`), and the object lifecycle -
upload, extract, always delete - is owned by `extractSyllabusTextAction`, which does
no vision work. A vision variant would be a new action. **I am not deciding this; I am
naming it as the architect's fork with both limits measured.**

---

## 5. The accuracy question: the confirm step is earned, and the argument is arithmetic

**A misread rubric is not one wrong answer, it is N wrong answers.** The engine pins
ONE rubric string before the loop and reuses it for every student
(`src/lib/grade/engine.ts:197-198`, loop at `:207`, one `gradeSubmission` per student at
`:229`; `docs/a39-architecture.md:59-70` re-measured the same lines). That pinning is
A39's own CLAIM 2 and it is a genuine advantage - **and it is exactly what converts a
single OCR error into a systematic one.** A transposed point value ( "15" read as
"1.5" ) or a dropped criterion row is applied identically to all N submissions, and
every row looks internally consistent, so nothing downstream can detect it.

**ARGUING IT THE OTHER WAY, honestly, because the brief asks me to.** The case against
a confirm is real and this repo has written it down:
`docs/a39-research.md:638-662` is a section titled "Confirmation steps that protect
nothing", and `docs/a39-architecture.md:1057-1059` rules that the rubric auto-restore
"must not be softened into a confirmation dialog." A confirm that fires on every
press trains the instructor to dismiss it (`docs/owner-decisions-2026-09-23.md:51-53`).

**Why that objection does not reach this confirm, and the distinction is sharp.** The
confirms those documents strike are confirms over text the instructor ALREADY SAW and
TYPED or PASTED. This confirm is over text **the instructor has never seen**, produced
by a model from pixels, in a step whose failure is silent. Those are different
objects. The repo's own precedent agrees: `SnapshotRubricCaptureReview.tsx` exists
solely to make an OCR read reviewable, and its header states the reason - "showing the
captured image beside the editable transcript so a garbled OCR read is never silently
trusted (Ruling N14-11)".

**VERDICT: EARNED, and the correct shape is already built.** What the instructor sees
before grading starts, per `SnapshotRubricCaptureReview.tsx:66-102`:

1. The captured image, rendered beside the transcript (`:86-91`), so comparison needs no
   second window.
2. The transcript in an EDITABLE `TextField` (`:93-101`) - a garbled read is fixed in
   place, not restarted.
3. A disclosure naming where the bytes went (`:80-84`): "This screen capture was sent
   to Google's Gemini API (generativelanguage.googleapis.com) to transcribe it."
4. Confirm is the FIRST tabbable element by construction, with the reasoning and the
   two markup constraints that keep it true written into the file header
   (`SnapshotRubricCaptureReview.tsx:11-27`).

**The one thing that shape does NOT give, and it is the point of the whole row: the
confirmed text must land in a field that stays visible.** On path A the field is
`GradingTab.tsx:309-322` and it is already on screen, so the review's output is
visible in the control that will submit it - which is what
`docs/a39-architecture.md:1046-1052` means by "the field IS the receipt". A design
that files the extraction anywhere else loses that for free.

**READING CLAIM, labelled: all four points above are read from source. No component
renders under vitest, so none of it is observed.** Whether the side-by-side is legible
at a real viewport is RES-N15-2, owner-only.

---

## 6. The four browser traps from the research, applied to this surface

Source for all four: `docs/a39-research.md:251-316`. Each is judged against the
intake N15 would build - a SINGLE rubric image, not a folder of submissions.

### Trap 2 - `DataTransferItem.kind` is `"file"` for folders too

**BITES, but weakly, and the mitigation is a refusal rather than a walker.** A dropped
folder reports `kind === "file"`, so a router dispatching on `kind` treats it as a
file. What the existing precedents do: `TextbookPhotoModal.tsx:294-295` reads
`e.dataTransfer.files?.[0]` - a dropped folder yields an empty `FileList` and
`dropped` is `undefined`, so **nothing happens and nothing is said**. Same shape at
`RubricInputModal.tsx:233-240 (the handler) wired at `:281``.

**DESIGN OBLIGATION: a rubric is one image. Do not build a directory walker. Detect
the folder and refuse it by name.** Test `webkitGetAsEntry()?.isDirectory` inside the
drop handler and render "That is a folder - drop a single image or PDF of the rubric".
The current silent no-op is the defect; a walker would be scope this row does not need.

### Trap 3 - `readEntries()` truncates at 100 in Chromium

**DOES NOT BITE, conditional on the ruling above.** It applies only to code that reads
a directory. MEASURED: `grep -rnE "readEntries|webkitGetAsEntry|getAsFileSystemHandle|webkitdirectory" src`
exits 1 with no output; canary `grep -rn "dataTransfer" src --include=*.tsx | wc -l`
returns **22** through the same instrument. No directory reading exists in this tree and this row
must not introduce the first one. **If a later pass adds folder intake, this trap
returns and is carried as RES-N15-3.**

### Trap 4 - the drag data store closes at the first `await`

**BITES DIRECTLY, and it is the one that fails only in a real browser - which this
checkout cannot drive.** `DataTransfer.files` and `webkitGetAsEntry()` are readable only
inside the `drop` handler, before the first `await`.

**Both precedents are already correct and the pattern must be copied exactly.**
`TextbookPhotoModal.tsx:291-297` harvests `e.dataTransfer.files?.[0]` synchronously and
hands the `File` to `handleFile`, which is where the async work starts.
`SnapshotGradingPanel.tsx:707-723` does the same, harvesting before `void handleFiles(...)`.
**DESIGN OBLIGATION: harvest to a `File`/`File[]` synchronously; every `await` -
including the downscale's `createImageBitmap` - happens after the harvest.**

**This is a reading claim and cannot be made an executing one here.** A source-text
assertion that no `await` appears between the handler's opening brace and the
`dataTransfer` read is the strongest instrument this repo supports - weaker than a
render, and it must be labelled as such rather than presented as coverage.

### Trap 6 - WCAG 2.2 SC 2.5.7 forbids drag-only (Level AA)

**BITES, and there is a LIVE GAP in the tree right now.** MEASURED:

```
grep -rn 'type="file"' src/app/components/snapshot-grading/     # exit 1, NO OUTPUT
grep -rn 'type="file"' src/app/components/grading-recording/    # canary, exit 0,
#   RubricInputModal.tsx:291 (a comment) and :310 (the real input)
```

**`src/app/components/snapshot-grading/` contains no file input at all.** Its image
intake is paste (`SnapshotGradingPanel.tsx:550`) and drop (`:722`) only. Paste is a
keyboard route, not the single-pointer-without-dragging route SC 2.5.7 requires, so
**the drop path on path G has no conforming alternative today.** That is a finding
about an existing surface, relocated rather than owned: it is only N15's to fix if the
fork in section 9 puts N15 there (RES-N15-4).

**For N15's own surface the obligation is unconditional: ship click-to-browse.**
`TextbookPhotoModal.tsx:355-366` and `RubricInputModal.tsx:298-315` both already do,
and the latter's `component="label"` + `role={undefined}` recipe with its comment at
`:283-297` is the accessible form to copy rather than re-derive.

### Trap 5, not in the brief's four but in the same section, and it changes the copy

`docs/a39-research.md:296-306` records Mozilla bug 1699743 (RESOLVED FIXED, Firefox
116) - clipboard file paste was historically unreliable, and the research's safe
reading is "dropping files is the reliable route across engines and pasting files is
the convenient one, so a design must not make paste the only way to supply a file."
**All three routes ship, or none of the copy is true.**

---

## 7. Surface, ceiling and persistence

### 7.1 Line counts, both instruments, MEASURED today

PowerShell: `foreach ($f in $files) { "{0}`t{1}" -f @(Get-Content $f).Count, $f }`.
Bash: `wc -l < $f`. **The two agreed on every file below**, which is worth stating
because they disagree by 42, 62, 67 and 127 elsewhere in this repo.

| File | `@(Get-Content).Count` | `wc -l` | Headroom to 1001 |
|---|---|---|---|
| `src/app/components/grading-recording/GradingRecordingPanel.tsx` | **990** | 990 | **10** |
| `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` | **970** | 970 | **30** |
| `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` | 822 | 822 | 178 |
| `src/app/components/grading-recording/grading-rows.test.ts` | 733 | 733 | 267 |
| `src/app/components/GradingTab.tsx` | 476 | 476 | 524 |
| `src/app/components/courses/TextbookPhotoModal.tsx` | 433 | 433 | 567 |
| `src/app/components/grading-recording/RubricInputModal.tsx` | 375 | 375 | 625 |
| `src/lib/chat/attachments.ts` | 279 | 279 | 721 |
| `src/app/actions/textbook-research.ts` | 273 | 273 | 727 |
| `src/app/actions/syllabus-upload.ts` | 246 | 246 | 754 |
| `src/app/components/autoGradeTransition.wiring.test.ts` | 241 | 241 | 759 |
| `src/app/components/snapshot-grading/useSnapshotCapture.ts` | 212 | 212 | 788 |
| `src/app/components/grading-recording/rubric-input.test.ts` | 197 | 197 | 803 |
| `src/app/components/snapshot-grading/useSnapshotRubricCapture.ts` | 153 | 153 | 848 |
| `src/app/components/grading-recording/rubric-input.ts` | 142 | 142 | 859 |
| `src/lib/upload-budget.ts` | 115 | 115 | 886 |
| `src/app/components/snapshot-grading/SnapshotRubricCaptureReview.tsx` | 103 | 103 | 898 |
| `src/lib/llm-files.ts` | 77 | 77 | 924 |
| `src/app/actions.ts` | 77 | 77 | 924 |
| `src/app/actions/snapshot-transcribe-rubric.ts` | 66 | 66 | 935 |
| `src/lib/syllabus-upload-validation.ts` | 52 | 52 | 949 |

Gate: `src/file-size-ceiling.structure.test.ts:41` (`LIMIT = 1000`) and `:140`
(`lineCount > limit`), so **1001 is red**. `ALLOWED_OVERAGE` at `:75` is a ratchet and
**no wave below proposes an entry in it.**

**The two panels are the hard finding.** If the fork puts N15 on path F or G, an
extraction precedes the feature - which is exactly what A39 wave 3a already schedules
(`docs/a39-architecture.md:1300-1305`: both to `<= 940`, no feature line in 3a). **If
N15 lands after A39 wave 3a, it inherits the headroom and pays nothing. If it lands
before, it pays the extraction itself.** That is the third reason section 1.1 orders
them.

### 7.2 The persisted-key canaries, located and verified

Every new control persists under a `ta-` prefixed key, and the exact-key-set canary is
bumped in the SAME commit. I located these by grep rather than by trusting
`docs/a39-architecture.md`'s table, then opened each:

| Directory | Canary | What it asserts | Verified |
|---|---|---|---|
| `src/app/components/grading-recording/` | `grading-rows.test.ts:670-688` | `expect(keys).toEqual([...])` over `/ta-rec-grade-[a-z-]*/g`; exactly seven keys today | opened `:670-730` |
| same | `grading-rows.test.ts:718-733` | an `it.each` over the same seven, each needing a live `getItem` AND `setItem` (`isWired` at `:696-717`) | opened |
| `src/app/components/snapshot-grading/` | `snapshot-grading.structure.test.ts:176-202` | `toEqual` over `/(?<![a-zA-Z])ta-snap-[a-z-]*[a-z]/g`; exactly four keys | opened `:170-210` |
| `src/app/components/` root (path A) | **NONE** | - | see below |

**The absence for path A, with its canary.** MEASURED:

```
grep -rn "ta-grading-" src            # exit 0, 13 lines - ALL of them either
#   ta-grading-results-edits (gradingResultsHelpers.ts / its tests / the sweep test)
#   or ta-grading-source at GradingTab.tsx:74,86
grep -rn "ta-grading-source" src      # canary, exit 0, exactly 2 lines, both in
#   GradingTab.tsx - so NO TEST ANYWHERE mentions this key
```

**`ta-grading-source` is read and written by `GradingTab.tsx` and named by zero tests.**
So a new `ta-grading-*` key on path A has no exact-set canary to bump. That is a real
absence, not a search failure, and it is the same absence
`docs/a39-architecture.md:305` records as RES-A39-13. **N15 does not invent one; it
inherits whichever disposition A39 lands on** (RES-N15-6).

**Which canary N15 bumps therefore follows entirely from the fork in section 9:**
path F adds a `ta-rec-grade-*` key and bumps BOTH lists in `grading-rows.test.ts`;
path G adds a `ta-snap-*` key and bumps `snapshot-grading.structure.test.ts` including
**the test NAME at `:195`, which asserts the dropped policy in prose**; path A bumps
nothing because nothing exists.

### 7.3 Persistence is now legal, and what that does NOT license

`docs/owner-decisions-2026-09-23.md:69-100`, DECISION 3: the rubric non-persistence
policy is DROPPED. Three consequences bind N15 specifically:

- **The policy must be deleted where it is asserted.** For N15 the relevant assertion
  is narrower than A39's two: `RubricInputModal.tsx:83-89` tells the instructor
  "this app has no OCR". **That sentence becomes false the moment N15 ships**, and
  `rubric-input.ts`'s `describeSuspiciousExtractionMessage` owns it. It is in N15's
  write set, not A39's.
- **The IMAGE BYTES are a different question from the rubric TEXT.** Every existing
  reviewer keeps pixels out of storage deliberately
  (`SnapshotRubricCaptureReview.tsx:29-32`: the draft "lives only in this component's
  own useState, never localStorage"; `useSnapshotRubricCapture.ts:42-46`: the review
  `base64` is a transient data URI, "Never persisted"). DECISION 3 dropped the policy
  on the rubric TEXT. **Nothing in it licenses persisting a photograph**, and a
  1920-wide JPEG in `localStorage` would also be a quota hazard. **Recommendation:
  persist the confirmed TEXT, never the image.**
- `src/lib/client-state-sweep.ts:46` erases `localStorage` on every change of signed-in
  owner by a keep-list (`DEVICE_PREFERENCE_KEYS = ["ta-theme"]`), so any new `ta-` key
  is swept across users by default. That answers the cross-user half of the old
  policy's concern and not the "nothing lingers while I am signed in" half.

---

## 8. The leverage question, answered against the mechanism

**Conceded up front, and this is the error the research already caught: image intake
alone is NOT an advantage.** A chat accepts a pasted image of a rubric. Claiming
"you can photograph your rubric" as leverage would be the failure mode
`docs/loop/leverage.md:85-90` names - a benefit, not a mechanism, falsifiable by
nothing. `docs/owner-decisions-2026-09-23.md:93-98` says the same about persistence:
"The research pass established that a chat CAN persist a rubric via Projects, so
persistence alone is not leverage."

**So what survives is only what the app does with the text AFTERWARDS, and it is two
things, neither of which N15 builds.**

**(1) Reuse across submissions without re-uploading.** The mechanism is
`engine.ts:197-198` pinning one rubric string for the whole batch plus A39 wave 2's
`rubric-memory.ts`. N15 supplies an input to that; it does not create it.
Per `docs/loop/leverage.md:64`, the click-cost row was STRUCK as non-categorical and
may be claimed only when named explicitly as click-cost. **Named explicitly: N15 saves
the instructor transcribing a paper rubric by hand, once per assignment. That is
click-cost, and a large one, but it is not a class.**

**(2) Version provenance.** `docs/owner-decisions-2026-09-23.md:95-98`: "What a chat
cannot do is say WHICH rubric version produced a given grade." That is A39's CLAIM 1
(`docs/a39-architecture.md:519-546`), built from `GradingRun.rubricUsed` and
`rubricFingerprint` stamped at the engine's single return site. **N15 does not build
it and must not claim it.**

### 8.1 The one thing N15 could earn on its own, stated so a checker can attack it

A photographed rubric has no digital original. Once extracted and confirmed, the
app holds the ONLY machine-readable copy, and every subsequent run of that assignment
is graded against byte-identical text. The chat equivalent re-OCRs the photo on every
new conversation, and two OCR passes over the same photo are not guaranteed to agree.
**That is a CORPUS/GUARANTEED-shaped claim and it is genuinely different from
persistence** - the advantage is not that the text is stored, it is that the
PIXEL-TO-TEXT CONVERSION HAPPENS EXACTLY ONCE and every later grade rests on that one
confirmed artifact.

**I am NOT asserting this claim is proven. Two things have to be true first and
neither is today:**

- The confirmed text must be persisted and scoped - **which is A39 wave 2's
  `rubric-memory.ts`, not N15's**.
- The stored entry must record that it came from an image and was instructor-confirmed,
  or the claim has no observable residue. **Nothing in the tree does this today.**

  **A CORRECTION TO A CITED DOCUMENT, and it is the kind this loop exists to catch.**
  `docs/a39-architecture.md:536-538` asserts that
  `grep -rn "rubricUsed\|rubricFingerprint" src` "returns nothing today" and offers
  `grep -rn "rubricAreaNames" src` (47 lines) as its canary. **MEASURED here today:
  the absence grep returns 30 lines, exit 0** - `rubricFingerprint` is declared at
  `src/lib/research/rubric-bank.ts:28` (which A39's own CLAIM 1 cites two paragraphs
  earlier as `rubric-bank.ts:28-30`, so the document contradicts itself), and
  `rubricUsed` is a live field on Repo Grades' bulk-grade hook
  (`src/app/components/repo-grades/useRepoGradesBulkGrade.ts:118,160-161,272,402`).
  The canary itself also moved: `grep -rn "rubricAreaNames" src | wc -l` returns
  **140**, not 47.

  **What survives of A39's point, and it does survive:** neither name is a field on
  `GradingRun`, so no FINISHED RUN carries the rubric it was graded against. The
  earned-not-inherited argument holds; the instrument printed for it does not. Anyone
  building A39's CLAIM 1 must re-scope that grep to `src/lib/grade/types.ts` or it
  will fail at the first `expect`.

**THE HONEST DISPOSAL, per `docs/loop/leverage.md:109-125`, which gives three explicit
calls and rules that silence is the one illegal answer: ACCEPT THE COST EXPLICITLY.**
N15 on its own is **convenience, not leverage** - a large convenience on the hardest of
the owner's three inputs, and the criteria must say so in those words so a later reader
does not credit it with integration or persistence it does not have. **It BECOMES
leverage only when stacked on A39 wave 2**, which is the fourth independent reason to
sequence it there. If a later pass wants to claim 8.1, it owes a removal test whose
observed value changes when the one-time-conversion record is deleted - and it owes
that test before the claim, not after.

---

## 9. The fork that is the owner's, stated once, with a recommendation

**Per this repo's standing rule this is NOT a gate. The recommended reading below is
the one to build against while the question rides alongside.**

**THE FORK: which surface gets the picture-rubric intake?**

| Option | What it means | Cost if wrong |
|---|---|---|
| **(a) Path A, `GradingTab.tsx`** | a new compact intake beside the existing rubric TextField at `:309-322` | the zip upload path is the one the owner named; but the form-body collision (4.4) means a separate round trip, and there is no rubric modal here to extend |
| **(b) Path F, `RubricInputModal.tsx`** | widen `ACCEPTED_EXTENSIONS` to images and add a vision branch; the modal ALREADY has drop + browse + an editable review textarea | not reachable from `GradingTab` today, so it does not serve the surface the row names unless the modal is also wired there |
| **(c) Both, modal first** | build in the modal, then render it from `GradingTab` | largest; two surfaces to verify |

**MY RECOMMENDATION: (c), and the ordering matters more than the choice.** Reasons,
each measured: the modal already has two of the three intake routes
(`RubricInputModal.tsx:298-315` browse, `:233-240`/`:281` drop) and an editable review
textarea (`:353-361`), so (b) is the smaller build; and `GradingTab.tsx` at 476 lines
has 524 lines of headroom, so rendering an existing modal there is cheap, whereas
building a second intake inline is not. **(a) alone duplicates an intake this repo
already has twice.**

**Second fork, smaller, also the owner's: does the assignment DESCRIPTION get the same
treatment?** The row asks for both. MEASURED: `GradingTab.tsx:293-306` has an
`assignmentInstructions` TextField and `SnapshotGradingPanel.tsx:148,788` has
`assignmentText`, but `grep -n "assignment" src/app/components/grading-recording/GradingRecordingPanel.tsx`
returns **4** (`grep -cE "assignment|Assignment"`), **none of them a description
field** - they are three comments and one `assignmentName` metadata write at
`:640` - so path F has nowhere to put
one. **RECOMMENDATION: one intake, one ROLE selector**, mirroring `snapshot-shot.ts:27`'s
closed role set, rather than two near-identical controls. Same code, one extra
parameter, and it keeps the copy honest about what the extraction is for.

---

## 10. Wave plan

Three waves. **Each wave's file list contains the file that CALLS or RENDERS the new
capability** - this repo has shipped a library with no surface and a surface with no
library, and the rule that prevents both is that the caller is in the list.

**All three waves are ordered AFTER A39 wave 3b** (section 1.1). Disjointness against
A39, computed rather than eyeballed, must be re-run at dispatch time with
`comm -12 <(sort n15.txt) <(sort a39waveN.txt)` and the output pasted; empty is the
only pass.

### Wave 1 - the extraction action and its pure leaves (no surface change)

| Path | New? | Why it is here |
|---|---|---|
| `src/app/actions/extract-rubric-image.ts` | new | the vision action. Copies `textbook-research.ts:212-273`'s SHAPE: embedded-provider refusal FIRST, then the guard, then `sumBase64WireBytes` + `checkWireBudget`, then `filesToLlmParts`, then `callLlm`. Reuses `buildRubricCapturePrompt()` (`snapshot-rubric-capture-prompt.ts:26`) rather than writing a fourth framing header |
| `src/app/actions/extract-rubric-image.test.ts` | new | the oracle |
| `src/app/actions.ts` | edit | **THE BARREL.** Without this the client cannot import the action and it ships dead. 77 lines, 924 of headroom |
| `src/app/actions/action-guard-coverage.test.ts` | **owned** | a new `"use server"` export is an unauthenticated POST endpoint; this file's ratchet fails unless a guard call is present (`GUARD_CALL` at `:62`) |
| `src/lib/use-server-exports.test.ts` | **owned, read-only** | `"use server"` files export only async functions |
| `src/file-size-ceiling.structure.test.ts` | **owned, read-only** | the gate |

**PASS CONDITIONS.**

- **N15-W1-1.** OBJECT: `extractRubricImageAction` called with `provider: "embedded"`.
  INSTRUMENT: `npx vitest run src/app/actions/extract-rubric-image.test.ts`.
  DIRECTION OF FAILURE: RED if it returns anything other than a named refusal, or if
  any `callLlm` mock was invoked. The failure being guarded is spending a model call
  on a provider that cannot read images (`textbook-research.ts:216-221` is the
  precedent that gets this right; `snapshot-transcribe-rubric.ts` does not).
- **N15-W1-2.** OBJECT: the action called with a base64 string whose length exceeds
  `UPLOAD_WIRE_BUDGET_BYTES` (3670016). INSTRUMENT: same.
  DIRECTION OF FAILURE: RED if it resolves without an `error` key, or if the mocked
  `callLlm` was reached. Modelled on the shipped
  `src/app/actions/textbook-research.upload-budget.test.ts:45-76`, which already
  asserts exactly this for the textbook action.
- **N15-W1-3, the MIME is not hardcoded.** OBJECT: the `parts` array the action builds
  for a PNG payload. INSTRUMENT: same. DIRECTION OF FAILURE: RED if
  `parts.some(p => p.inlineData?.mimeType === "image/jpeg")` is true for PNG input -
  i.e. RED if TRAP 3A was copied along with the shape.
- **N15-W1-4, the guard ratchet.** OBJECT: the new action's body.
  INSTRUMENT: `npx vitest run src/app/actions/action-guard-coverage.test.ts`.
  DIRECTION OF FAILURE: RED if the new export is unguarded, or if it was added to the
  pinned unguarded list instead of being guarded.
- **N15-W1-5, all three together.** INSTRUMENT:
  `npm run test:paths -- src/app/actions/extract-rubric-image.test.ts src/app/actions/action-guard-coverage.test.ts src/lib/use-server-exports.test.ts`
  (never a raw multi-path `vitest run`, which silently drops unmatched arguments -
  `docs/loop/this-repo.md:28-41`). DIRECTION OF FAILURE: any argument printing
  `NOT COVERED`, or a non-zero exit.

### Wave 2 - the intake and the review reach the modal (THE SURFACE)

| Path | New? | Why it is here |
|---|---|---|
| `src/app/components/grading-recording/rubric-image-intake.ts` | new | PURE leaf: `classifyRubricIntake(name, type)` -> `"text-document" | "image" | "folder" | "unsupported"`, plus the refusal strings. Every branch is unit-testable with no render |
| `src/app/components/grading-recording/rubric-image-intake.test.ts` | new | the oracle |
| `src/app/components/grading-recording/RubricInputModal.tsx` | edit | **THE RENDERER.** Widen `ACCEPTED_EXTENSIONS` at `:127`; add a paste listener on the ModalShell root (copying `TextbookPhotoModal.tsx:157-174`); route an image to the wave-1 action instead of to Storage; fill the SAME textarea, so the existing review is inherited |
| `src/app/components/grading-recording/rubric-input.ts` | edit | **the "this app has no OCR" copy at `RubricInputModal.tsx:83-89` becomes false.** `describeSuspiciousExtractionMessage` is rewritten here |
| `src/app/components/grading-recording/rubric-input.test.ts` | **owned** | 197 lines; pins `deriveUploadOutcomeNotice` (`:144`) |
| `src/app/components/grading-recording/GradingRecordingPanel.tsx` | edit ONLY if a prop changes | **THE CALLER** at `:979`. 990 lines - **10 of headroom.** If this file must change, A39 wave 3a's extraction is a prerequisite, not an option |
| `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` | edit | **THE SECOND CALLER** at `:948`, and the file whose `:536-546` comment documents the dead end this wave closes - that comment becomes false and must be rewritten. 970 lines - **30 of headroom** |
| `src/lib/syllabus-upload-validation.ts` | **read-only, deliberately NOT edited** | its gate is shared with syllabus upload; widening it would let an image reach `extractTextFromFile`, which `throws` at `syllabus-upload.ts:69`. **The image branch routes AROUND this gate, never through a widened one** |
| `src/lib/syllabus-upload-source.test.ts` | **owned** | names `RubricInputModal.tsx` as source text (`:141,:234`) |
| `src/app/components/ui/modalAdoption.wiring.test.ts` | **owned** | names `RubricInputModal.tsx` at `:251,:341` |
| `src/app/components/ui/buttonVariant.test.ts` | **owned** | pins a per-file button count for `RubricInputModal.tsx` at `:170` - **adding a button changes it** |
| `src/file-size-ceiling.structure.test.ts` | **owned, read-only** | the gate |

**PASS CONDITIONS.**

- **N15-W2-1, the classifier does not mistake a document for an image.** OBJECT:
  `classifyRubricIntake` over `{rubric.png, rubric.jpg, rubric.heic, rubric.pdf,`
  `rubric.docx, rubric.txt, rubric.exe}`. INSTRUMENT:
  `npx vitest run src/app/components/grading-recording/rubric-image-intake.test.ts`.
  DIRECTION OF FAILURE: RED if `.pdf` classifies as `"image"` - the live hazard,
  because a PDF has a WORKING text path today (`syllabus-upload.ts:54-67`) and routing
  it to a vision call would replace a free exact extraction with a paid approximate
  one. Also RED if `.exe` classifies as anything but `"unsupported"`.
- **N15-W2-2, the OCR copy is gone where it was asserted.** OBJECT: the
  `grading-recording` directory's source text. INSTRUMENT:
  `grep -rn "no OCR" src/app/components/grading-recording src/app/components/snapshot-grading`.
  DIRECTION OF FAILURE: RED if any surviving line still tells the instructor this app
  cannot read an image. Paired canary in the same call:
  `grep -rn "rubric" <same dirs> | head -1` must print, proving the instrument reaches
  the directory. (The ABSENCE grep itself is never piped through `head`.)
- **N15-W2-3, the intake is reachable without dragging.** OBJECT: the stripped source
  of `RubricInputModal.tsx`. INSTRUMENT: a source-text assertion in
  `rubric-input.test.ts` that `type="file"` is present AND that its `accept` value
  contains an image type. DIRECTION OF FAILURE: RED if the image route exists only on
  the drop handler - SC 2.5.7. **HONEST LIMIT: this pins the attribute, not the
  behaviour. Nothing renders here** (RES-N15-2).
- **N15-W2-4, the drop harvest is synchronous.** OBJECT: the `handleDrop` body in
  `RubricInputModal.tsx`, comment-stripped. INSTRUMENT: a source-text assertion that
  no `await` appears between the handler's opening brace and the `dataTransfer` read.
  DIRECTION OF FAILURE: RED if an `await` precedes the harvest - trap 4.
  **HONEST LIMIT: a source-order proxy for a runtime behaviour this checkout cannot
  observe** (RES-N15-3). **This test MUST strip comments**, or a commented-out
  `await` satisfies it - `docs/backlog.yml` row L9 records 134 test files with no
  comment defence and names this exact class.
- **N15-W2-5, the button-count pin was updated, not deleted.** OBJECT:
  `buttonVariant.test.ts:170`'s entry for `RubricInputModal.tsx`. INSTRUMENT:
  `npm run test:paths -- src/app/components/ui/buttonVariant.test.ts src/app/components/ui/modalAdoption.wiring.test.ts src/app/components/grading-recording/rubric-input.test.ts`.
  DIRECTION OF FAILURE: RED if the count is stale, and equally RED if the pin was
  removed rather than corrected.
- **N15-W2-6, the ceiling.** OBJECT: every touched `.tsx`'s line count. INSTRUMENT:
  `@(Get-Content $f).Count` (PowerShell) AND `wc -l < $f` (Bash), both reported.
  DIRECTION OF FAILURE: **greater than 1000 on any file**, or any new
  `ALLOWED_OVERAGE` entry.

### Wave 3 - the downscale, and the size refusal that is never silent

| Path | New? | Why it is here |
|---|---|---|
| `src/lib/image-downscale.ts` | new | the `encodeFile` logic of `useSnapshotCapture.ts:190-209`, lifted to a shared client-safe module. **The lift is the point**: two copies of an encoding decision is how the 1080p-vs-4K defect at `snapshot-shot.ts:12-19` happened once already |
| `src/app/components/snapshot-grading/useSnapshotCapture.ts` | edit | **THE FIRST CALLER** - it now calls the shared module. 212 lines. Without this edit the lift is a second copy, not an extraction |
| `src/app/components/grading-recording/RubricInputModal.tsx` | edit | **THE SECOND CALLER** |
| `src/app/components/snapshot-grading/useSnapshotShots.test.ts` | **owned** | exercises the tray behaviour the lift must not change |
| `src/app/components/snapshot-grading/snapshot-shot.test.ts` | **owned** | owns `resolveSnapTargetWidth` / `SNAP_JPEG_QUALITY` |
| `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` | **owned** | directory-scoped structure gate |
| `src/file-size-ceiling.structure.test.ts` | **owned, read-only** | the gate |

**PASS CONDITIONS.**

- **N15-W3-1, the encoding decision has exactly one owner.** OBJECT: the tree's
  `toDataURL("image/jpeg"` call sites reachable from a rubric intake. INSTRUMENT:
  `grep -rn "toDataURL" src/app/components/snapshot-grading src/app/components/grading-recording src/lib/image-downscale.ts`.
  DIRECTION OF FAILURE: RED if more than one module encodes - i.e. if wave 3 added a
  copy instead of moving the original.
- **N15-W3-2, an oversized image refuses with a NAMED reason.** OBJECT: the intake's
  result for a payload over `UPLOAD_WIRE_BUDGET_BYTES` that downscaling did not rescue.
  INSTRUMENT: `npx vitest run src/app/components/grading-recording/rubric-image-intake.test.ts`.
  DIRECTION OF FAILURE: RED if the refusal string is empty, generic, or absent -
  **a silent failure on a large photo is the worst outcome and this is the test that
  says so.** The string must quote the limit in FILE bytes, which
  `checkWireBudget` (`upload-budget.ts:80-95`) already does.
- **N15-W3-3, HEIC is handled or refused, never hung.** OBJECT: the intake's result
  for a `.heic` file. INSTRUMENT: same. DIRECTION OF FAILURE: RED if it returns a
  pending/undefined state. `createImageBitmap` throwing is already handled
  (`useSnapshotCapture.ts:193` returns `null`), but `null` must become a MESSAGE, not a
  no-op. **NOT DETERMINED: whether any browser here decodes HEIC** - RES-N15-7.
- **N15-W3-4, the snapshot tray did not regress.** INSTRUMENT:
  `npm run test:paths -- src/app/components/snapshot-grading/useSnapshotShots.test.ts src/app/components/snapshot-grading/snapshot-shot.test.ts src/app/components/snapshot-grading/snapshot-grading.structure.test.ts`.
  DIRECTION OF FAILURE: any argument printing `NOT COVERED`, or a non-zero exit.
- **N15-W3-5, lint did not regress.** OBJECT: `npm run lint`. DIRECTION OF FAILURE: a
  fifth warning or any error (`docs/loop/this-repo.md:78-83`). **Named specifically
  because `:85-100` records that removing hooks from a snapshot panel fails
  `preserve-manual-memoization` on a callback nobody touched** - wave 3 edits
  `useSnapshotCapture.ts`, which is exactly that class of change.

---

## 11. Residual register

Each entry names an OWNER, an INSTRUMENT, an OBJECT, a DIRECTION OF FAILURE and a
STEP. Per `docs/loop/iteration-caps.md` a residual missing any of those is a deletion,
so anything I could not give all five to is stated as a deletion below rather than
dressed as a residual.

**RES-N15-1 - a phone photo's real size against the 2.625 MB refusal threshold.**
OWNER: the repo owner. INSTRUMENT: take one photo of a real rubric on the phone
actually used and report the file size in MB. OBJECT: that file against
`maxFileBytesForWireBudget()` = 2752512 B. DIRECTION OF FAILURE: if the photo exceeds
it, wave 3's downscale is LOAD-BEARING rather than an optimisation and cannot be
deferred. STEP: one message from the owner, before wave 3 is planned.
**This environment cannot produce a phone photo** (`docs/loop/this-repo.md:218-237`).

**RES-N15-2 - every UI claim in this document is a reading claim.**
OWNER: the repo owner. INSTRUMENT: open the surface in a real browser and check that
the review's image and transcript are both legible side by side, that the file input
is keyboard-reachable, and that a drop of a folder says something. OBJECT: the
rendered modal. DIRECTION OF FAILURE: any of the three absent.
STEP: the owner's own walkthrough after wave 2. **No test in this repo renders a
component** (`docs/loop/this-repo.md:109-114`), so this is not a suite claim and must
not be reported as one.

**RES-N15-3 - trap 4 is proven only by source order here.**
OWNER: the N15 verification pass. INSTRUMENT: N15-W2-4's comment-stripped source-text
assertion, plus the owner dropping a real file in a real browser. OBJECT: the
`handleDrop` body. DIRECTION OF FAILURE: a drop that silently attaches nothing.
STEP: run the assertion at wave 2's gate and record the owner check as owner-only.
**If a later pass adds FOLDER intake, trap 3 (the 100-entry `readEntries()` limit)
returns with it and this residual widens.**

**RES-N15-4 - `src/app/components/snapshot-grading/` has no file input at all.**
OWNER: whoever takes the accessibility pass on path G - NOT N15, unless the section-9
fork lands there. INSTRUMENT: `grep -rn 'type="file"' src/app/components/snapshot-grading/`
(exit 1 today; canary on `grading-recording/` exits 0). OBJECT: the paste-and-drop-only
image intake at `SnapshotGradingPanel.tsx:550,722`. DIRECTION OF FAILURE: WCAG 2.2 SC
2.5.7 Level AA has no single-pointer alternative on that surface.
STEP: file it as its own backlog row; it is a pre-existing gap N15 found, not one it
created.

**RES-N15-5 - the zip grading path has no wire-budget check.**
OWNER: A39 wave 1, which already edits `src/app/actions/grading.ts`.
INSTRUMENT: `grep -nE "upload-budget|checkWireBudget|checkFileWireBudget" src/app/actions/grading.ts`
(exit 1, no output today; canary `grep -c "formData.get"` on the same file returns 8).
OBJECT: the `studentSubmissions` File at `grading.ts:709`. DIRECTION OF FAILURE: a zip
over 4.5 MB fails at the platform with an opaque error the app never sees.
STEP: raise it in A39 wave 1's verification. **N15 must not fix it - `grading.ts` is
not in any N15 wave's write set, and a seat reaching outside its list is how a sibling
agent's work gets reverted.**

**RES-N15-6 - no exact-key-set canary covers `ta-grading-*`.**
OWNER: A39, which already carries it as RES-A39-13
(`docs/a39-architecture.md:305`). INSTRUMENT: `grep -rn "ta-grading-source" src`,
which returns exactly two lines, both in `GradingTab.tsx` and neither in a test.
OBJECT: any future `ta-grading-*` key. DIRECTION OF FAILURE: a key is added, silently
covered by nothing, and a later removal goes unnoticed. STEP: N15 adopts whatever A39
lands on; it does not invent a competing canary.

**RES-N15-7 - HEIC decode in the browser.**
OWNER: the repo owner. INSTRUMENT: drop an iPhone HEIC onto the built surface and
report whether a preview appears. OBJECT: `createImageBitmap(file)` at
`useSnapshotCapture.ts:194`. DIRECTION OF FAILURE: it throws, `encodeFile` returns
`null`, and the instructor gets nothing. STEP: wave 3's N15-W3-3 makes `null` a named
message regardless, so the feature is safe either way; the residual is only about
whether HEIC WORKS. **Note the asymmetry, measured: `GEMINI_IMAGE_MIME_TYPES`
(`src/lib/grade/constants.ts:54-60`) includes `image/heic` and `image/heif`, so the
MODEL accepts what the BROWSER may not decode. Routing HEIC around the downscaler
would work for the model and blow the wire budget.**

**RES-N15-8 - the dollar cost of one vision call.**
OWNER: the repo owner. INSTRUMENT: the Gemini console's own usage report after one
real extraction. OBJECT: one `extractRubricImageAction` call at
`maxOutputTokens: 4096`. DIRECTION OF FAILURE: if it is materially more than a grading
call, the confirm argument in section 5 strengthens rather than weakens, so nothing in
this scope changes - but the criteria should state the real number. STEP: owner
reports it after the first production use. **No API key exists here
(`docs/loop/this-repo.md:225-227`), so this cannot be measured in this checkout.**

### Named as DELETIONS, not residuals

- **A named rubric library / picker.** `docs/a39-architecture.md:1060-1066` WITHDREW it
  (1 interaction ties a paste, so it fails that document's own metric) and recorded
  "Enforcer it protected: none; it was never built." **N15 does not revive it**, and
  anyone who wants to owes the measurement A39 named first.
- **Folder/batch rubric intake.** Deliberately not scoped. A rubric is one image. No
  enforcer protected it because it never existed. Reviving it re-opens trap 3.
- **Persisting the rubric IMAGE bytes.** Deliberately not scoped (section 7.3).
  DECISION 3 dropped the policy on the rubric TEXT only. Enforcer it protected: the
  non-persistence comments at `SnapshotRubricCaptureReview.tsx:29-32` and
  `useSnapshotRubricCapture.ts:42-46`, which stay true and must not be deleted by a
  pass that reads DECISION 3 too broadly.

---

## 12. What I could not determine

Stated rather than worked around, per `docs/loop/this-repo.md` section 6:

1. **What Gemini actually returns for a photographed rubric.** No API key, network
   blocked. Every claim about extraction QUALITY in this document is about the code
   path, never the output.
2. **Whether any of the four browser traps actually fires.** No component renders
   under vitest and the app cannot be driven without env vars. Traps 2, 4 and 6 are
   judged from the API contracts in `docs/a39-research.md:251-316` and from reading
   the two shipped handlers.
3. **A phone photo's real byte size** (RES-N15-1) and **HEIC browser decode**
   (RES-N15-7).
4. **Whether the owner wants path A, path F, or both** (section 9). Recommended, not
   defaulted.
5. **The cost of one vision call** (RES-N15-8).
6. **Whether A39's waves have landed.** I read `docs/a39-architecture.md` as a
   committed design and re-measured every fact I took from it against the tree. If
   A39 wave 3a has already shipped, the two panels' 990 and 970 counts in section 7.1
   are stale and must be re-measured before any N15 wave is dispatched.

---

## 13. Gates run over this file

MEASURED, exit codes read from a file rather than a pipe (`| tail; echo $?` reads
`tail`'s status, not the command's):

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
echo $? > exit.txt   # then cat exit.txt
```

Result: **exit 0**, read from `gate-exit.txt`, never from a pipe. The wrapper's
per-argument lines, verbatim:

```
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
 Test Files  2 passed (2)
      Tests  21 passed (21)
```

Write set, proven by `git status --short` run from the main checkout (not a
worktree):

```
 M docs/css-orphans.md            <- pre-existing at session start, not touched here
?? docs/n15-rubric-picture-scope.md   <- THIS FILE, the whole write set
```

An earlier run of the same command also listed `?? docs/a3-scope.md`, which a
concurrent agent has since committed. Neither it nor `docs/css-orphans.md` was
opened for writing by this pass. Nothing under `src/`, nothing under
`docs/a39-*`, nothing in `docs/backlog.yml` or `docs/BACKLOG.md`.

No character outside ASCII was written. No file outside
`docs/n15-rubric-picture-scope.md` was created or modified by this pass.
