/** Serialize archive review so a later upload cannot replace an in-flight one. */
export function createArchiveReviewQueue() {
  type Review = { file: File; autoSubmit: boolean };
  let active: Review | null = null;
  let occupied = false;
  let waiting: Review[] = [];
  return {
    enqueue(file: File, autoSubmit = false): Review | null {
      const review = { file, autoSubmit };
      if (occupied) { waiting.push(review); return null; }
      occupied = true;
      active = review;
      return review;
    },
    complete(): Review | null {
      const next = waiting.shift();
      active = next ?? null;
      occupied = !!next;
      return next ?? null;
    },
    reserve() { occupied = true; },
    reset() { const result = { active, wasActive: occupied, waiting: [...waiting] }; active = null; occupied = false; waiting = []; return result; },
    waitingNames() { return waiting.map((review) => review.file.name); },
  };
}
