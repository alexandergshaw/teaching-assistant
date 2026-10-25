import type { AnnouncementLibraryController } from "./announcement-library-controller";
/** Capture before Next's bubble listener; only the component lifecycle disposes its controller. */
export function announcementLibraryNavigation(controller: Pick<AnnouncementLibraryController, "dirty">, environment: {
  currentUrl: () => string; currentState: () => unknown; restore: (state: unknown, url: string) => void;
  back: () => void; confirm: (value: boolean) => void;
}) {
  let origin = environment.currentUrl(), sourceState = environment.currentState();
  let pending: (() => void) | null = null, replaying = false;
  let allowedTraversal: string | null = null;
  const checkpoint = () => {
    if (!pending) { origin = environment.currentUrl(); sourceState = environment.currentState(); }
  };
  const request = (leave: () => void) => { pending = leave; environment.confirm(true); };
  return {
    checkpoint,
    click(event: MouseEvent) {
      if (replaying || !controller.dirty() || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const here = new URL(environment.currentUrl()), there = new URL(anchor.href, here);
      if (!/^https?:$/.test(there.protocol) || (there.origin === here.origin && there.pathname === here.pathname)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      request(() => { replaying = true; try { anchor.click(); } finally { replaying = false; } });
    },
    popstate(event: PopStateEvent) {
      const destination = environment.currentUrl();
      if (allowedTraversal === destination) { allowedTraversal = null; return; }
      allowedTraversal = null;
      const from = new URL(origin), to = new URL(destination);
      if (!controller.dirty() || (from.origin === to.origin && from.pathname === to.pathname)) { checkpoint(); return; }
      event.stopImmediatePropagation();
      // Preserve the SOURCE router tree as well as its URL. Next's installed
      // wrapper recognizes its own saved state and does not restore the destination tree.
      environment.restore(sourceState, origin);
      request(() => { allowedTraversal = destination; environment.back(); });
    },
    stay() { pending = null; allowedTraversal = null; environment.confirm(false); },
    discard() {
      const leave = pending; pending = null;
      environment.confirm(false); leave?.();
    },
  };
}
