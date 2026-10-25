/** Version Control navigation membership. */
export const VC_SUB_TABS = [["orgs", "Orgs"], ["repos", "Repos"], ["bulk", "Bulk actions"]] as const;
export const VC_ORG_VIEWS = [["students", "Student management"], ["management", "Org management"]] as const;
export type VcSubTab = (typeof VC_SUB_TABS)[number][0];
export type VcOrgView = (typeof VC_ORG_VIEWS)[number][0];
export const VC_SUB_TAB_CHANGE_EVENT = "version-control-subtab-change";
export const VC_ORG_VIEW_CHANGE_EVENT = "version-control-org-view-change";
export function isVcSubTab(value: unknown): value is VcSubTab { return VC_SUB_TABS.some(([key]) => key === value); }
export function isVcOrgView(value: unknown): value is VcOrgView { return VC_ORG_VIEWS.some(([key]) => key === value); }
