import type { AppUserRole, AppUserRow } from "@/lib/supabase/app-users";

const confirmedAt = "2026-01-01T00:00:00.000Z";

type TestIdentity = { id: string; email?: string };

export function actionAuthClient(readIdentity: () => TestIdentity | null | Promise<TestIdentity | null>) {
  return {
    auth: {
      getUser: async () => {
        const identity = await readIdentity();
        const user = identity && { ...identity, email: identity.email ?? `${identity.id}@example.test`, email_confirmed_at: confirmedAt };
        return { data: { user }, error: null };
      },
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null }),
      },
    },
  };
}

export function actionAuthUser(id: string, role: AppUserRole, email = `${id}@example.test`): AppUserRow {
  return {
    id,
    email,
    displayName: "Signed-in test user",
    status: "active",
    role,
    approvedAt: null,
    approvedBy: null,
    createdAt: confirmedAt,
    updatedAt: confirmedAt,
    statusChangedAt: null,
    statusChangedBy: null,
    roleGrantedBy: null,
  };
}
