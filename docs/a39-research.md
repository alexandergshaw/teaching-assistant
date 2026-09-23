# A39 research: how interaction cost gets removed from a grading workflow

**Seat:** external-facts research (`docs/loop/seats.md`, "External-facts research").
**Row:** A39 in `docs/backlog.yml` (the last row), filed from the owner's report of
2026-09-23 that grading is faster in an LLM chat than in this app.
**Date of every retrieval in this document:** 2026-09-23.
**Write set:** this file only.

## 0. What this document is, and what it deliberately is not

This is the OUTSIDE view. It answers "how does interaction cost get removed from
a workflow shaped like this one, and what does the evidence outside this repo
say about it". It is a design input for the architect pass that consumes A39.

**It contains no measurement of this repository and cites no file in it.** A
sibling agent owns `docs/a39-census.md`, which measures this app's own
interaction cost from its own code. Where this document needs a number about
this app, it names the census as the instrument and stops. Any sentence here
that asserts what this app currently does would be a brief-from-the-doc error
(`docs/loop/traps-spec.md`, "Brief from the tree, not from the doc"), so there
are none.

**It designs nothing.** Section 7 ranks candidate MOVES, not implementations.
Where a move implies a mechanism, the mechanism is named only to the depth
needed to state the objection against it.

### 0.1 The epistemic key, applied to every claim below

This project treats an unattributed quantity as a defect. Three labels are used
throughout and none is ever omitted:

| Label | Means |
|---|---|
| SOURCE | An external source says this. A URL and a retrieval date are given. |
| INFERENCE | My reasoning from one or more SOURCE claims. The sources it rests on are named. |
| NOT DETERMINED | I could not establish this here. It goes in the residual register (section 8) or is struck. |

**MEASURED does not appear in this document, because I measured nothing.** I ran
no command over this tree, opened no source file, and drove no browser. Every
quantity below is a SOURCE claim. That is the honest state and it is the reason
section 8 is long.

### 0.2 The instrument that produced every SOURCE claim, and its known weakness

Pages were retrieved with the `WebFetch` tool, which fetches a URL, converts it,
and answers a prompt against it **using a separate summarising model**. I did not
see raw HTML for any page. So a passage presented below in quotation marks is a
quotation **as that renderer returned it**, not a byte-for-byte transcription I
verified myself. Treat every quoted string as a paraphrase-grade citation with a
URL attached, good enough to locate and re-check, not good enough to litigate a
single word over.

A second, weaker instrument also appears: `WebSearch`, which returns an
LLM-written summary of search results without fetching the page. Anything that
rests only on that is labelled **SEARCH-SUMMARY-ONLY** at the point of use and in
section 9. Two claims in this document carry that label and neither is
load-bearing.

Where the two Baymard pages I fetched disagree with each other on the same
statistic, section 3.3 says so rather than picking the convenient one.

### 0.3 Disposition table

