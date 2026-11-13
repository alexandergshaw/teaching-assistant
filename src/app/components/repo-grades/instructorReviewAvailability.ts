/** Editing requires both a confirmed eligible attempt and a successful review read. */
export function canEditInstructorReview(eligible: boolean, reviewLoaded: boolean): boolean {
  return eligible && reviewLoaded;
}
