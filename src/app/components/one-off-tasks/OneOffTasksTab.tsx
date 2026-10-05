"use client";

// One-Off Tasks - Wave 1 shell (docs/one-off-tasks-scope.md). A stateless
// top-level tab, modelled on Course Intel: no rail, no URL state. The task
// model, persistence and CRUD arrive in later waves; this only gives the tab a
// place to render.
import TabHeader from "../TabHeader";

export default function OneOffTasksTab() {
  return (
    <TabHeader
      eyebrow="One-Off Tasks"
      title="One-Off Tasks"
      subtitle="Task tracking across colleges - coming soon."
    />
  );
}
