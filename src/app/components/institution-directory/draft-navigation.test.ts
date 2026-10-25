import { describe, expect, it, vi } from "vitest";
import { directoryNavigationHandlers } from "./draft-navigation";

function fixture(dirty = true) {
  const leave = vi.fn();
  const requestLeave = vi.fn();
  const restoreUrl = vi.fn();
  const handlers = directoryNavigationHandlers({ isDirty: () => dirty, isInside: () => false, requestLeave, restoreUrl, currentUrl: () => "https://app.test/?tab=courses&coursesSection=institutions", back: leave });
  const control = { click: leave, closest: () => null };
  const event = { target: { closest: () => control }, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
  return { handlers, event, leave, requestLeave, restoreUrl };
}

describe("directory draft navigation capture", () => {
  it("blocks a dirty rail click and defers the actual navigation until an explicit decision", () => {
    const f = fixture();
    f.handlers.click(f.event as unknown as MouseEvent);
    expect(f.event.preventDefault).toHaveBeenCalled();
    expect(f.event.stopImmediatePropagation).toHaveBeenCalled();
    expect(f.leave).not.toHaveBeenCalled();
    f.requestLeave.mock.calls[0][0]();
    expect(f.leave).toHaveBeenCalledOnce();
  });
  it("lets a clean rail click proceed without a prompt", () => {
    const f = fixture(false);
    f.handlers.click(f.event as unknown as MouseEvent);
    expect(f.event.preventDefault).not.toHaveBeenCalled();
    expect(f.requestLeave).not.toHaveBeenCalled();
  });
  it("blocks roving rail keyboard navigation before the rail changes the active view", () => {
    const f = fixture();
    const event = { ...f.event, key: "ArrowRight" };
    f.handlers.keydown(event as unknown as KeyboardEvent);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
    expect(f.requestLeave).toHaveBeenCalledOnce();
    expect(f.leave).not.toHaveBeenCalled();
  });
  it("restores the directory URL on Back/Forward and defers returning to the requested history entry", () => {
    const f = fixture();
    f.handlers.popstate(f.event as unknown as PopStateEvent);
    expect(f.event.stopImmediatePropagation).toHaveBeenCalled();
    expect(f.restoreUrl).toHaveBeenCalledWith("https://app.test/?tab=courses&coursesSection=institutions");
    expect(f.leave).not.toHaveBeenCalled();
    f.requestLeave.mock.calls[0][0]();
    expect(f.leave).toHaveBeenCalledOnce();
  });
  it("uses the browser's native leave/stay guard for reload and close", () => {
    const f = fixture();
    const event = { preventDefault: vi.fn(), returnValue: undefined };
    f.handlers.beforeunload(event as unknown as BeforeUnloadEvent);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.returnValue).toBe("");
  });
});
