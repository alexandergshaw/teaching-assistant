"use client";
import { useEffect, useMemo, useReducer, useState } from "react";
import { useSupabase } from "@/context/SupabaseProvider";
import { createAnnouncementLibraryController, type LibraryAdapters, type AnnouncementLibraryController } from "./announcement-library-controller";
import { announcementLibraryNavigation } from "./announcement-library-navigation";
export function useAnnouncementLibrary(courseId: string, adapters: LibraryAdapters) {
  const { user, loading } = useSupabase();
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const owner = !loading ? user?.id : undefined;
  const controller = useMemo(() => createAnnouncementLibraryController(owner ? courseId : "", adapters, refresh), [courseId, adapters, owner]);
  useEffect(() => {
    controller.activate();
    if (owner && courseId) void controller.load();
    return () => controller.dispose();
  }, [controller, owner, courseId]);
  return { controller, state: controller.getState(), scopeKey: `${owner ?? ""}:${courseId}`, enabled: !!owner && !!courseId };
}

export function useAnnouncementLibraryDeparture(controller: AnnouncementLibraryController) {
  const [confirming, setConfirming] = useState(false);
  const navigation = useMemo(() => announcementLibraryNavigation(controller, {
    currentUrl: () => typeof window === "undefined" ? "" : window.location.href,
    currentState: () => typeof window === "undefined" ? null : window.history.state,
    restore: (state, url) => window.history.pushState(state, "", url), back: () => window.history.back(), confirm: setConfirming,
  }), [controller]);
  useEffect(() => {
    document.addEventListener("click", navigation.click, true);
    window.addEventListener("popstate", navigation.popstate, true);
    return () => {
      document.removeEventListener("click", navigation.click, true);
      window.removeEventListener("popstate", navigation.popstate, true);
    };
  }, [navigation]);
  useEffect(() => { navigation.checkpoint(); });
  return { confirming, stay: navigation.stay, discard: navigation.discard };
}
