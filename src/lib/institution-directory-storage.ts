import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import type { InstitutionDirectoryColumn, InstitutionDirectoryProfile, InstitutionDirectoryRecord, InstitutionDirectoryState, DirectoryColumnType } from "./institution-directory";

type Client = SupabaseClient<Database>;
type ProfileRow = Database["public"]["Tables"]["institution_directory_profiles"]["Row"];
type ColumnRow = Database["public"]["Tables"]["institution_directory_columns"]["Row"];

function fieldValue(fields: unknown, id: string): string {
  if (!Array.isArray(fields)) return "";
  const entry = fields.find((item) => !!item && typeof item === "object" && (item as Record<string, unknown>).id === id);
  return entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).value === "string"
    ? (entry as Record<string, string>).value
    : "";
}

function fieldLmsType(fields: unknown): string {
  if (!Array.isArray(fields)) return "";
  const entry = fields.find((item) => !!item && typeof item === "object" && (item as Record<string, unknown>).id === "lmsUrl");
  return entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).lms === "string"
    ? (entry as Record<string, string>).lms
    : "";
}

function mapProfile(row: ProfileRow): InstitutionDirectoryProfile {
  return {
    acronym: row.acronym,
    fullName: row.full_name,
    emailClient: row.email_client as InstitutionDirectoryProfile["emailClient"],
    emailClientOtherName: row.email_client_other_name,
    lmsOtherName: row.lms_other_name,
    facultyPortalUrl: row.faculty_portal_url,
    websiteUrl: row.website_url,
    department: row.department,
  };
}

function mapColumn(row: ColumnRow): InstitutionDirectoryColumn {
  return { id: row.id, label: row.label, type: row.value_type as DirectoryColumnType, position: row.position };
}

export async function listInstitutionDirectory(
  supabase: Client,
  userId: string
): Promise<InstitutionDirectoryState> {
  const [profilesResult, fieldsResult, columnsResult, valuesResult] = await Promise.all([
    supabase.from("institution_directory_profiles").select("*").eq("user_id", userId).order("acronym"),
    supabase.from("institution_fields").select("*").eq("user_id", userId),
    supabase.from("institution_directory_columns").select("*").eq("user_id", userId).order("position").order("label"),
    supabase.from("institution_directory_values").select("*").eq("user_id", userId),
  ]);
  if (profilesResult.error || fieldsResult.error || columnsResult.error || valuesResult.error) throw new Error("directory-read-failed");
  const fieldsByAcronym = new Map((fieldsResult.data ?? []).map((row) => [row.acronym, row.fields]));
  const valuesByAcronym = new Map<string, Record<string, string>>();
  for (const row of valuesResult.data ?? []) {
    const values = valuesByAcronym.get(row.acronym) ?? {};
    values[row.column_id] = row.value;
    valuesByAcronym.set(row.acronym, values);
  }
  const records: InstitutionDirectoryRecord[] = (profilesResult.data ?? []).map((row) => {
    const fields = fieldsByAcronym.get(row.acronym);
    return {
      profile: mapProfile(row),
      commonValues: {
        email: fieldValue(fields, "email"),
        outlookUrl: fieldValue(fields, "outlookUrl"),
        lmsUrl: fieldValue(fields, "lmsUrl"),
        lmsType: fieldLmsType(fields),
      },
      values: valuesByAcronym.get(row.acronym) ?? {},
    };
  });
  return { records, columns: (columnsResult.data ?? []).map(mapColumn) };
}

export async function saveInstitutionDirectoryProfile(
  supabase: Client,
  userId: string,
  profile: InstitutionDirectoryProfile & { email: string; emailUrl: string; lmsType: string; lmsUrl: string },
  mode: "create" | "update"
): Promise<void> {
  const { error } = await supabase.rpc("save_institution_directory_profile", {
    p_user_id: userId,
    p_acronym: profile.acronym,
    p_mode: mode,
    p_profile: {
      fullName: profile.fullName,
      emailClient: profile.emailClient,
      emailClientOtherName: profile.emailClientOtherName,
      lmsOtherName: profile.lmsOtherName,
      facultyPortalUrl: profile.facultyPortalUrl,
      websiteUrl: profile.websiteUrl,
      department: profile.department,
    },
    p_common_values: {
      email: profile.email,
      outlookUrl: profile.emailUrl,
      lmsUrl: profile.lmsUrl,
      lmsType: profile.lmsType,
    },
  });
  if (error?.message.includes("duplicate_directory_profile")) throw new Error("directory-duplicate-profile");
  if (error?.message.includes("directory_profile_not_found")) throw new Error("directory-target-not-found");
  if (error) throw new Error("directory-save-failed");
}

export async function removeInstitutionDirectoryProfile(supabase: Client, userId: string, acronym: string): Promise<void> {
  const { error } = await supabase.from("institution_directory_profiles").delete().eq("user_id", userId).eq("acronym", acronym);
  if (error) throw new Error("directory-remove-failed");
}

export async function saveInstitutionDirectoryColumn(
  supabase: Client,
  userId: string,
  input: { id?: string; label: string; type: DirectoryColumnType }
): Promise<InstitutionDirectoryColumn> {
  if (input.id) {
    const { data, error } = await supabase.from("institution_directory_columns")
      .update({ label: input.label, updated_at: new Date().toISOString() })
      .eq("user_id", userId).eq("id", input.id).select("*").maybeSingle();
    if (error || !data) throw new Error("directory-column-save-failed");
    return mapColumn(data);
  }
  const { data: columns, error: listError } = await supabase.from("institution_directory_columns")
    .select("*").eq("user_id", userId).order("position", { ascending: false }).limit(1);
  if (listError) throw new Error("directory-column-save-failed");
  const { data, error } = await supabase.from("institution_directory_columns").insert({
    user_id: userId, label: input.label, value_type: input.type, position: (columns?.[0]?.position ?? -1) + 1,
  }).select("*").single();
  if (error) throw new Error("directory-column-save-failed");
  return mapColumn(data);
}

export async function saveInstitutionDirectoryValue(
  supabase: Client,
  userId: string,
  acronym: string,
  columnId: string,
  value: string
): Promise<void> {
  if (!value) {
    const { error } = await supabase.from("institution_directory_values").delete()
      .eq("user_id", userId).eq("acronym", acronym).eq("column_id", columnId);
    if (error) throw new Error("directory-value-save-failed");
    return;
  }
  const { error } = await supabase.from("institution_directory_values").upsert({
    user_id: userId, acronym, column_id: columnId, value, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,acronym,column_id" });
  if (error) throw new Error("directory-value-save-failed");
}

export async function removeInstitutionDirectoryColumn(supabase: Client, userId: string, id: string): Promise<void> {
  const { error } = await supabase.from("institution_directory_columns").delete().eq("user_id", userId).eq("id", id);
  if (error) throw new Error("directory-column-remove-failed");
}
