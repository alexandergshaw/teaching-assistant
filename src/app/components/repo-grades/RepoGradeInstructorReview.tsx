"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";
import { instructorReviewAction, instructorReviewEligibilityAction, type InstructorCriterion } from "@/app/actions/repo-grade-instructor-review";
import { useSupabase } from "@/context/SupabaseProvider";
import { canEditInstructorReview } from "./instructorReviewAvailability";

type Review = { review_id: number; criteria: InstructorCriterion[]; feedback: string; score: number; source_sha: string };
type Props = { courseId: string; generation: number; sourceSha: string; areas: string[] };
export default function RepoGradeInstructorReview(props: Props) {
  const { user } = useSupabase();
  if (!user) return null;
  return <ReviewForScope key={JSON.stringify([user.id, props.courseId, props.generation, props.sourceSha])} {...props} userId={user.id} />;
}
function ReviewForScope({ courseId, generation, sourceSha, areas, userId }: Props & { userId: string }) {
  const [review, setReview] = useState<Review | null>(null);
  const [eligible, setEligible] = useState(false);
  const [reviewLoaded, setReviewLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [scores, setScores] = useState<string[]>(areas.map(() => ""));
  const [notes, setNotes] = useState<string[]>(areas.map(() => ""));
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    instructorReviewAction({ courseId, accountId: userId, generation, sourceSha }).then(value => {
      if (active) { setReview(value as Review | null); setReviewLoaded(true); }
    }).catch(() => { if (active) setError("The instructor review could not be loaded."); });
    instructorReviewEligibilityAction({ courseId, accountId: userId, generation, sourceSha }).then(allowed => { if (active) setEligible(allowed); }).catch(() => { if (active) setError("Review eligibility could not be checked."); });
    return () => { active = false; };
  }, [courseId, generation, sourceSha, userId]);
  if (areas.length !== 4) return null;
  const valid = scores.every(s => s.trim() !== "" && Number.isFinite(Number(s)) && Number(s) >= 0 && Number(s) <= 25 && /^\d+(?:\.\d{1,2})?$/.test(s)) && notes.every(n => !!n.trim() && n.length <= 4000) && !!feedback.trim() && feedback.length <= 16000;
  async function save() {
    if (!valid || saving || uncertain) return;
    setSaving(true); setError("");
    try {
      const result = await instructorReviewAction({ courseId, accountId: userId, generation, sourceSha, expectedReviewId: review?.review_id ?? null, criteria: areas.map((area, i) => ({ area, score: Number(scores[i]), note: notes[i] })), feedback });
      if (result !== true) { setError("The draft changed or a review already exists. Reload before retrying."); setUncertain(true); return; }
      const saved = await instructorReviewAction({ courseId, accountId: userId, generation, sourceSha });
      if (!saved) { setError("Review saved, but could not be reloaded. Reload before editing."); setUncertain(true); return; }
      setReview(saved as Review); setOpen(false);
    } catch { setError("Save outcome could not be confirmed. Reload before retrying."); setUncertain(true); }
    finally { setSaving(false); }
  }
  return <Stack spacing={1}>
    {error && <Alert severity="warning">{error}</Alert>}
    {review ? <Alert severity="info"><strong>Instructor-reviewed score: {review.score}%</strong><br />{review.feedback}{review.criteria.map(item => <Typography key={item.area} variant="body2">{item.area}: {item.score}/25 — {item.note}</Typography>)}Reviewed source {review.source_sha.slice(0, 12)} may no longer be current. The original draft and its unexamined-file disclosure remain available.</Alert>
      : canEditInstructorReview(eligible, reviewLoaded) && <Button size="small" onClick={() => setOpen(true)}>Review and save score</Button>}
    {review && canEditInstructorReview(eligible, reviewLoaded) && <Button size="small" disabled={uncertain} onClick={() => { setScores(review.criteria.map(item => String(item.score))); setNotes(review.criteria.map(item => item.note)); setFeedback(review.feedback); setOpen(true); }}>Correct review</Button>}
    <Dialog open={open} onClose={() => !saving && setOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>Instructor review</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography variant="body2">This review applies to a saved revision that may no longer be current. Review the source and execution evidence. The original draft and its unexamined files are retained. Saving does not post to the LMS.</Typography>
        {areas.map((area, i) => <Stack spacing={1} key={area}>
          <TextField label={`${area} (0–25)`} type="number" value={scores[i]} onChange={e => setScores(old => old.map((v, n) => n === i ? e.target.value : v))} slotProps={{ htmlInput: { min: 0, max: 25, step: 0.01 } }} />
          <TextField label={`${area} rationale`} multiline value={notes[i]} onChange={e => setNotes(old => old.map((v, n) => n === i ? e.target.value : v))} />
        </Stack>)}
        <TextField label="Overall feedback" multiline minRows={3} value={feedback} onChange={e => setFeedback(e.target.value)} />
        {error && <Alert severity="warning">{error}</Alert>}
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button><Button onClick={save} disabled={!valid || saving || uncertain}>Save review</Button></DialogActions>
    </Dialog>
  </Stack>;
}








