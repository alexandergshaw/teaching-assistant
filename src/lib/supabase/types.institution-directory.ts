export interface InstitutionDirectoryProfileRow {
  user_id: string; acronym: string; full_name: string; email_client: string;
  email_client_other_name: string; lms_other_name: string; faculty_portal_url: string;
  website_url: string; department: string; created_at: string; updated_at: string;
}
export type InstitutionDirectoryProfileInsert = Omit<InstitutionDirectoryProfileRow, "created_at" | "updated_at"> & {
  created_at?: string; updated_at?: string;
};
export type InstitutionDirectoryProfileUpdate = Partial<InstitutionDirectoryProfileInsert>;

export interface InstitutionDirectoryColumnRow {
  id: string; user_id: string; label: string; label_key: string; value_type: string;
  position: number; created_at: string; updated_at: string;
}
export type InstitutionDirectoryColumnInsert = Omit<InstitutionDirectoryColumnRow, "id" | "label_key" | "created_at" | "updated_at"> & {
  id?: string; created_at?: string; updated_at?: string;
};
export type InstitutionDirectoryColumnUpdate = Partial<InstitutionDirectoryColumnInsert>;

export interface InstitutionDirectoryValueRow {
  user_id: string; acronym: string; column_id: string; value: string; updated_at: string;
}
export type InstitutionDirectoryValueInsert = Omit<InstitutionDirectoryValueRow, "updated_at"> & { updated_at?: string };
export type InstitutionDirectoryValueUpdate = Partial<InstitutionDirectoryValueInsert>;
