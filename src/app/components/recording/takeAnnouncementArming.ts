// A wrapper around postArmSignature (content-tab/modules/postConfirmArming.ts)
// for the "post this take's drafted announcement to Canvas" target, which
// PostArmFields cannot express on its own: it has no slot for a course. In
// the modal that signature wraps, the course is implied by the artifact row;
// here the course is a separate picker the person can change AFTER arming -
// so signing only the take id would let someone arm for course X, switch the
// picker to course Y, confirm, and have the post go to Y under an arm granted
// for X. Signing the course (and the institution the post's acronym resolves
// from) closes that gap.
//
// postConfirmArming.ts is reused verbatim, not edited: it is tested, and
// appending a field to PostArmFields would change the signature string for
// every existing caller of that module. moduleChoice/newModuleName are not
// overloaded with a course id - they are passed empty, exactly as
// postConfirmArming.ts's own announcement caller already does, and the
// course/institution are explicit outer terms in this module's own signature
// instead.
//
// This module signs only the POST TARGET (take, course, institution) - not
// the subject or body text. The caller composes the full arm signature
// (target plus the live subject/body) itself, because unlike the modal this
// surface has no saved artifact row to read back: the confirm panel quotes
// whatever is in the subject/body fields right now, so any edit after
// arming has to disarm, and the caller is what owns those fields.

import { postArmSignature } from "../content-tab/modules/postConfirmArming";

export function takePostArmSignature(takeId: string, hubCourseId: string, institution: string): string {
  return JSON.stringify([
    postArmSignature({ kindId: "announcement", artifactId: takeId, moduleChoice: "", newModuleName: "" }),
    hubCourseId,
    institution,
  ]);
}
