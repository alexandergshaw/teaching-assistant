// GRADING-CHAT smoothing W1 (R6): the multi-file batch driver. Awaits one
// submit per file, strictly in input order and one at a time, and returns every
// outcome in input order. It never inspects the outcome type, so a refusal is
// just another outcome and nothing is dropped or short-circuited.

export async function submitFilesSequentially<T>(
  files: readonly File[],
  submit: (file: File) => Promise<T>,
): Promise<T[]> {
  const outcomes: T[] = [];
  for (const file of files) {
    outcomes.push(await submit(file));
  }
  return outcomes;
}
