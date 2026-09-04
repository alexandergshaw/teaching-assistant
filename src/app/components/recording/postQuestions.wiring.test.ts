import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// docs/post-questions-acceptance-criteria.md Q12: pins the whole
// answerQuestions/insertAnswer/removeQuestion chain by SOURCE SCAN, modelled
// on redraftRow.wiring.test.ts. This suite spans all three groups' files -
// A (src/lib/discussion-reply-prompt.ts), B (discussion-persisted-controls.ts,
// discussion-draft-loop.ts, useDiscussionReplies.ts, useDiscussionReplyFiltering.ts)
// and C (DiscussionReplyControls.tsx, DiscussionRepliesPanel.tsx,
// DiscussionReplyTable.tsx, DiscussionReplyRow.tsx, DiscussionReplyQuestions.tsx -
// this group's own files). Every assertion scanning a B file is EXPECTED to
// be red until Group B lands - Group C reports that, never "fixes" it by
// editing a file outside its own allow-list.
// ---------------------------------------------------------------------------

const readSource = (relPath: string): string => fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8");

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

  it("runDraftLoop's applyReply call carries the fifth argument (discussion-draft-loop.ts, Group B)", () => {
    const src = readSource("src/app/components/recording/discussion-draft-loop.ts");
    expect(src).toMatch(
      // Whitespace-tolerant: the live call is formatted across six lines.
      // The FACT pinned is the argument ORDER - the fifth argument is the
      // answerQuestions-gated questions expression, so turning the setting
      // off passes `undefined` (leave alone) rather than `[]` (clear).
      /rowsApiRef\.current\.applyReply\(\s*reply\.id,\s*reply\.reply,\s*false,\s*reply\.concepts \?\? \[\],\s*compositionNow\.answerQuestions \? \(reply\.questions \?\? \[\]\) : undefined,?\s*\)/
    );
  });

  it("the panel passes handleInsertAnswerForRow (the WRAPPED one), not the raw insertAnswer, to the table", () => {
    const panel = readSource("src/app/components/recording/DiscussionRepliesPanel.tsx");
    expect(panel).toMatch(/insertAnswer=\{handleInsertAnswerForRow\}/);
    // Sabotage guard: the raw hook mutator must never be the one wired to
    // the table - Q7's own reasoning ("compiles and ships the handled-badge
    // lie").
    expect(panel).not.toMatch(/insertAnswer=\{insertAnswer\}/);
    expect(panel).toMatch(/removeQuestion=\{removeQuestion\}/);
  });

  it("the panel threads insertAnswer INTO useDiscussionReplyFiltering's args object", () => {
    const panel = readSource("src/app/components/recording/DiscussionRepliesPanel.tsx");
    expect(panel).toMatch(/useDiscussionReplyFiltering\(\{[\s\S]{0,400}insertAnswer,[\s\S]{0,200}\}\)/);
  });

  it("useDiscussionReplyFiltering wraps insertAnswer into handleInsertAnswerForRow using the clearHandled-then-mutate idiom (Group B)", () => {
    const src = readSource("src/app/components/recording/useDiscussionReplyFiltering.ts");
    expect(src).toMatch(/insertAnswer: \(id: string, item: PostQuestion\) => void/);
    expect(src).toMatch(/handleInsertAnswerForRow: \(id: string, item: PostQuestion\) => void/);
    expect(src).toMatch(/const handleInsertAnswerForRow = useCallback\(\s*\(id: string, item: PostQuestion\) => \{\s*clearHandled\(id\);\s*insertAnswer\(id, item\);/);
  });

  it("the table declares insertAnswer/removeQuestion and forwards them UNWRAPPED to the row as onInsertAnswer/onRemoveQuestion", () => {
    const table = readSource("src/app/components/recording/DiscussionReplyTable.tsx");
    expect(table).toMatch(/insertAnswer: \(id: string, item: PostQuestion\) => void;/);
    expect(table).toMatch(/removeQuestion: \(id: string, question: string\) => void;/);
    expect(table).toMatch(/onInsertAnswer=\{insertAnswer\}/);
    expect(table).toMatch(/onRemoveQuestion=\{removeQuestion\}/);
    // No inline arrow at this boundary - DiscussionReplyRow.tsx's own header
    // comment on why every callback prop must be a stable reference.
    expect(table).not.toMatch(/onInsertAnswer=\{\(/);
    expect(table).not.toMatch(/onRemoveQuestion=\{\(/);
  });

  it("the row declares onInsertAnswer/onRemoveQuestion, binds row.id via useCallback, and mounts DiscussionReplyQuestions with row.questions", () => {
    const row = readSource("src/app/components/recording/DiscussionReplyRow.tsx");
    expect(row).toMatch(/onInsertAnswer: \(id: string, item: PostQuestion\) => void;/);
    expect(row).toMatch(/onRemoveQuestion: \(id: string, question: string\) => void;/);
    expect(row).toMatch(/const handleInsertAnswer = useCallback\(\(item: PostQuestion\) => onInsertAnswer\(row\.id, item\), \[onInsertAnswer, row\.id\]\)/);
    expect(row).toMatch(/const handleRemoveQuestion = useCallback\(\(question: string\) => onRemoveQuestion\(row\.id, question\), \[onRemoveQuestion, row\.id\]\)/);
    expect(row).toMatch(/<DiscussionReplyQuestions/);
    expect(row).toMatch(/questions=\{row\.questions\}/);
  });

  it("DiscussionReplyQuestions renders Insert and Copy only when item.answer is non-empty", () => {
    const src = readSource("src/app/components/recording/DiscussionReplyQuestions.tsx");
    // Both controls gated on the same `hasAnswer` flag, itself derived from
    // `item.answer !== ""` - Q11's exact invariant, never `disabled`.
    expect(src).toMatch(/const hasAnswer = item\.answer !== "";/);
    expect(src.match(/\{hasAnswer && \(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(src).not.toMatch(/disabled=\{!hasAnswer\}/);
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
});
