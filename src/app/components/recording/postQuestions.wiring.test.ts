import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// docs/post-questions-acceptance-criteria.md Q12: pins the answerQuestions/
// removeQuestion wiring by SOURCE SCAN, modelled on redraftRow.wiring.test.ts.
//
// docs/answers-in-the-reply-acceptance-criteria.md A5/D5: this suite used to
// pin the Insert-an-answer chain too (insertAnswer/handleInsertAnswerForRow/
// onInsertAnswer, the block's own Insert button). That whole path is now
// DELETED end to end - the block reads the row's live `reply` text instead
// (A4) - so the assertions that pinned Insert are removed below rather than
// updated, and a cross-group sabotage guard is added instead: no file in this
// folder may still reference `onInsertAnswer`, and the row must actually pass
// `reply={row.reply}` to the block (D5's own note: without that, a stray
// `reply=""` would make every item read "Not in the reply" with every other
// gate green - this repo has shipped exactly that class of dead feature
// before).
//
// This suite still spans multiple groups' files - A
// (src/lib/discussion-reply-prompt.ts), B (discussion-persisted-controls.ts,
// discussion-draft-loop.ts) and C (DiscussionReplyControls.tsx,
// DiscussionReplyQuestions.tsx) - alongside this group's own files
// (DiscussionRepliesPanel.tsx, DiscussionReplyTable.tsx,
// DiscussionReplyRow.tsx, useDiscussionReplyFiltering.ts). Every assertion
// scanning a file outside this group's own file set is EXPECTED to be red
// until that group lands - this group reports that, never "fixes" it by
// editing a file outside its own allow-list.
// ---------------------------------------------------------------------------

const readSource = (relPath: string): string => fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8");

// D5 sabotage checks below read LIVE CODE only, never comments - this
// feature's own history (this file included) legitimately mentions deleted
// identifiers like `insertAnswer`/`onInsertAnswer` in prose explaining what
// was removed and why (see the header above, and DiscussionReplyQuestions
// .tsx's own comment on its now-REMOVE-only focus idiom). Only an actual prop
// declaration, JSX attribute, destructure or call site would ship the bug
// back, so comment lines (anything trimming to start with "//" or "*") are
// stripped before the substring check runs.
function liveCodeOnly(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed !== "" && !trimmed.startsWith("//") && !trimmed.startsWith("*");
    })
    .join("\n");
}