**None owed.** This is revision 1; no prior version of `docs/a39-research.md`
exists (`ls docs/a39*` at the time of writing returned only `docs/a39-census.md`,
the sibling's file). Nothing was restructured, so nothing could have been
silently dropped. If a later revision restructures this document, it owes the
table.

---

## 1. Why the chat feels fast, stated mechanically

This section is the frame the rest of the document is judged against, so it is
built in three parts: the cost model (SOURCE), the decomposition, and the
ranking (INFERENCE, with the argument shown).

### 1.1 The cost model

SOURCE. Nielsen Norman Group defines interaction cost as "the sum of efforts -
mental and physical - that users must deploy in interacting with a digital
product in order to reach their goals", and enumerates nine components that a
usable site minimises: reading; scrolling; **looking around to find relevant
information**; comprehending information; clicking or touching (without errors);
typing; **page loads and waiting times**; **attention switches**; and **memory
load - information users must retain to complete tasks**. Raluca Budiu,
2013-08-31, last reviewed 2024-10-14.
<https://www.nngroup.com/articles/interaction-cost-definition/>

This is the right model for A39 because five of the nine components are things a
chat charges zero for and an application charges for by default. A click count
alone would miss four of them - in particular memory load and attention
switches, which are exactly what a stored-but-hard-to-reach rubric imposes
(section 4).

SOURCE, SEARCH-SUMMARY-ONLY. The formal ancestor of counting interactions is the
Keystroke-Level Model (Card, Moran and Newell, *Communications of the ACM*,
1980, <https://dl.acm.org/doi/10.1145/358886.358895>), which decomposes a task
into primitive operators - keystroke, pointing, homing the hands, mental
preparation, and waiting on the system - and sums their times. The ACM page
returned HTTP 403 to my fetch, so I have the model's existence and shape from a
search summary and could not verify its published operator times or its stated
21 percent per-task prediction error. **No number from KLM is used anywhere
below.** It is cited only to make one structural point, which does not need its
constants: *homing* (moving the hands between devices) and *mental preparation*
are separately-counted operators, so a design that makes the user switch between
keyboard and mouse, or stop to decide which control to use, pays a real cost
that a pure click count does not show.

### 1.2 The decomposition

The owner's chat loop is: paste the rubric, paste the assignment description,
then paste each submission. Call it 2 + N pastes. Seven properties make it
cheap; each is named below with the interaction-cost components it zeroes.

**(a) No state to establish before the first result.** Nothing must be
connected, chosen, named or loaded before paste 1 produces output. Zeroes:
looking around, page loads, attention switches, and the entire prefix of clicks
and typing that precedes value.

**(b) No navigation.** One surface for the whole task, start to finish. Zeroes:
looking around to find relevant information, page loads, attention switches.

**(c) One input affordance for three kinds of content.** Rubric, description and
submission all go to the same textbox by the same gesture. Zeroes: the decision
of which control to use (a mental-preparation operator in KLM terms), and any
homing between keyboard and pointer.

**(d) No format contract.** The chat accepts whatever shape the content arrives
in - prose, a table, a screenshot, a half-formatted export. There is no naming
convention, no required file type, no zip layout. Zeroes: an entire error class,
rather than handling it.

**(e) Results stream, so the wait is occupied.** Output begins within a second or
two and continues, so the user reads while the system works.

**(f) Errors are conversational, not modal.** A wrong or incomplete paste is
answered in the transcript and repaired by typing another sentence. There is no
dialog to dismiss, no state to back out of, no form to re-satisfy.

**(g) No modality switch.** The user never leaves the text channel: no file
dialog, no OS picker, no drag from a window that must first be arranged beside
the browser.

### 1.3 The ranking, and the metric it uses

INFERENCE. Ranked by **cost removed on the FIRST assignment, at N = 1**, not by
cost removed in steady state. The justification for that metric is the whole of
A39: the owner formed this judgement by comparing the two tools, and an
instructor who finds the app slower on the first assignment never reaches the N
at which batching would have won. A property that only pays at N = 40 cannot
rescue a tool abandoned at N = 1.

A second tie-break: a cost that can become **unbounded or infinite** outranks a
cost that is merely large. A step the user cannot complete at all (no connection,
no correctly-named export) does not cost ten clicks, it costs the task.

| Rank | Property | Why here |
|---|---|---|
| 1 | (a) No state before the first result | The only property whose absence can make the cost INFINITE: an instructor who cannot satisfy a prerequisite grades nothing. It is also paid entirely before any value is delivered, which is the condition under which abandonment is documented (section 3.3, Baymard: 24 percent of US shoppers abandoned a cart in a quarter over forced account creation alone). Everything else on this list is a cost paid while getting value. |
| 2 | (b) No navigation | Hits three of NN/g's nine components at once (looking around, page loads, attention switches), and it is paid REPEATEDLY - once per input in the worst case, so it scales with N as well as with setup. |
| 3 | (d) No format contract | Removes an error class rather than handling one. A format error's cost is unbounded in the same way as (a): the repair may be outside the app entirely (re-export, rename, re-zip), and the user may fail it. Ranked below (b) only because a format contract is usually paid once per assignment rather than per input. |
| 4 | (c) One affordance for three content kinds | Removes a decision and a device switch on every input, so it scales with N. Ranked below (d) because its per-instance cost is small and bounded - it is friction, not a wall. |
| 5 | (f) Conversational errors | Real, and it compounds with (d): the chat both prevents fewer errors and recovers from them more cheaply. Ranked here because it only fires when something goes wrong. |
| 6 | (g) No modality switch | Genuinely cheap in the chat, but it overlaps heavily with (a) and (c), and section 2 shows that the app can match it for most input kinds with buildable APIs. Low marginal information for the architect. |
| 7 | (e) Streaming output | Ranked LAST deliberately, and this is the ranking's most useful claim. Streaming changes PERCEIVED cost, not actual cost. SOURCE: NN/g's response-time limits are 0.1s (feels instantaneous), 1.0s (flow of thought uninterrupted), and 10s (limit of attention on the dialogue) - Jakob Nielsen, 1993-01-01, from *Usability Engineering* ch. 5, <https://www.nngroup.com/articles/response-times-3-important-limits/>. SOURCE: progress feedback buys tolerance - users shown a moving feedback bar "experienced higher satisfaction and were willing to wait on average 3 times longer than those who did not see any progress indicators"; a looped animation is for 2-10s waits, a percent-done indicator for 10s and above. Katie Sherwin, 2014-10-26, <https://www.nngroup.com/articles/progress-indicators/>. Tripling tolerance for a wait is worth having, and it is not the same thing as removing a step. |

**The load-bearing consequence of this ranking, for the architect.** The chat's
advantage is concentrated in FIXED cost - the cost paid once, before the first
result. The app's structural advantage is in MARGINAL cost, because one drop of
forty files can be one interaction where the chat charges forty pastes. So the
two curves cross. The design question is not "is the app faster" but **at what N
does the app's total cost fall below 2 + N**, and the answer must be N = 1 or as
near to it as the work allows, because that is the only N the instructor
evaluates on. Every move in section 7 is ranked against that.

---

## 2. The paste/drop affordance as a primitive

The owner said "paste/drop" for all three inputs. This section establishes what
a single target that accepts everything actually costs to build, what it cannot
do, and where support is uneven.

### 2.1 The four intake kinds and the API that serves each

SOURCE. **Pasted text and rich text.** The `paste` event "is fired when the user
has initiated a paste action through the browser's user interface", and "a
handler for this event can access the clipboard contents by calling `getData()`
on the event's `clipboardData` property". MDN, `Element: paste event`,
<https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event>. The
`clipboardData` object is a `DataTransfer`, so `getData("text/plain")` and
`getData("text/html")` both work from the same event; rich text arrives as HTML
when the source app offers it.

SOURCE. **Pasted images and pasted files.** "For clipboard operations, files can
also be read in the handler for the `paste` event, using
`ClipboardEvent.clipboardData`." MDN, `DataTransfer.files`,
<https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/files>.

SOURCE. **The asynchronous alternative.** `navigator.clipboard.read()` "requests
a copy of the clipboard's contents"; it "can in theory return arbitrary data
(unlike `readText()`...). Browsers commonly support reading text, HTML, and PNG
image data." It is marked **Baseline 2024 - newly available since June 2024**,
and is available only in secure contexts. MDN, `Clipboard: read()`,
<https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/read>.

SOURCE. **What reading the clipboard costs in permissions.** "When reading from
the clipboard, the specification requires that a user has recently interacted
with the page (transient user activation) and that the call is made as a result
of the user interacting with a browser or OS 'paste element' (such as choosing
'Paste' on a native context menu)." MDN, Clipboard API,
<https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API>.
INFERENCE from that: the `paste` **event** is the cheap route and the async
`read()` is not a substitute for it. An app cannot silently pull the clipboard
to save the user a keystroke; it can only handle the paste the user already
performed. This matters because "read the clipboard on focus so the user does
not even have to press Ctrl+V" is an obvious-sounding optimisation and the
platform forbids it.

SOURCE. **Dragged files.** `DataTransfer.files` is a read-only `FileList` of the
files in a drag operation, readable "during the `drop` event"; accessing the
property from other drag events returns an empty list. MDN, as above.

SOURCE. **Dragged folders.** `DataTransferItem.webkitGetAsEntry()` returns a
`FileSystemFileEntry` for a file and a `FileSystemDirectoryEntry` for a
directory. It "can only be called during `dragstart` and `drop`"; calling it from
any other drag event returns `null`. It is read-only. It carries a portability
note: "This function is implemented as `webkitGetAsEntry()` in non-WebKit
browsers including Firefox at this time; it may be renamed to `getAsEntry()` in
the future, so you should code defensively, looking for both." MDN,
<https://developer.mozilla.org/en-US/docs/Web/API/DataTransferItem/webkitGetAsEntry>

SOURCE. **The newer handle-based route, and its support.** The File System
Access API's `DataTransferItem.getAsFileSystemHandle()` returns a
`FileSystemFileHandle` or `FileSystemDirectoryHandle` and allows write access;
support is given as **Chrome 86+ and Edge 86+, with Firefox and Safari lacking
it**, while the older `webkitGetAsEntry()` is given as **Chrome 13+, Edge 14+,
Firefox 50+, Safari 11.1+**. The article recommends progressive enhancement:
modern method first, `webkitGetAsEntry()` second, plain `getAsFile()` last.
web.dev, "How to drag and drop directories",
<https://web.dev/articles/files/drag-and-drop-directories>

SOURCE. **The picker fallback for folders.** `webkitdirectory` on an
`<input type="file">` causes it to "offer directories for the user to select
instead of files", and "when a directory is selected, the directory and its
entire hierarchy of contents are included in the set of selected items". Marked
**Baseline 2025 - newly available since August 2025**. MDN,
<https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory>

### 2.2 What each cannot do - stated plainly, because these are the traps

1. **Paste cannot carry a folder. At all.** Only a drag, or the directory
   picker, can. INFERENCE from the API surface above: there is no clipboard
   format for a directory tree exposed to the page. A design that promises
   "paste or drop anything" must therefore either accept that folders are
   drop-or-browse only, or say so in the copy.

2. **`DataTransferItem.kind` cannot tell a folder from a file.** SOURCE:
   "the Drag and Drop interface's `DataTransferItem.kind` will be `"file"` for
   both files *and* directories, whereas the File System Access API's
   `FileSystemHandle.kind` will be `"file"` for files and `"directory"` for
   directories" (web.dev, as above). INFERENCE: a router that dispatches on
   `kind` will treat a dropped folder as a file and produce an empty or
   nonsensical result. You must call `webkitGetAsEntry()` and test `isDirectory`.
   This is the single most likely silent-wrong-behaviour bug in a
   route-by-content-type drop zone.

3. **Directory reads truncate at 100 in Chromium unless you loop.** SOURCE: "In
   Chromium-based browsers, `readEntries()` will only return the first 100
   `FileSystemEntry` instances. In order to obtain all of the instances,
   `readEntries()` must be called multiple times", and the callback receives an
   empty array when there is nothing left. MDN,
   <https://developer.mozilla.org/en-US/docs/Web/API/FileSystemDirectoryReader/readEntries>.
   INFERENCE: a folder of 120 submissions, read with one `readEntries()` call,
   silently yields 100 and reports success. This is a silent-truncation-at-a-
   bound defect introduced by the platform rather than by the feature, and it is
   invisible to any test that uses a fixture folder smaller than 100.

4. **The drag data store closes.** SOURCE: `webkitGetAsEntry()` is readable only
   in `dragstart`/`drop`, and `DataTransfer.files` likewise (both MDN, above).
   INFERENCE: every item must be harvested from `dataTransfer.items`
   **synchronously inside the drop handler**, before the first `await`. Code that
   awaits a network call and then walks `items` gets nothing. This is a
   well-known trap and it fails only at runtime, in a browser - which is exactly
   the class this checkout cannot observe.

5. **Clipboard file paste has an uneven history.** SOURCE: Mozilla bug 1699743,
   "clipboardData.items does not support pasting files correctly", reports that
   files were converted to `image/png` regardless of type, that
   `DataTransferItem#getAsFile` returned `null` for most non-image types, that
   only one file could be pasted at a time, and that drag-and-drop supported
   files properly while paste did not. Its status is **RESOLVED FIXED**, targeted
   at the **Firefox 116** branch.
   <https://bugzilla.mozilla.org/show_bug.cgi?id=1699743>. NOT DETERMINED: I did
   not verify in any browser what any current version actually does. The safe
   reading for design is that **dropping files is the reliable route across
   engines and pasting files is the convenient one**, so a design must not make
   paste the only way to supply a file.

6. **Dragging cannot be the only route, as a matter of conformance.** SOURCE:
   WCAG 2.2 Success Criterion 2.5.7 Dragging Movements, **Level AA**: "All
   functionality that uses a dragging movement for operation can be achieved by a
   single pointer without dragging, unless dragging is essential or the
   functionality is determined by the user agent and not modified by the
   author." Its intent is to serve people who use a trackball, head pointer,
   eye-gaze system or speech-controlled mouse emulator, for whom dragging is
   cumbersome and error-prone.
   <https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html>.
   INFERENCE: a click-to-browse control is **not** an anti-pattern to be deleted -
   it is the conformance alternative. Section 6 says what to do with it instead.

7. NOT DETERMINED: touch and mobile. I found no source establishing whether a
   folder can be dragged into a browser from a mobile file manager. Section 8
   carries it as a residual rather than an assumption.

### 2.3 Verdict: is one target that accepts everything achievable?

INFERENCE, from the six SOURCE blocks above. **Yes, with progressive enhancement,
and the cost is concentrated in correctness rather than in effort.** One surface
element can be simultaneously a `paste` target and a `drop` target, and can route
on: `clipboardData`/`dataTransfer` MIME types for text and HTML; `files` for
images and documents; and `webkitGetAsEntry().isDirectory` for folders, with
`getAsFileSystemHandle()` preferred where present. Everything it needs is either
Baseline or supported in all four engines by the compat figures quoted in 2.1.

The build cost is four specific things, none of them large but all of them
mandatory:

- a synchronous harvest of `dataTransfer.items` before any await (trap 4);
- a `readEntries()` drain loop that terminates on the empty array (trap 3);
- an `isDirectory` test rather than a `kind` test (trap 2);
- a single-pointer alternative on the same surface for SC 2.5.7 (trap 6).

And one design cost that is not an API problem: **a router that guesses wrong
silently is worse than three labelled fields.** If the app cannot tell a rubric
from an assignment description from a submission, it must show what it decided
and let the user move it in one interaction. That receipt is part of the
primitive, not a nicety - it is what makes routing safe enough to be worth the
step it removes.

---

## 3. Removing setup rather than speeding it up

### 3.1 The ordering rule, which is the section's main finding

SOURCE. NN/g's EAS framework for forms is explicitly ordered: "**Eliminate
first:** Remove questions that are nonessential, nonurgent, or irrelevant.
**Automate where possible:** Minimize manual input by leveraging existing or
inferable data. **Simplify what remains:** Speed up input with helpful defaults,
alternative input, and smart formatting." Huei-Hsin Wang, 2025-03-07,
<https://www.nngroup.com/articles/eas-framework-simplify-forms/>

INFERENCE: this is the direct answer to the row's own warning that "the scope
must not assume the remedy is a faster upload". Speeding up a step is the THIRD
option in a published ordering; deleting it and inferring it both rank above.

### 3.2 Deferring rather than removing: progressive disclosure

SOURCE. "Initially, show users only a few of the most important options. Offer a
larger set of specialized options upon request." It improves three usability
components: "learnability, efficiency of use, and error rate." Jakob Nielsen,
2006-12-03, <https://www.nngroup.com/articles/progressive-disclosure/>.

Honesty note: I fetched this page specifically looking for a quantitative claim
and there is none. The article "contains no specific quantitative claims
regarding percentage improvements". So progressive disclosure is a well-attested
pattern with a named mechanism, cited here without a number, and anyone who
later writes "progressive disclosure gives an X percent improvement" is inventing
it.

### 3.3 What asking for configuration before value actually costs

This is the question the brief asks to answer with evidence.

SOURCE, primary figure. "24% of US internet shoppers have abandoned one or more
shopping carts during the past quarter due solely to **forced account creation**"
- 4,384 respondents, US adults, 2022. Baymard Institute, "Make Guest Checkout
Prominent", <https://baymard.com/blog/make-guest-checkout-prominent>

SOURCE, and a disagreement worth recording. A second Baymard page states "19% of
users abandoned a checkout if they're forced to create an account" and gives no
sample size, population or year.
<https://baymard.com/blog/reduce-cart-abandonment>. **The same publisher reports
19 and 24 for what reads as the same phenomenon.** I use the 24 percent figure
because it is the one carrying its sample and date, and I record the
disagreement rather than silently choosing. Neither figure should be quoted
downstream without this note.

SOURCE. The mechanism, independent of the number: "Login walls require a
significant interaction cost: users must remember their credentials (if they
have an account) or take the time to create a new account", and deferring the
credential step "takes advantage of the reciprocity principle: once you've helped
users smoothly complete their transaction, they may be grateful for a pleasant
experience and willing to create an account." The guidance: "if there is the
slimmest chance that those benefits are not evident, forego the login wall -
either all together or by pushing it to the point where users are convinced of
the logic behind it." Raluca Budiu, 2014-03-02,
<https://www.nngroup.com/articles/login-walls/>

INFERENCE, and this is the transferable part rather than the e-commerce number:
**configuration demanded upfront is demanded at the moment the user has the least
information with which to answer it.** The instructor being asked to pick a
course before seeing any grading output does not yet know whether the grading is
any good, so the question is both a cost and a bet. Moved to the point of
write-back, the same question is cheap, because by then the answer is obviously
worth giving.

### 3.4 Defaults instead of choices

SOURCE, SECONDARY. Johnson and Goldstein, "Do Defaults Save Lives?", *Science*
vol. 302, 2003 (<https://www.science.org/doi/10.1126/science.1091721>, which
returned HTTP 403 to my fetch). Consent rates in their online experiment are
reported as **42 percent under an opt-in default, 82 percent under opt-out and
79 percent under a neutral condition**, via The Decision Lab,
<https://thedecisionlab.com/intervention/how-default-settings-doubled-organ-donation-rates-in-the-us>.
Labelled SECONDARY because I could not open the *Science* paper; the numbers
should be treated as approximately right and not quoted as measured.

INFERENCE, the design reading and the caution together: a default is not a
convenience, it is a decision, because most users take it. That cuts both ways.
It is the argument FOR pre-selecting a most-recently-used rubric (section 4) and
simultaneously the argument for making that pre-selection **visible and
one-interaction reversible**, because a silently-applied wrong default is not a
saved click, it is a wrong grade with no audit trail.

### 3.5 What deferring tools do instead - the four patterns, consolidated

INFERENCE from 3.1 to 3.4 together:

1. **Eliminate.** Ask whether the answer changes any output the user will see in
   this session. If not, the question is not setup, it is a preference, and it
   belongs after the first result or nowhere.
2. **Infer.** Derive the answer from what the user already supplied. Inference is
   free to the user and its failure mode is a correctable wrong guess, whereas a
   question's failure mode is an abandoned task.
3. **Default and correct.** Preselect, show what was selected, and make the
   override cost one interaction. This is strictly better than asking *provided*
   the correction is visible; without visibility it is worse than asking.
4. **Work before connecting.** Let the first result happen with no account, no
   connection and no course, and offer the connection at the point where it buys
   something concrete (write-back), which is also the point at which the user
   will agree to it (the reciprocity argument, 3.3).

---

## 4. Making a stored value cheaper to reach than to re-paste

This is the crux of the row and it deserves an explicit budget rather than a
list of patterns.

### 4.1 The budget

INFERENCE. What does the chat actually charge to re-supply a rubric? Not one
paste. The full loop is: switch to wherever the rubric lives, select it, copy,
switch back, paste - roughly five operations, two of which are attention
switches (an NN/g interaction-cost component,
<https://www.nngroup.com/articles/interaction-cost-definition/>). But the
instructor's PERCEPTION is anchored on the last step, and if their rubric
document is already open the true cost is nearer two.

So the budget for reaching a stored rubric in the app is **between one and four
interactions depending on an unknown - whether the source document is already
open - and the only value that is safe against every case is ZERO.** Any recall
pattern that requires navigate-then-search-then-select has already lost before
it is built, and no amount of polish on the picker recovers it. State that as the
design constraint rather than as a preference.

NOT DETERMINED: whether the owner's rubric is typically already open in another
window. That single fact moves the budget by a factor of two and only the owner
can answer it. Residual RES-A39-5.

### 4.2 The heuristics this rests on

SOURCE. Heuristic 6, Recognition rather than recall: "Minimize the user's memory
load by making elements, actions, and options visible. The user should not have
to remember information from one part of the interface to another." Heuristic 7,
Flexibility and efficiency of use: "Shortcuts - hidden from novice users - may
speed up the interaction for the expert user so that the design can cater to both
inexperienced and experienced users. Allow users to tailor frequent actions."
Jakob Nielsen, 1994-04-24, last reviewed 2024-01-30,
<https://www.nngroup.com/articles/ten-usability-heuristics/>

INFERENCE: a stored rubric behind navigation converts a paste into a SEARCH, and
search charges two of the nine cost components that pasting charges zero for -
looking around to find relevant information, and memory load (what did I call
it?). That is why a stored value can genuinely be more expensive than a
re-supplied one, which is the counter-intuitive claim at the centre of A39.

### 4.3 The four patterns, what makes each cheap, and where each degrades

| Pattern | Why it is cheap | Where it degrades |
|---|---|---|
| **Most-recently-used default** | Zero interactions in the common case: the value is already there when the surface opens. It is the only pattern that can hit the zero-interaction target in 4.1. Its power is the default effect (3.4). | Degrades exactly when "most recent" is not "right" - a second course, a second assignment type, a rubric revised mid-marking. Failure mode is SILENT and asymmetric: a wrong rubric applied without being noticed produces wrong grades that look fine. Mitigation is not a confirmation dialog (section 6) but a visible, named, one-interaction override. |
| **Inline picker on the same surface** | Removes the page load and the attention switch; keeps the rest of the task visible while choosing. SOURCE for why leaving the surface hurts: NN/g's wizard guidance warns that modal steps obstruct users who "need information from elsewhere in the application to complete steps" (<https://www.nngroup.com/articles/wizards/>). | Degrades as the list grows - an inline list of 200 rubrics is scrolling, which is its own cost component. Also competes for vertical space with the thing being graded. |
| **Type-ahead / combobox** | Converts recognition-plus-scrolling into a few keystrokes, and keeps the hands on the keyboard (no homing). SOURCE: for lists beyond roughly 15 options, "consider a combobox - a text field paired with a filterable dropdown list"; and "for readily known values... typing is often faster than selecting from a dropdown". Huei-Hsin Wang, 2026-07-17, <https://www.nngroup.com/articles/dropdown-list/> | Degrades when the user cannot produce the name - which re-imposes exactly the memory load heuristic 6 forbids. Also degrades below about 15 options, where exposing the choices directly is cheaper than typing. SOURCE on execution difficulty: autocomplete is provided by 80 percent of e-commerce sites and only 19 percent get all the design details right (Baymard, 2022-08-02, <https://baymard.com/blog/autocomplete-design>) - easy to ship, hard to ship well. Note: that article is explicitly about the suggestion list only and says nothing about zero-state or recent queries, so it does not support the MRU row above and is not cited there. |
| **Pre-selection with a visible override** | Combines rows 1 and 3: costs zero when right, one interaction when wrong, and never hides which value is in force. | Degrades when the override is visible but ambiguous - if the label does not distinguish two similarly-named rubrics, the user must open something to check, and the pattern has quietly become navigation again. |

SOURCE, for the pattern NOT to reach for. Dropdowns hide every option behind a
click; NN/g's guidance is that they are the wrong control when there are few
options (radio buttons expose all choices and need one click), when there are
many (use a combobox), and when the value is readily known (typing wins).
<https://www.nngroup.com/articles/dropdown-list/>

### 4.4 The claim that survives

INFERENCE. "A chat cannot remember a rubric; this app can" is the row's framing
and section 5.3 shows it is **false as stated**. What is true is narrower and
still decisive: the app can make the remembered rubric cost **zero
interactions** to apply, which no chat does, because a chat with a persistent
project still re-supplies its instructions as part of a conversation the user
must start and steer. The advantage is not memory. It is memory at zero
interaction cost, with the applied value visible.

---

## 5. What genuinely cannot be done in a chat - adversarially

The brief asks for rigour here because this is the product's case. I attacked
each candidate and two of the five do not survive in the form the row states
them.

### 5.1 Batch over many submissions without re-pasting - SURVIVES, RESTATED

The weak version fails: modern chat clients accept multiple file attachments in
one message, so "you cannot give a chat forty files" is not true.

The strong version survives, and it is a different claim. SOURCE: Liu et al.,
"Lost in the Middle: How Language Models Use Long Contexts", TACL, arXiv
2307.03172, 2023-07-06: "performance can degrade significantly when changing the
position of relevant information... performance is often highest when relevant
information occurs at the beginning or end of the input context, and
significantly degrades when models must access relevant information in the middle
of long contexts, even for explicitly long-context models."
<https://arxiv.org/abs/2307.03172>

INFERENCE: forty submissions in one context are not forty independent gradings.
Submission 20 sits in the middle of the context that the cited paper shows is the
worst-served position, and it competes for attention with 39 others. An
application that issues N independent calls, each carrying one submission and the
same pinned rubric, is not merely more convenient - it produces a structurally
different and more defensible artefact. **State the advantage as per-submission
isolation under identical terms, never as "a chat cannot take many files".**

### 5.2 Unattended runs - SURVIVES INTACT

INFERENCE, and I could not falsify it. The owner's loop requires a human to send
each message; there is no message, no grading. Scheduled or agentic products
exist, but they are not the tool the owner described and adopting one is itself a
setup cost of the kind section 3 is about. This is the cleanest advantage on the
list and the only one I could not weaken.

### 5.3 One rubric held constant across a class - DOES NOT SURVIVE AS STATED

SOURCE. Anthropic, "Collaborate with Claude on Projects", 2024-06-25: Projects
"ground Claude's outputs in your internal knowledge"; users can "define custom
instructions for each Project"; "each project includes a 200K context window, the
equivalent of a 500-page book". <https://www.anthropic.com/news/projects>

INFERENCE: **a chat can remember a rubric.** An instructor who puts the rubric in
project knowledge and the grading instruction in project instructions pastes it
once, ever. The row's premise that "a chat cannot remember a rubric" is false for
any Projects user, and a leverage claim built on it would fail a check.

What survives is narrower and worth more: **provenance.** Project instructions
can be edited at any time with no record of what was in force when a given answer
was produced; a stored, versioned rubric bound to a stored grade can state which
text produced which score. That is a claim about a typed record, not about
memory, and it is the form the architect should carry forward.

SOURCE, supporting why consistency is not free even with one rubric: an EFL
essay-scoring study re-scored 192 essays with GPT-4 after three weeks and
reported test-retest quadratic weighted kappa of 0.862 overall (ICC 0.892), but
unweighted Cohen's kappa between 0.392 and 0.723, "reflecting less frequent exact
category matches despite overall score proximity". Bayan AlAmir, *Frontiers in
Education*, 2026-08-13,
<https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2026.1861960/full>.
INFERENCE: holding the rubric constant is necessary and not sufficient; exact
category agreement across runs is materially lower than rank agreement, so any
claim that the app delivers "consistent" grades must be about the terms held
constant, not about identical outputs.

### 5.4 Writing grades back to the LMS - SURVIVES AS COST, NOT AS CAPABILITY

SOURCE. Canvas exposes both a single-submission grading endpoint,
`PUT /api/v1/courses/:course_id/assignments/:assignment_id/submissions/:user_id`
("Comment on and/or update the grading for a student's assignment submission"),
and a bulk endpoint, `POST /api/v1/courses/:course_id/submissions/update_grades`,
which "Returns a Progress object" - that is, it runs asynchronously as a
background job. <https://canvas.instructure.com/doc/api/submissions.html>

SOURCE, the adversarial finding. Community MCP servers already connect chat
assistants to Canvas with write access. One of them documents "165 tools",
of which "117 tools are read-only and 48 tools perform Canvas write operations",
including `grade_submission` and `comment_on_submission`, authenticated with a
Canvas personal access token the instructor generates themselves; it also records
that Canvas has no undo, applies per-user rate limits, and that bulk operations
should be serialised. <https://github.com/bruchris/canvas-lms-mcp>

INFERENCE: "a chat cannot write a grade back" is **false** for an instructor
willing to install an MCP server and mint an API token. The honest advantage is
that the app removes that setup - which is section 3's argument turned around,
and is therefore consistent rather than convenient - and that it can use the bulk
endpoint rather than N conversational turns. State it as setup cost plus
throughput, not as impossibility.

### 5.5 Durable records - DOES NOT SURVIVE ON ITS OWN

INFERENCE. A chat transcript is durable and searchable. "The app keeps a record"
is therefore not a differentiator by itself; it is a transcript with extra steps.
The advantage exists only when a record is **read back by a different act** - a
later assignment reusing the rubric, a class-level view aggregating the run, a
write-back reading the stored score. If no second reader exists, the claim should
be withdrawn rather than restated.

### 5.6 The honest short list

Ranked by how well each survived attack:

1. **Unattended execution.** Survives intact (5.2).
2. **Per-submission isolation under identical terms at N.** Survives, restated
   (5.1).
3. **Write-back with no integration for the instructor to build.** Survives as
   setup cost and throughput, not as capability (5.4).
4. **Provenance: which rubric text produced which grade.** Survives as a
   narrowed replacement for "memory" (5.3).
5. **Durable records.** Survives only when a named later reader exists (5.5).

And one concession to state plainly rather than bury: **a chat can remember a
rubric.** Any A39 leverage claim that says otherwise is falsifiable by opening
Projects.

---

## 6. Anti-patterns, with evidence

### 6.1 Confirmation steps that protect nothing - and the one that is earned

SOURCE. Use confirmation dialogs "before committing to actions with serious
consequences - such as destroying users' work or costing large amounts of
money". Do not use them for routine actions: "Like in Aesop's fable, if you cry
wolf too many times, people will stop paying attention." And "try your best to
offer undo". Jakob Nielsen, 2018-02-18, last reviewed 2026-08-07,
<https://www.nngroup.com/articles/confirmation-dialog/>

INFERENCE, and this is the boundary the brief asked for. This app spends real
money per model call. **A confirmation before a run that will issue N model
calls is the exact case the cited source names** - "costing large amounts of
money" - so it is EARNED, and removing it to save a click would be a bad trade
that the evidence does not support. The test to apply to every other confirm:

> A confirmation is earned only if the action is either irreversible or costly.
> If it is both reversible and cheap, the confirmation is the cry-wolf case and
> should become an undo.

INFERENCE, the consequence for the spend confirm specifically: if it is the only
confirmation in the flow it retains its force; if it is the fourth dialog the
instructor has dismissed, habituation has already spent it. So deleting the
unearned confirmations is partly how you PROTECT the earned one, not merely how
you save clicks.

### 6.2 Wizards that serialise what could be one screen

SOURCE. A wizard is "a step-by-step process that allows users to input
information in a prescribed order and in which subsequent steps may depend on
information entered in previous ones". It works best "for novice users or
infrequent processes (e.g., configuration or setup)". It is cautioned against
when repeated use is required ("the tedium of clicking through steps becomes
burdensome with frequent invocation"), when users need to compare information
across steps, when steps could beneficially be completed in any order, and when
users need information from elsewhere in the application. Raluca Budiu,
2017-06-25, <https://www.nngroup.com/articles/wizards/>

INFERENCE: grading an assignment is by definition a repeated task, and the three
inputs (rubric, description, submissions) have no required order - any of them
can be supplied first. **Both of the source's own contraindications apply**, so a
serialised setup flow here is contraindicated by the guidance rather than merely
disliked. The pattern that replaces it is section 3.2's progressive disclosure:
one screen, with the rarely-changed parts collapsed.

### 6.3 Modal file pickers where a drop target would do - with the correction

INFERENCE from section 2. A modal OS picker charges a modality switch, a
directory traversal, and - if the app has a naming or packaging contract - a
possible failure the user must leave the app to repair. A drop target charges one
drag. So preferring the drop target is right.

**But the picker must not be deleted.** SOURCE: WCAG 2.2 SC 2.5.7 (Level AA)
requires that all functionality using a dragging movement "can be achieved by a
single pointer without dragging", for users of trackballs, head pointers,
eye-gaze systems and speech-controlled mouse emulators
(<https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html>). The
correct shape is therefore **one surface carrying both**: a paste/drop target as
the primary affordance with a click-to-browse control on the same surface as the
conformance alternative. Replacing a picker with a drop zone is a fix; replacing
it with a drop zone ONLY is an accessibility regression that trades one user's
clicks for another user's access.

### 6.4 Silent truncation at a platform bound

SOURCE. `readEntries()` returns at most 100 entries per call in Chromium and must
be called repeatedly
(<https://developer.mozilla.org/en-US/docs/Web/API/FileSystemDirectoryReader/readEntries>).

INFERENCE: this is an anti-pattern the PLATFORM introduces into any folder-drop
feature, and it fails silently and only above a threshold no small fixture
reaches. Any folder intake must state the count it read back to the user, so that
a truncation is visible as a wrong number rather than invisible as a short list.

### 6.5 Treating a progress indicator as a substitute for speed

SOURCE. Progress feedback tripled willingness to wait; loop animations suit 2-10s
waits and percent-done indicators suit 10s and above (Sherwin, 2014-10-26,
<https://www.nngroup.com/articles/progress-indicators/>); the 10-second limit is
where attention leaves the dialogue altogether (Nielsen, 1993,
<https://www.nngroup.com/articles/response-times-3-important-limits/>).

INFERENCE: worth building, and it belongs at rank 7 of section 1.3 rather than
rank 1. A feature whose answer to "the app is slower than a chat" is a nicer
spinner has answered a different question.

---

## 7. Ranked shortlist of candidate moves

**The ranking metric, stated so it can be argued with: interaction cost removed
at N = 1, divided by build risk.** N = 1 because of section 1.3's argument that
the first assignment is the only one the instructor evaluates on. Build risk is
judged as low when the move mostly deletes or defers existing behaviour, and
higher when it requires new runtime behaviour with browser-only failure modes.

No implementation is designed here, and no file in this repo is named. Each move
carries a pass condition in the form this loop requires: **the object under
comparison, the instrument producing each quantity, and the direction of
failure.** Because nothing in this checkout renders a component
(`docs/loop/this-repo.md` section 6), the instrument for every interaction count
below is **the census method in `docs/a39-census.md`, confirmed by the owner
against the real screen** - not a test run, and no move's pass condition may
claim otherwise.

### M1. Deliver the first graded result before any account, connection or course selection

- **Cost removed:** the entire fixed prefix, which section 1.3 ranks first and
  which is the only cost that can be infinite.
- **Evidence:** forced account creation alone accounted for 24 percent of US
  shoppers abandoning a cart in a quarter (4,384 respondents, 2022, Baymard,
  <https://baymard.com/blog/make-guest-checkout-prominent>); login walls have
  "significant interaction cost" and deferring them exploits reciprocity (Budiu,
  <https://www.nngroup.com/articles/login-walls/>); EAS puts Eliminate before
  Simplify (Wang, <https://www.nngroup.com/articles/eas-framework-simplify-forms/>).
- **Build risk:** LOW to MEDIUM. Mostly deferral of existing gates rather than
  new behaviour - but it may require a coherent "no course yet" working state,
  which is a real design question, not a flag.
- **Objection against it:** a result produced with no course attached may be
  unattachable later, so the deferral can convert a setup cost into a rework
  cost. The move is only sound if the deferred question can be answered
  afterwards without discarding the work. If it cannot, this drops below M2.
- **Pass condition.** OBJECT: the number of interactions between opening the app
  cold and the first graded submission appearing, compared before and after.
  INSTRUMENT: the census walkthrough, owner-confirmed on the real screen.
  DIRECTION OF FAILURE: RED if that number does not fall, or if any interaction
  removed from before the first result reappears as an interaction after it.

### M2. Pre-select the most recently used rubric, visibly, with a one-interaction override

- **Cost removed:** the recall cost in section 4.1, driven to zero in the common
  case - the only pattern in section 4.3 that reaches zero.
- **Evidence:** recognition rather than recall and the accelerator heuristic
  (Nielsen, <https://www.nngroup.com/articles/ten-usability-heuristics/>);
  defaults dominate outcomes (Johnson and Goldstein 2003, SECONDARY via
  <https://thedecisionlab.com/intervention/how-default-settings-doubled-organ-donation-rates-in-the-us>);
  "looking around to find relevant information" and "memory load" are two of the
  nine cost components a search re-imposes
  (<https://www.nngroup.com/articles/interaction-cost-definition/>).
- **Build risk:** LOW. A stored last-used value and a label.
- **Objection against it:** the failure mode is silent and produces wrong grades
  that look right (section 4.3). This move is only safe WITH the visible label,
  and a version that pre-selects without showing what was selected is worse than
  the status quo. It must not be softened into a confirmation dialog - that is
  section 6.1's cry-wolf case.
- **Pass condition.** OBJECT: the interactions needed to apply a previously used
  rubric to a new assignment, and separately the interactions needed to apply a
  DIFFERENT one. INSTRUMENT: the census walkthrough, owner-confirmed.
  DIRECTION OF FAILURE: RED if the first is greater than zero, or if the second
  is greater than the pre-change cost (a default that makes the non-default case
  more expensive has moved cost, not removed it), or if the applied rubric's
  identity is not visible on the surface without opening anything.

### M3. One intake target that accepts pasted text, pasted images, dropped files and dropped folders, routed by content type, with a visible receipt

- **Cost removed:** properties (b), (c), (d) and (g) of section 1.2 at once - the
  single largest bundle available. Turns N file selections into one drag.
- **Evidence:** the whole of section 2. Every required API is Baseline or
  supported in all four engines by the compat figures in 2.1; `paste` carries
  text, HTML and files; `drop` carries files; `webkitGetAsEntry` carries folders;
  `webkitdirectory` is the picker fallback (Baseline since August 2025).
- **Build risk:** MEDIUM, and concentrated in four named traps (2.3): synchronous
  harvest, the `readEntries` drain loop, `isDirectory` rather than `kind`, and
  the SC 2.5.7 single-pointer alternative. All four fail only in a browser, and
  this checkout renders nothing, so none of them can be caught by the suite.
- **Objection against it:** a router that misclassifies silently is worse than
  three labelled fields, because a rubric graded as a submission is a wrong
  result that looks like a right one. The receipt is not optional polish - if the
  receipt is cut for scope, the move should be cut with it.
- **Pass condition.** OBJECT: for each of the four intake kinds, the interactions
  from "content in hand" to "content accepted by the app", and the app's stated
  classification of each. INSTRUMENT: the census walkthrough for the counts;
  owner verification in a real browser for the classification and for folder
  counts above 100 entries. DIRECTION OF FAILURE: RED if any kind still requires
  a modal picker as its only route; RED if a dropped folder of more than 100
  files reports fewer than it contains; RED if the app's classification of an
  input is not visible before the run starts.

### M4. Stream per-submission results as they land, instead of one terminal table

- **Cost removed:** partly perceived (section 1.3 rank 7) and partly real - the
  instructor can begin reading result 1 while result 40 is still running, which
  moves reading off the critical path.
- **Evidence:** the 10-second attention limit (Nielsen, 1993,
  <https://www.nngroup.com/articles/response-times-3-important-limits/>);
  progress feedback tripled willingness to wait, with percent-done indicators for
  waits of 10s and above (Sherwin,
  <https://www.nngroup.com/articles/progress-indicators/>).
- **Build risk:** MEDIUM. Incremental delivery is real runtime work.
- **Objection against it:** it buys tolerance rather than removing steps, and it
  can make the flow FEEL fine while the underlying cost is untouched - which is
  precisely how A39 became invisible until the owner said so. It should never be
  scheduled ahead of M1 or M2.
- **Pass condition.** OBJECT: elapsed time from run start to the first result the
  instructor can read, compared before and after. INSTRUMENT: owner observation
  against a wall clock on a real run with real keys; nothing in this checkout can
  produce it. DIRECTION OF FAILURE: RED if that time is unchanged, or if the
  total interactions rise to pay for the streaming.

### M5. Replace any navigate-to-select with an inline combobox on the same surface

- **Cost removed:** page loads and attention switches for selections that cannot
  be defaulted away by M2.
- **Evidence:** combobox over dropdown beyond roughly 15 options, and typing over
  selecting for readily-known values (Wang,
  <https://www.nngroup.com/articles/dropdown-list/>); modal steps obstruct users
  who need information from elsewhere (Budiu,
  <https://www.nngroup.com/articles/wizards/>).
- **Build risk:** MEDIUM. Bounded, but it is new UI on an existing surface.
- **Objection against it:** it is second-best by construction. Every selection
  M2 can default away should be defaulted away, and a combobox that survives M2
  is serving the minority case - so its cost-removed-at-N-1 is small. Also,
  typing re-imposes recall (section 4.3), which heuristic 6 warns against.
- **Pass condition.** OBJECT: interactions to change a selection that M2 got
  wrong, before and after. INSTRUMENT: the census walkthrough, owner-confirmed.
  DIRECTION OF FAILURE: RED if the count does not fall, or if the control
  requires the user to know a name they were not shown.

### M6. Keep exactly one confirmation - on spend, naming the amount - and convert the rest to undo

- **Cost removed:** small in clicks, and that is the point. Its value is
  protecting the one confirmation that is earned.
- **Evidence:** confirm before actions "costing large amounts of money"; do not
  confirm routine actions; offer undo (Nielsen,
  <https://www.nngroup.com/articles/confirmation-dialog/>).
- **Build risk:** LOW for deletion, MEDIUM where undo must actually be built.
- **Objection against it:** converting a confirm to an undo is only cheaper if
  the undo genuinely exists and is reachable. A deleted confirm with a promised
  undo that was never built is a strict regression, and note that at least one
  downstream system in this domain has no undo at all - Canvas, per
  <https://github.com/bruchris/canvas-lms-mcp>. Anything that writes outside the
  app cannot rely on undo and keeps its confirm.
- **Pass condition.** OBJECT: the set of confirmation steps in the grading flow,
  each classified reversible/irreversible and cheap/costly. INSTRUMENT: the
  census enumeration, owner-confirmed. DIRECTION OF FAILURE: RED if any surviving
  confirm is both reversible and cheap; RED if any removed confirm guarded an
  action that is irreversible or costly; RED if the spend confirm does not state
  the amount or count it is authorising.

### M7. Collapse multi-screen setup into one screen with progressive disclosure

- **Cost removed:** navigation between setup screens - but only the part M1 did
  not already delete.
- **Evidence:** progressive disclosure improves learnability, efficiency and
  error rate (Nielsen, <https://www.nngroup.com/articles/progressive-disclosure/>,
  no quantitative claim on that page); wizards are contraindicated for repeated
  tasks and for steps with no required order (Budiu,
  <https://www.nngroup.com/articles/wizards/>).
- **Build risk:** HIGH relative to its payoff - it is restructuring, and it is
  the move most likely to intersect other work.
- **Objection against it, and it is decisive for the ranking:** if M1 succeeds,
  most of what this move reorganises is no longer on the path to the first
  result. Doing M7 before M1 risks carefully re-laying-out steps that should have
  been deleted - EAS's "Eliminate before Simplify" applied to the backlog itself.
- **Pass condition.** OBJECT: the number of distinct screens between opening the
  app and the first graded result. INSTRUMENT: the census walkthrough,
  owner-confirmed. DIRECTION OF FAILURE: RED if the count does not fall, or if
  collapsing produces a single screen whose visible control count is higher than
  the sum of the screens it replaced.

### 7.1 The ordering, and the one thing it is not

M1, M2, M3, M4, M5, M6, M7.

M1 and M2 lead because they are largely deletion and defaulting - the highest
ratio of cost removed to risk taken. M3 is the biggest single prize and is third
only because its failure modes live in a browser this environment cannot drive.
M7 is last because M1 may make most of it moot.

**What this ordering is not:** it is not a claim about what this app currently
does. Whether M1 has anything left to delete, whether M2's stored rubric already
exists, and whether M3's intake is already partly built are all census questions,
and the census may reorder this list entirely. If the census finds a move is
already built and merely unreachable, `docs/loop/traps-spec.md` rules that the
real work is reachability and it must be said in the same turn rather than
specced again.

---

## 8. Residual register

Each entry names an owner, an instrument, and the step that will measure it. An
entry missing any of the three would be a deletion, and none is.

| Id | What is not proven | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-A39-1 | Every browser-behaviour claim in section 2 is read from documentation, not observed. Nothing here renders a component or drives the app (`docs/loop/this-repo.md` section 6). | Repo owner | A real browser on the target engines: drop a folder, paste an image, paste a file, paste rich text, and observe what arrives. | Owner verification, before any M3 implementation is treated as proven. |
| RES-A39-2 | Whether pasting FILES works in current Firefox. Bug 1699743 is RESOLVED FIXED targeting Firefox 116; I did not verify the shipped behaviour. | Repo owner | Paste a non-image file into the app in current Firefox and check `clipboardData.files`. | The same owner verification pass as RES-A39-1. |
| RES-A39-3 | Whether folder drop works in current Safari. I have only web.dev's compat line (Safari 11.1+ for `webkitGetAsEntry`), and Safari lacks `getAsFileSystemHandle` per the same source. | Repo owner | Drag a folder into the app in Safari. | The same owner verification pass. |
| RES-A39-4 | Whether a folder can be supplied at all on touch/mobile. No source found either way. | The architect pass consuming this document | A statement of supported platforms, then owner testing on whichever are in scope. | Before M3 is scoped, since it may reduce M3 to a desktop-only move. |
| RES-A39-5 | Whether the owner's rubric source document is typically already open. Section 4.1 shows this moves the recall budget by roughly a factor of two. | Repo owner | One question to the owner. | Before M2's target is fixed at zero rather than one interaction. |
| RES-A39-6 | Which chat client the owner actually uses, and whether they use Projects or an equivalent. Section 5.3's concession depends on it, and so does the honest size of the gap. | Repo owner | One question to the owner. | Before any A39 leverage claim is written. |
| RES-A39-7 | Every interaction count for THIS app. Not measured here by design. | The sibling seat, in `docs/a39-census.md` | The census's own walkthrough from control to code, owner-confirmed. | The census, already in flight; every pass condition in section 7 depends on it. |
| RES-A39-8 | KLM's operator time constants and its reported 21 percent per-task prediction error. The ACM page returned HTTP 403. | Any later seat that needs an absolute time estimate | The primary paper via an institutional copy. | Only if a move's case ever depends on predicted seconds rather than counted interactions. No move in section 7 does. |
| RES-A39-9 | The Johnson and Goldstein 2003 percentages (42/82/79) are from a secondary summariser; *Science* returned HTTP 403. | Any seat quoting them | The primary paper. | Before the figure is quoted anywhere outside this document. |
| RES-A39-10 | Baymard reports 19 percent on one page and 24 percent on another for what reads as the same statistic (section 3.3). I could not reconcile them. | Any seat quoting either | Baymard's underlying study report. | Before either number is used as a threshold rather than as an order of magnitude. |
| RES-A39-11 | The web-revisitation and personal-information-re-use literature (Tauscher and Greenberg 1997; Dumais et al. 2003) would strengthen section 4's MRU argument. Both PDFs came back as unreadable binary and I could not verify a single figure, so **neither is cited anywhere above.** Recorded so a later reader does not re-add them believing they were checked. | Any later seat wanting a stronger MRU case | Readable copies of both papers. | Optional. Section 4 stands on heuristics 6 and 7 without them. |

---

## 9. Source index

All retrieved 2026-09-23. FETCHED means the page was retrieved and rendered by
`WebFetch` (see section 0.2 for that instrument's weakness). SEARCH-SUMMARY-ONLY
means the page itself was never retrieved.

| Source | Status | Used for |
|---|---|---|
| NN/g, Interaction Cost: Definition (Budiu, 2013-08-31, rev. 2024-10-14) <https://www.nngroup.com/articles/interaction-cost-definition/> | FETCHED | The nine-component cost model, sections 1.1, 4.2 |
| NN/g, Response Time Limits (Nielsen, 1993-01-01) <https://www.nngroup.com/articles/response-times-3-important-limits/> | FETCHED | 0.1s / 1.0s / 10s, sections 1.3, 6.5 |
| NN/g, Progress Indicators (Sherwin, 2014-10-26) <https://www.nngroup.com/articles/progress-indicators/> | FETCHED | 3x willingness to wait; 2-10s vs 10s+, sections 1.3, 6.5, M4 |
| NN/g, Progressive Disclosure (Nielsen, 2006-12-03) <https://www.nngroup.com/articles/progressive-disclosure/> | FETCHED | Section 3.2, M7. Contains no quantitative claim. |
| NN/g, Login Walls Stop Users in Their Tracks (Budiu, 2014-03-02) <https://www.nngroup.com/articles/login-walls/> | FETCHED | Reciprocity, section 3.3, M1 |
| NN/g, EAS Framework for Simplifying Forms (Wang, 2025-03-07) <https://www.nngroup.com/articles/eas-framework-simplify-forms/> | FETCHED | Eliminate/Automate/Simplify ordering, section 3.1 |
| NN/g, 10 Usability Heuristics (Nielsen, 1994-04-24, rev. 2024-01-30) <https://www.nngroup.com/articles/ten-usability-heuristics/> | FETCHED | Heuristics 6 and 7, section 4.2 |
| NN/g, Does Your Form Really Need a Dropdown List? (Wang, 2026-07-17) <https://www.nngroup.com/articles/dropdown-list/> | FETCHED | Combobox threshold, section 4.3, M5 |
| NN/g, Wizards (Budiu, 2017-06-25) <https://www.nngroup.com/articles/wizards/> | FETCHED | Wizard contraindications, sections 4.3, 6.2, M7 |
| NN/g, Confirmation Dialogs Can Prevent User Errors (Nielsen, 2018-02-18, rev. 2026-08-07) <https://www.nngroup.com/articles/confirmation-dialog/> | FETCHED | Section 6.1, M6 |
| Baymard, Make Guest Checkout Prominent <https://baymard.com/blog/make-guest-checkout-prominent> | FETCHED | 24 percent / 4,384 respondents / 2022, section 3.3, M1 |
| Baymard, Reduce Cart Abandonment <https://baymard.com/blog/reduce-cart-abandonment> | FETCHED | The conflicting 19 percent figure, section 3.3 |
| Baymard, Autocomplete Design (2022-08-02) <https://baymard.com/blog/autocomplete-design> | FETCHED | 80 percent provide / 19 percent correct, section 4.3. Explicitly does NOT cover zero-state or recent queries. |
| MDN, Element: paste event <https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event> | FETCHED | Section 2.1 |
| MDN, Clipboard API <https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API> | FETCHED | Transient activation and paste-element requirement, section 2.1 |
| MDN, Clipboard: read() <https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/read> | FETCHED | Baseline 2024, secure context, section 2.1 |
| MDN, DataTransfer.files <https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/files> | FETCHED | Files on drop and on paste, section 2.1 |
| MDN, DataTransferItem.webkitGetAsEntry() <https://developer.mozilla.org/en-US/docs/Web/API/DataTransferItem/webkitGetAsEntry> | FETCHED | Folder entries, event window, read-only, naming, section 2.1 |
| MDN, FileSystemDirectoryReader.readEntries() <https://developer.mozilla.org/en-US/docs/Web/API/FileSystemDirectoryReader/readEntries> | FETCHED | The 100-entry Chromium cap, sections 2.2, 6.4 |
| MDN, HTMLInputElement.webkitdirectory <https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory> | FETCHED | Baseline August 2025, section 2.1 |
| web.dev, How to drag and drop directories <https://web.dev/articles/files/drag-and-drop-directories> | FETCHED | Engine support figures; `kind` is "file" for both, sections 2.1, 2.2 |
| Mozilla bug 1699743 <https://bugzilla.mozilla.org/show_bug.cgi?id=1699743> | FETCHED | Clipboard file-paste history, RESOLVED FIXED / Firefox 116, section 2.2 |
| W3C, Understanding SC 2.5.7 Dragging Movements <https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html> | FETCHED | Level AA single-pointer requirement, sections 2.2, 6.3 |
| Liu et al., Lost in the Middle (TACL; arXiv 2307.03172, 2023-07-06) <https://arxiv.org/abs/2307.03172> | FETCHED (abstract) | Long-context position degradation, section 5.1 |
| Anthropic, Collaborate with Claude on Projects (2024-06-25) <https://www.anthropic.com/news/projects> | FETCHED | Persistent project instructions and knowledge; 200K context, section 5.3 |
| AlAmir, *Frontiers in Education* (2026-08-13) <https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2026.1861960/full> | FETCHED | GPT-4 test-retest QWK 0.862 over 192 essays; lower unweighted kappa, section 5.3 |
| Canvas LMS REST API, Submissions <https://canvas.instructure.com/doc/api/submissions.html> | FETCHED | Single PUT and bulk `update_grades` returning a Progress object, section 5.4 |
| bruchris/canvas-lms-mcp <https://github.com/bruchris/canvas-lms-mcp> | FETCHED | 165 tools / 48 write; token auth; no undo in Canvas; rate limits, sections 5.4, M6 |
| The Decision Lab, on Johnson and Goldstein 2003 <https://thedecisionlab.com/intervention/how-default-settings-doubled-organ-donation-rates-in-the-us> | FETCHED (SECONDARY) | 42/82/79 percent, section 3.4. Primary (<https://www.science.org/doi/10.1126/science.1091721>) returned HTTP 403. |
| Card, Moran and Newell, KLM, *CACM* 1980 <https://dl.acm.org/doi/10.1145/358886.358895> | SEARCH-SUMMARY-ONLY | Cited for the model's shape only in section 1.1. No number from it is used. Page returned HTTP 403. |

---

## 10. Gates run over this file

Run 2026-09-23 from the repo root under PowerShell. The exit code was written to
a file with `[IO.File]::WriteAllText` and read back from that file, never from a
pipe.

Command: `npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts`

Per-argument lines, quoted from the wrapper's own output (a raw multi-path
`vitest run` is not used here, because it silently drops an argument that matches
no executed file - `docs/loop/this-repo.md` section 1):

```
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
```

Summary line: `Test Files  2 passed (2)` / `Tests  21 passed (21)`.
Exit code, read from `%TEMP%\a39-gate-code.txt`: **0**.

**Both gates genuinely read this file, which is not automatic and was checked
rather than assumed.** `src/lib/no-emojis.test.ts:254` sets its roots to
`["src", "docs"]` and `:237` includes `.md` in `SCAN_EXTENSIONS`;
`src/source-bytes.structure.test.ts:48` sets `ROOT` to `process.cwd()` and `:50`
includes `.md` in `TEXT_EXTENSIONS`. A gate that scanned only `src/` would have
passed without looking at this document at all.

Size, by the mandated instrument: `@(Get-Content "docs\a39-research.md").Count`
returned **974** for the body (sections 0-9) and **1019** once this section was
appended; the second figure is the current one. `wc -l docs/a39-research.md` from
the Bash tool agreed at 974 on the first measurement. `Measure-Object -Line` was
not used (`docs/loop/traps-spec.md`). The 1000-line ceiling enforced by
`src/file-size-ceiling.structure.test.ts` does not apply to this path, and that
was checked in the tree rather than taken from a card: `:41` sets `LIMIT = 1000`
and `:115` sets the scanned root to `path.resolve(repoRoot, "src")`. So 1012 is
not a gate failure - stated because the number crossing 1000 invites the
opposite assumption.

Write set, by `git status --short` at the time of writing: `?? docs/a39-research.md`.
Two other modified paths appear in that output - `docs/css-orphans.md`, which was
already modified when this seat started, and `docs/a29-architecture-small.md`,
which belongs to a concurrently running sibling. Neither was touched here.
