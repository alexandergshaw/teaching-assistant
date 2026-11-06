import { useId, useRef, useState } from "react";
import { reviewRepoGradePreparationPolicy, type PolicyReviewResult } from "./repoGradesProfileClient";
import styles from "./repo-grades-dashboard.module.css";

const STATUS_TEXT = {
  "not-configured": "This folder has no active generated rubric preparation policy to update.",
  current: "The pinned policy already matches the deployed settings.",
  updated: "Rubric preparation policy updated for future work in this folder.",
  conflict: "The profile or policy changed. Review the update again.",
  busy: "Grading or rubric preparation is in progress for this folder. Review the update again when it finishes.",
  "course-kind-required": "Set the course kind before reviewing the policy.",
  "grader-changed": "The saved grader differs from the deployed grader. Reload and save the folder profile first.",
  "generator-unavailable": "The deployed rubric generator is unavailable.",
  "invalid-scope": "Reload the folder profile and try again.",
  "storage-unavailable": "Policy storage is unavailable. Review the policy again to check the current pin.",
  "request-failed": "The request could not be confirmed. Review the policy again to check the current pin.",
};

export default function RepoGradePreparationPolicySettings({ courseId, folder }: { courseId: string; folder: string }) {
  const headingId = useId();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<PolicyReviewResult | null>(null);
  const inFlight = useRef(false);
  const preview = result?.status === "preview" ? result : null;

  async function request(expectedPreview?: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    const next = await reviewRepoGradePreparationPolicy(courseId, folder, expectedPreview);
    setResult(next);
    setPending(false);
    inFlight.current = false;
  }

  return <section className={styles.dashboard} aria-labelledby={headingId}>
    <h4 id={headingId}>Rubric preparation policy for <code>{folder}</code></h4>
    <p>The policy pins how automatic grading generates rubrics. Updates apply to future work in this folder.</p>
    <button type="button" disabled={pending} onClick={() => void request()}>Review policy update</button>
    <p role="status">{pending ? "Checking policy." : result && result.status !== "preview" ? STATUS_TEXT[result.status] : ""}</p>
    {preview && <div>
      <p>Review the current pin and the deployed replacement before applying.</p>
      <dl>
        <dt>Current policy</dt>
        <dd>{policyLabel(preview.current)}</dd>
        <dt>Replacement policy</dt>
        <dd>{policyLabel(preview.replacement)}</dd>
      </dl>
      <button type="button" disabled={pending} onClick={() => void request(preview.preview)}>Apply policy update</button>
    </div>}
  </section>;
}

function policyLabel({ courseKind, version }: { courseKind: "coding" | "applied"; version: string }) {
  const [parser, generation, basis] = version.split(":");
  return <>
    {courseKind === "coding" ? "Programming" : "Applied"} · <code>{parser}</code>
    {generation && <> · Generation <code title={generation}>{generation.slice(0, 12)}</code></>}
    {basis && <> · Course settings <code title={basis}>{basis.slice(0, 12)}</code></>}
  </>;
}
