export const AUTOMATIC_REPO_GRADE_INTERVAL_LIMITS = { hours: 720, days: 30 } as const;

export type AutomaticRepoGradeScheduleDraft =
  | { kind: "daily"; time: string; zone: string }
  | { kind: "interval"; count: number; unit: keyof typeof AUTOMATIC_REPO_GRADE_INTERVAL_LIMITS };

export function parseAutomaticRepoGradeSchedule(value: unknown): AutomaticRepoGradeScheduleDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  if (fields.kind === "daily" && typeof fields.time === "string" && /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(fields.time)
    && typeof fields.zone === "string" && /^[A-Za-z_+0-9/-]{1,100}$/.test(fields.zone)) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: fields.zone });
      return { kind: "daily", time: fields.time, zone: fields.zone };
    } catch {
      return null;
    }
  }
  if (fields.kind === "interval" && (fields.unit === "hours" || fields.unit === "days")
    && typeof fields.count === "number" && Number.isInteger(fields.count)
    && fields.count >= 1 && fields.count <= AUTOMATIC_REPO_GRADE_INTERVAL_LIMITS[fields.unit]) {
    return { kind: "interval", count: fields.count, unit: fields.unit };
  }
  return null;
}
