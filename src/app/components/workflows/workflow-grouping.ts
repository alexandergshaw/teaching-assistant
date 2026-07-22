import type { WorkflowDef } from "@/lib/workflows/types";

export interface WorkflowGroup {
  title: string;
  workflows: WorkflowDef[];
}

/**
 * Group workflows by category and recency, handling search flattening.
 * Returns an array of groups in order: Recent (if non-empty), Custom, then
 * preset categories (Grading, Course setup, Content & lectures, Communication & briefings).
 * When search query is non-empty, returns a flat filtered list (no groups).
 */
export function groupWorkflows(
  workflows: WorkflowDef[],
  recentIds: string[],
  searchQuery: string
): WorkflowGroup[] {
  // If searching, return flat filtered list
  if (searchQuery.trim()) {
    const filtered = workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (w.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
    );
    return filtered.length > 0 ? [{ title: "", workflows: filtered }] : [];
  }

  const groups: WorkflowGroup[] = [];

  // Recent group: last 5 successfully-STARTED workflow ids
  // Skip ids that don't resolve, dedupe, cap at 5
  const recentWorkflows: WorkflowDef[] = [];
  const seenIds = new Set<string>();
  for (const id of recentIds) {
    if (seenIds.has(id)) continue;
    const w = workflows.find((wf) => wf.id === id);
    if (w) {
      recentWorkflows.push(w);
      seenIds.add(id);
      if (recentWorkflows.length >= 5) break;
    }
  }
  if (recentWorkflows.length > 0) {
    groups.push({ title: "Recent", workflows: recentWorkflows });
  }

  // Custom group: workflows without preset flag
  const custom = workflows.filter((w) => !w.preset);
  if (custom.length > 0) {
    groups.push({ title: "Custom", workflows: custom });
  }

  // Preset categories
  const categoryLabels: Record<string, string> = {
    grading: "Grading",
    "course-setup": "Course setup",
    content: "Content & lectures",
    communication: "Communication & briefings",
  };

  const categories = ["grading", "course-setup", "content", "communication"] as const;
  for (const category of categories) {
    const categoryWorkflows = workflows.filter(
      (w) => w.preset && w.category === category
    );
    if (categoryWorkflows.length > 0) {
      groups.push({
        title: categoryLabels[category],
        workflows: categoryWorkflows,
      });
    }
  }

  return groups;
}
