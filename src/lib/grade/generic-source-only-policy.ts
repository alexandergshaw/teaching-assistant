/** A narrow positive signal for written work; ambiguous or executable work
 * stays partial when no runtime evidence exists. */
export function isExplicitWrittenOnlyAssignment(instructions:string,rubric:string):boolean {
  const text=`${instructions}\n${rubric}`;
  const written = /\b(?:essay|written response|reflection|discussion|prose|short answer|written report)\b/i.test(rubric)
    && !/\b(?:code|coding|program(?:ming)?|software|script|execut(?:e|ion|able)|runs?|running|compil(?:e|ation)|tests?|coverage|sql|database|algorithm|function|implementation)\b/i.test(text);
  // SQL source can be reviewed without a database only when the rubric
  // explicitly calls for static analysis and does not require execution.
  const staticSql = /\b(?:sql|quer(?:y|ies))\b/i.test(rubric)
    && /\b(?:review|analy[sz](?:e|is)|explain|describe)\b/i.test(rubric)
    && !/\b(?:execut(?:e|ion|able)|runs?|running|compil(?:e|ation)|tests?|coverage|output|results?|connect|deploy)\b/i.test(text);
  return written || staticSql;
}

/** The execution receipt contains process observations only. It does not yet
 * establish test coverage, expected output, or artifact/source equivalence.
 * Numeric grading is therefore limited to explicitly static rubrics until a
 * rubric criterion can be tied to independently verified evidence. */
export function hasSufficientGeneralRubricEvidence(instructions: string, rubric: string): boolean {
  return isExplicitWrittenOnlyAssignment(instructions, rubric);
}
