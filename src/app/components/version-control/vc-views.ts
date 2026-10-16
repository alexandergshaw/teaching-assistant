export const VC_SUBTAB_ORDER = ["orgs", "repos", "bulk"] as const;
export type VcSubTab = (typeof VC_SUBTAB_ORDER)[number];

export function isVcSubTab(value: unknown): value is VcSubTab {
  return typeof value === "string" && (VC_SUBTAB_ORDER as readonly string[]).includes(value);
}

export const VC_ORG_VIEW_ORDER = ["students", "management"] as const;
export type VcOrgView = (typeof VC_ORG_VIEW_ORDER)[number];

export function isVcOrgView(value: unknown): value is VcOrgView {
  return typeof value === "string" && (VC_ORG_VIEW_ORDER as readonly string[]).includes(value);
}
