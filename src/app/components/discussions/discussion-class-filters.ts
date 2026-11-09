import { buildRepoGradeCourseFilters } from "../repo-grades/repoGradesCoursePicker";

export type DiscussionClass = { id: string; name: string; institution: string | null; courseCode: string | null; term: string | null };

/** Keep the missing-school chip distinct from every actual school label. */
export function discussionSchoolLabel(institution: string, institutions: readonly string[]): string {
  if (institution) return institution;
  let label = "School not set";
  while (institutions.includes(label)) label += " (missing)";
  return label;
}

/** Browse one school without changing the selected class or its unsaved work. */
export function discussionClassFilters(courses: readonly DiscussionClass[], school: string | null) {
  const { institutions, activeInstitution, classes } = buildRepoGradeCourseFilters(courses, "", school);
  return {
    institutions,
    activeInstitution,
    classes: classes.map((item) => ({
      ...item,
      label: classes.some((other) => other.id !== item.id && other.label === item.label) ? `${item.label} (${item.id})` : item.label,
    })),
  };
}
