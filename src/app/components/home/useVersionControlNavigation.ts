import { useEffect, useState } from "react";
import { parseUrlState, resolveVcOrgView, resolveVcSubTab } from "../../url-state";
import type { VcOrgView, VcSubTab } from "../version-control/vc-views";

const VC_SUBTAB_KEY = "ta-vc-subtab";
const VC_ORG_VIEW_KEY = "ta-vc-org-view";

function urlNamesVersionControl(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("tab")) return false;
  const parsed = parseUrlState(window.location.search);
  return parsed.tab === "manual" && parsed.toolsSection === "manual" && parsed.manualView === "version-control";
}

export function useVersionControlNavigation() {
  const [vcSubTab, setVcSubTab] = useState<VcSubTab>(() => {
    if (typeof window === "undefined") return "orgs";
    const urlNamesVcView = urlNamesVersionControl();
    const parsed = urlNamesVcView ? parseUrlState(window.location.search) : null;
    return resolveVcSubTab(parsed?.vcSubTab ?? null, urlNamesVcView, localStorage.getItem(VC_SUBTAB_KEY));
  });
  const [vcOrgView, setVcOrgView] = useState<VcOrgView>(() => {
    if (typeof window === "undefined") return "students";
    const urlNamesVcView = urlNamesVersionControl();
    const parsed = urlNamesVcView && resolveVcSubTab(new URLSearchParams(window.location.search).get("vcSubTab"), true, null) === "orgs"
      ? parseUrlState(window.location.search)
      : null;
    return resolveVcOrgView(parsed?.vcOrgView ?? null, parsed !== null, localStorage.getItem(VC_ORG_VIEW_KEY));
  });

  useEffect(() => {
    localStorage.setItem(VC_SUBTAB_KEY, vcSubTab);
  }, [vcSubTab]);

  useEffect(() => {
    localStorage.setItem(VC_ORG_VIEW_KEY, vcOrgView);
  }, [vcOrgView]);

  return { vcSubTab, setVcSubTab, vcOrgView, setVcOrgView };
}
