"use client";

// Success Tracking top-level tab (LIVE-LMS-STUDENT-MESSAGING W3): a stateless,
// rail-less tab like Course Intel. PLACEMENT is the orchestrator default (FORK
// A'), pending owner confirmation.
import TabHeader from "../TabHeader";
import SuccessTrackingView from "./SuccessTrackingView";

export default function SuccessTrackingTab() {
  return (
    <>
      <TabHeader
        eyebrow="Success Tracking"
        title="Success Tracking"
        subtitle="Live student progress across your courses, with templated messages."
      />
      <SuccessTrackingView />
    </>
  );
}
