"use server";

import { requireUser } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  containsInstitutionCredentialProperties,
  normalizeInstitutionAcronym,
  validateInstitutionDirectoryColumn,
  validateInstitutionDirectoryProfile,
  validateInstitutionDirectoryValue,
} from "@/lib/institution-directory";
import {
  listInstitutionDirectory,
  removeInstitutionDirectoryColumn,
  removeInstitutionDirectoryProfile,
  saveInstitutionDirectoryColumn,
  saveInstitutionDirectoryProfile,
  saveInstitutionDirectoryValue,
} from "@/lib/institution-directory-storage";

async function authorizedDirectoryUser() {
  try { return await requireUser(); } catch { return null; }
}

export async function listInstitutionDirectoryAction() {
  try {
    const user = await authorizedDirectoryUser();
    if (!user) return { ok: false as const, code: "unauthenticated" as const };
    const state = await listInstitutionDirectory(createServiceClient(), user.id);
    return { ok: true as const, state };
  } catch {
    return { ok: false as const, code: "load-failed" as const };
  }
}

export async function saveInstitutionDirectoryProfileAction(input: unknown, mode: "create" | "update") {
  try {
    const user = await authorizedDirectoryUser();
    if (!user) return { ok: false as const, code: "unauthenticated" as const };
    if (mode !== "create" && mode !== "update") return { ok: false as const, code: "invalid-profile" as const };
    const supabase = createServiceClient();
    const current = await listInstitutionDirectory(supabase, user.id);
    const candidate = input && typeof input === "object" && !Array.isArray(input)
      ? input as { acronym?: unknown; lmsType?: unknown }
      : null;
    const acronym = typeof candidate?.acronym === "string" ? normalizeInstitutionAcronym(candidate.acronym) : "";
    const existing = current.records.find((record) => record.profile.acronym === acronym);
    if (mode === "create" && existing) return { ok: false as const, code: "duplicate-acronym" as const };
    if (mode === "update" && !existing) return { ok: false as const, code: "target-not-found" as const };
    const knownLmsTypes = ["", "canvas", "blackboard", "moodle", "brightspace", "other"];
    const legacyLmsType = existing && !knownLmsTypes.includes(existing.commonValues.lmsType)
      ? existing.commonValues.lmsType
      : undefined;
    const validation = validateInstitutionDirectoryProfile(input, { legacyLmsType });
    if (!validation.ok) return { ok: false as const, code: validation.reason };
    await saveInstitutionDirectoryProfile(supabase, user.id, validation.value, mode);
    return { ok: true as const };
  } catch (error) {
    if (error instanceof Error && error.message === "directory-duplicate-profile") {
      return { ok: false as const, code: "duplicate-acronym" as const };
    }
    if (error instanceof Error && error.message === "directory-target-not-found") {
      return { ok: false as const, code: "target-not-found" as const };
    }
    return { ok: false as const, code: "save-failed" as const };
  }
}

export async function removeInstitutionDirectoryProfileAction(rawAcronym: string) {
  try {
    const user = await authorizedDirectoryUser();
    if (!user) return { ok: false as const, code: "unauthenticated" as const };
    const acronym = normalizeInstitutionAcronym(rawAcronym);
    if (!/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(acronym)) return { ok: false as const, code: "invalid-acronym" as const };
    const supabase = createServiceClient();
    const current = await listInstitutionDirectory(supabase, user.id);
    if (!current.records.some((record) => record.profile.acronym === acronym)) return { ok: false as const, code: "target-not-found" as const };
    await removeInstitutionDirectoryProfile(supabase, user.id, acronym);
    return { ok: true as const };
  } catch {
    return { ok: false as const, code: "remove-failed" as const };
  }
}

export async function saveInstitutionDirectoryColumnAction(input: unknown) {
  try {
    const user = await authorizedDirectoryUser();
    if (!user) return { ok: false as const, code: "unauthenticated" as const };
    if (containsInstitutionCredentialProperties(input) || !input || typeof input !== "object" || Array.isArray(input)) {
      return { ok: false as const, code: "invalid-column" as const };
    }
    const candidate = input as { id?: unknown; label?: unknown; type?: unknown };
    const current = await listInstitutionDirectory(createServiceClient(), user.id);
    const id = candidate.id;
    if (id !== undefined && (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id) || !current.columns.some((column) => column.id === id))) {
      return { ok: false as const, code: "invalid-column" as const };
    }
    const validationColumns = typeof id === "string" ? current.columns.filter((column) => column.id !== id) : current.columns;
    const validation = validateInstitutionDirectoryColumn({ label: candidate.label, type: candidate.type }, validationColumns);
    if (!validation.ok) return { ok: false as const, code: validation.reason };
    const column = await saveInstitutionDirectoryColumn(createServiceClient(), user.id, {
      ...(typeof id === "string" ? { id } : {}), ...validation.value,
    });
    return { ok: true as const, column };
  } catch {
    return { ok: false as const, code: "save-failed" as const };
  }
}

export async function saveInstitutionDirectoryValueAction(input: unknown) {
  try {
    const user = await authorizedDirectoryUser();
    if (!user) return { ok: false as const, code: "unauthenticated" as const };
    if (!input || typeof input !== "object" || Array.isArray(input) || containsInstitutionCredentialProperties(input)) {
      return { ok: false as const, code: "invalid-value" as const };
    }
    const candidate = input as { acronym?: unknown; columnId?: unknown; value?: unknown };
    if (typeof candidate.acronym !== "string" || typeof candidate.columnId !== "string" || typeof candidate.value !== "string") {
      return { ok: false as const, code: "invalid-value" as const };
    }
    const acronym = normalizeInstitutionAcronym(candidate.acronym);
    const state = await listInstitutionDirectory(createServiceClient(), user.id);
    const record = state.records.find((entry) => entry.profile.acronym === acronym);
    const column = state.columns.find((entry) => entry.id === candidate.columnId);
    if (!record || !column) return { ok: false as const, code: "target-not-found" as const };
    const validation = validateInstitutionDirectoryValue(column.type, candidate.value);
    if (!validation.ok) return { ok: false as const, code: validation.reason };
    await saveInstitutionDirectoryValue(createServiceClient(), user.id, acronym, column.id, validation.value);
    return { ok: true as const };
  } catch {
    return { ok: false as const, code: "save-failed" as const };
  }
}

export async function removeInstitutionDirectoryColumnAction(id: string) {
  try {
    const user = await authorizedDirectoryUser();
    if (!user) return { ok: false as const, code: "unauthenticated" as const };
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false as const, code: "invalid-column" as const };
    const supabase = createServiceClient();
    const current = await listInstitutionDirectory(supabase, user.id);
    if (!current.columns.some((column) => column.id === id)) return { ok: false as const, code: "target-not-found" as const };
    await removeInstitutionDirectoryColumn(supabase, user.id, id);
    return { ok: true as const };
  } catch {
    return { ok: false as const, code: "remove-failed" as const };
  }
}