describe("post-questions wiring (Q12)", () => {
  it("the checkbox reads and writes composition.answerQuestions (DiscussionReplyControls.tsx)", () => {
    const src = readSource("src/app/components/recording/DiscussionReplyControls.tsx");
    expect(src).toMatch(/checked=\{composition\.answerQuestions\}/);
    expect(src).toMatch(/onChange=\{\(e\) => onChange\(\{ \.\.\.composition, answerQuestions: e\.target\.checked \}\)\}/);
  });

  it("the persisted key is read as the FOURTH coerceReplyComposition argument and written in setComposition (discussion-persisted-controls.ts, Group B)", () => {
    const src = readSource("src/app/components/recording/discussion-persisted-controls.ts");
    // Fourth positional argument, after ingredients/address-name/formality.
    expect(src).toMatch(
      // `[\s\S]*?` between the reads, not `\s*`: the live call carries a
      // comment line above the fourth argument. The FACT pinned is the
      // ORDER of the four reads, not the whitespace or commentary between
      // them.
      /coerceReplyComposition\([\s\S]*?readLocalStorage\("ta-rec-disc-ingredients"\)[\s\S]*?readLocalStorage\("ta-rec-disc-address-name"\)[\s\S]*?readLocalStorage\("ta-rec-disc-formality"\)[\s\S]*?readLocalStorage\("ta-rec-disc-answer-questions"\)/
    );
    expect(src).toMatch(/writeLocalStorage\("ta-rec-disc-answer-questions", next\.answerQuestions \? "1" : "0"\)/);
  });

  it("runDraftLoop's applyReply call carries the fifth argument (discussion-draft-loop.ts, Group E)", () => {
    const src = readSource("src/app/components/recording/discussion-draft-loop.ts");
    // docs/answers-in-the-reply-acceptance-criteria.md A7 (Group E): questions
    // travel with the reply they were drafted for, so turning the setting off
    // now CLEARS them (`[]`), not `undefined` ("leave them alone") - the old
    // reasoning (questions describe the POST, unaffected by this edit) is
    // false once `answer` quotes a particular draft. Whitespace-tolerant: the
    // live call is formatted across six lines. The FACT pinned is the
    // argument ORDER - the fifth argument is the answerQuestions-gated
    // questions expression.
    expect(src).toMatch(
      /rowsApiRef\.current\.applyReply\(\s*reply\.id,\s*reply\.reply,\s*false,\s*reply\.concepts \?\? \[\],\s*compositionNow\.answerQuestions \? \(reply\.questions \?\? \[\]\) : \[\],?\s*\)/
    );
  });

  it("the panel passes removeQuestion straight through to the table, with no live insertAnswer wiring anywhere in the panel (D5)", () => {
    const panelRaw = readSource("src/app/components/recording/DiscussionRepliesPanel.tsx");
    expect(panelRaw).toMatch(/removeQuestion=\{removeQuestion\}/);
    const panel = liveCodeOnly(panelRaw);
    // D5 sabotage guard: the whole insertAnswer chain (the raw hook mutator,
    // the wrapped handleInsertAnswerForRow, the table prop) is deleted, not
    // merely rewired - none of those identifiers may appear as live code.
    expect(panel).not.toMatch(/insertAnswer/i);
  });

  it("useDiscussionReplyFiltering no longer threads insertAnswer at all, in live code (D5)", () => {
    const src = liveCodeOnly(readSource("src/app/components/recording/useDiscussionReplyFiltering.ts"));
    expect(src).not.toMatch(/insertAnswer/i);
  });

  it("the table declares/forwards removeQuestion UNWRAPPED, and carries no live insertAnswer/onInsertAnswer wiring (D5)", () => {
    const tableRaw = readSource("src/app/components/recording/DiscussionReplyTable.tsx");
    expect(tableRaw).toMatch(/removeQuestion: \(id: string, question: string\) => void;/);
    expect(tableRaw).toMatch(/onRemoveQuestion=\{removeQuestion\}/);
    // No inline arrow at this boundary - DiscussionReplyRow.tsx's own header
    // comment on why every callback prop must be a stable reference.
    expect(tableRaw).not.toMatch(/onRemoveQuestion=\{\(/);
    const table = liveCodeOnly(tableRaw);
    expect(table).not.toMatch(/insertAnswer/i);
  });

  it("the row declares onRemoveQuestion, binds row.id via useCallback, mounts DiscussionReplyQuestions with row.questions AND the row's own live reply, and carries no live insertAnswer wiring (D5/A4)", () => {
    const rowRaw = readSource("src/app/components/recording/DiscussionReplyRow.tsx");
    expect(rowRaw).toMatch(/onRemoveQuestion: \(id: string, question: string\) => void;/);
    expect(rowRaw).toMatch(
      /const handleRemoveQuestion = useCallback\(\(question: string\) => onRemoveQuestion\(row\.id, question\), \[onRemoveQuestion, row\.id\]\)/
    );
    expect(rowRaw).toMatch(/<DiscussionReplyQuestions/);
    expect(rowRaw).toMatch(/questions=\{row\.questions\}/);
    // A4/D5: the row must pass its OWN live reply text to the block - this
    // matters more than it looks. Without it, a stray `reply=""` would make
    // every item read "Not in the reply" while every other gate (tsc,
    // eslint, every other test) stays green - this repo has shipped exactly
    // that class of dead feature before.
    expect(rowRaw).toMatch(/reply=\{row\.reply\}/);
    const row = liveCodeOnly(rowRaw);
    expect(row).not.toMatch(/insertAnswer/i);
  });

  it("mounted between the reply TextField and DiscussionReplyResources, in that order", () => {
    const row = readSource("src/app/components/recording/DiscussionReplyRow.tsx");
    const textFieldIdx = row.indexOf("<TextField");
    const questionsIdx = row.indexOf("<DiscussionReplyQuestions");
    const resourcesIdx = row.indexOf("<DiscussionReplyResources");
    expect(textFieldIdx).toBeGreaterThan(-1);
    expect(questionsIdx).toBeGreaterThan(textFieldIdx);
    expect(resourcesIdx).toBeGreaterThan(questionsIdx);
  });

  it("ReplyCompositionSettings.answerQuestions is REQUIRED, not optional (Group A)", () => {
    const src = readSource("src/lib/discussion-reply-prompt.ts");
    expect(src).toMatch(/interface ReplyCompositionSettings \{[\s\S]{0,300}answerQuestions: boolean;/);
    expect(src).not.toMatch(/answerQuestions\?: boolean/);
  });

  it("SABOTAGE GUARD (D5): no file's live code in this folder still references insertAnswer, in ANY casing - the Insert-an-answer path is deleted end to end across every group's files, not merely renamed or reinstated in one of them", () => {
    // This guard used to grep only the literal string `onInsertAnswer`
    // folder-wide, plus a separate /insertAnswer/i check applied to four
    // named files (the panel/table/row/filtering tests above). That left
    // useDiscussionReplies.ts and discussion-draft-loop.ts - where the hook
    // mutator, its return-object entry and the UseDiscussionRepliesReturn
    // type line used to live - covered by neither, so reinstating
    // `insertAnswer` in the hook and its interface passed the whole suite.
    // A bare, case-insensitive substring match on "insertanswer" closes that
    // gap for every current AND future file in this folder, with no per-file
    // allow-list to fall out of date again.
    //
    // Precision note: this must NOT trip on the resource-controls feature's
    // own live identifiers (`insertResource`, `handleInsertResource`,
    // `onInsertResource`, `appendResourceToReply`, `replyAlreadyHasResource`)
    // - "resource" and "answer" share no substring with "insertanswer", so a
    // plain substring check already distinguishes them without a word-
    // boundary or exact-name list.
    const dir = path.resolve(process.cwd(), "src/app/components/recording");
    // Excludes THIS file - it necessarily spells "insertAnswer" (and
    // "onInsertAnswer") in its own test titles, comments and the literal
    // strings this scan checks each file against, none of which are a live
    // reference to the deleted prop.
    const SELF = "postQuestions.wiring.test.ts";
    const offenders: string[] = [];
    for (const file of fs.readdirSync(dir)) {
      if (!/\.(ts|tsx)$/.test(file) || file === SELF) continue;
      const full = path.join(dir, file);
      if (fs.statSync(full).isDirectory()) continue;
      const code = liveCodeOnly(fs.readFileSync(full, "utf-8"));
      if (/insertanswer/i.test(code)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // docs/answers-in-the-reply-acceptance-criteria.md A4/D6/section 6: the
  // feature's central line. `DiscussionReplyQuestions.tsx` derives `inReply`
  // from the row's LIVE reply text via `replyContainsAnswer`, and every
  // render decision (badge, answer text, Copy) must come from
  // `questionAnswerDisplay`'s returned fields, never from an open-coded
  // condition on `hasAnswer`/`inReply` directly. D6: a false "In the reply"
  // is the one failure mode the spec calls unacceptable - the instructor
  // posts a reply believing it contains an answer that is not actually
  // there. Sabotaging this line to `const inReply = hasAnswer;` (and
  // dropping the now-unused import) leaves tsc, eslint and every other test
  // in the suite green, which is exactly why it needs its own oracle here.
  // ---------------------------------------------------------------------------

  it("derives inReply from replyContainsAnswer(reply, item.answer), conjoined with hasAnswer rather than substituted for it (A4/D6)", () => {
    const src = readSource("src/app/components/recording/DiscussionReplyQuestions.tsx");
    // The one predicate (D3) must be imported from the one leaf that owns it.
    expect(src).toMatch(/import\s*\{\s*replyContainsAnswer\s*\}\s*from\s*"@\/lib\/discussion-answer-location"/);
    // Call shape: whitespace-tolerant, but the argument order (reply, then
    // item.answer) is the fact that matters.
    expect(src).toMatch(/replyContainsAnswer\(\s*reply\s*,\s*item\.answer\s*\)/);
    // D6: `inReply` must be the CONJUNCTION of hasAnswer and the predicate -
    // `const inReply = hasAnswer;` keeps every other gate green while
    // badging every question "In the reply" regardless of the reply's
    // actual content.
    expect(src).toMatch(/const inReply = hasAnswer\s*&&\s*replyContainsAnswer\(/);
  });

  it("the badge label, answer text and Copy control are each gated on questionAnswerDisplay's returned fields, never on an open-coded hasAnswer/inReply condition (A4)", () => {
    const src = readSource("src/app/components/recording/DiscussionReplyQuestions.tsx");
    expect(src).toMatch(/const display = questionAnswerDisplay\(\s*hasAnswer\s*,\s*inReply\s*\)/);
    expect(src).toMatch(/\{display\.badgeLabel\s*&&/);
    // Tied to the specific elements they gate, not just present anywhere in
    // the file - showCopy must gate the Copy Button, showAnswerText must
    // gate the answer-text paragraph.
    expect(src).toMatch(/\{display\.showCopy\s*&&\s*\(\s*<Button/);
    expect(src).toMatch(/\{display\.showAnswerText\s*&&\s*<p/);
    // No open-coded fallback: hasAnswer/inReply must not gate JSX directly -
    // discussion-post-questions.test.ts already pins that
    // questionAnswerDisplay(true, true) returns { showAnswerText: false,
    // showCopy: false }, so this is the wiring half of "In the reply renders
    // NO Copy and NO answer text" - the source must actually READ those
    // fields rather than re-deciding from the raw booleans.
    expect(src).not.toMatch(/\{hasAnswer\s*&&/);
    expect(src).not.toMatch(/\{inReply\s*&&/);
  });

  it("the needsYou block renders on item.needsYou alone, as a sibling of the answer-location markup and NOT nested inside it (A4)", () => {
    const src = readSource("src/app/components/recording/DiscussionReplyQuestions.tsx");
    expect(src).toMatch(/\{item\.needsYou\s*&&/);
    // "Independently of the answer-location state" is checked structurally:
    // the top row (badge/question/Copy/Remove, `panelStyles.resourceItemTop`)
    // must fully OPEN AND CLOSE before `item.needsYou`'s own conditional
    // begins - i.e. it is a sibling `{...}` expression inside the <li>, not
    // nested inside `display.showCopy`'s (or any other state's) branch.
    const topRowOpenIdx = src.indexOf("resourceItemTop");
    expect(topRowOpenIdx).toBeGreaterThan(-1);
    const topRowCloseIdx = src.indexOf("</div>", topRowOpenIdx);
    expect(topRowCloseIdx).toBeGreaterThan(topRowOpenIdx);
    // Indexed at the OPENING brace of `item.needsYou`'s own JSX expression
    // container, so that brace is excluded from the balance check below -
    // it belongs to needsYou's own conditional, not to whatever sits before it.
    const needsYouIdx = src.indexOf("{item.needsYou");
    expect(needsYouIdx).toBeGreaterThan(topRowCloseIdx);
    // Brace balance between the two: zero net open braces means nothing
    // between the top row's close and `item.needsYou` left an unclosed JSX
    // expression container wrapping it (which nesting inside another
    // state's branch would require).
    const between = src.slice(topRowCloseIdx, needsYouIdx);
    const opens = (between.match(/\{/g) ?? []).length;
    const closes = (between.match(/\}/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});
