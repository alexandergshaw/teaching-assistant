// Table type definitions for lms_credentials.
//
// A new file, not an addition to types.tables-a.ts or types.tables-b.ts:
// both are already close to the repo's 1000-line ceiling
// (src/file-size-ceiling.structure.test.ts) - types.tables-a.ts measured 955
// lines and types.tables-b.ts 923 at the time this table was added (DAT6 in
// docs/lms-credentials-acceptance-criteria.md). Growing either past 1000
// would fail that gate for a change with nothing to do with either file's
// own tables, so this table gets its own leaf instead, following the same
// hand-maintained-row-types convention types.tables-a.ts/types.tables-b.ts
// already use. No `Json` import here (unlike those two files): lms_credentials
// has no jsonb column, and this file adds one only when a future table here
// actually needs it.

// supabase/migrations/20261015000000_lms_credentials.sql
export interface LmsCredentialsRow {
  user_id: string;
  institution: string;
  base_url: string;
  encrypted_token: string;
  token_last_four: string;
  canvas_user_id: string | null;
  canvas_user_name: string | null;
  last_verified_at: string | null;
  last_used_at: string | null;
  last_failure_at: string | null;
  last_failure_kind: string | null;
  created_at: string;
  updated_at: string;
}

export interface LmsCredentialsInsert {
  user_id: string;
  institution: string;
  base_url: string;
  encrypted_token: string;
  token_last_four: string;
  canvas_user_id?: string | null;
  canvas_user_name?: string | null;
  last_verified_at?: string | null;
  last_used_at?: string | null;
  last_failure_at?: string | null;
  last_failure_kind?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface LmsCredentialsUpdate {
  user_id?: string;
  institution?: string;
  base_url?: string;
  encrypted_token?: string;
  token_last_four?: string;
  canvas_user_id?: string | null;
  canvas_user_name?: string | null;
  last_verified_at?: string | null;
  last_used_at?: string | null;
  last_failure_at?: string | null;
  last_failure_kind?: string | null;
  created_at?: string;
  updated_at?: string;
}

// supabase/migrations/20261016000000_lms_credential_save_attempts.sql
// SEC9's rate-limit log - see that migration's header for why the PK is a
// bare surrogate id and why this table never upserts.
export interface LmsCredentialSaveAttemptsRow {
  id: string;
  user_id: string;
  attempted_at: string;
}

export interface LmsCredentialSaveAttemptsInsert {
  id?: string;
  user_id: string;
  attempted_at?: string;
}

export interface LmsCredentialSaveAttemptsUpdate {
  id?: string;
  user_id?: string;
  attempted_at?: string;
}
