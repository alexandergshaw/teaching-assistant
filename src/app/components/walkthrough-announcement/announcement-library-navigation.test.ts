import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { announcementLibraryNavigation } from "./announcement-library-navigation";
import { createAnnouncementLibraryController } from "./announcement-library-controller";

// Execute the installed Next functions, rather than an approximation of its wrapper.
const nextSource = readFileSync(createRequire(import.meta.url).resolve("next/dist/client/components/app-router.js"), "utf8");
const parsed = ts.createSourceFile("app-router.js", nextSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
function installed(name: string): string {
  let found = "";
  function visit(node: ts.Node) {
    if (ts.isFunctionExpression(node) && node.name?.text === name || ts.isFunctionDeclaration(node) && node.name?.text === name) found = node.getText(parsed);
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === name && node.initializer) found = node.initializer.getText(parsed);
    ts.forEachChild(node, visit);
  }
  visit(parsed); if (!found) throw Error(`Missing installed Next function: ${name}`); return found;
}
function fixture(dirty = true, direction = "Back") {
  const sourceState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: "SOURCE" }, custom: "preserved" };
  const destinationState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: "DESTINATION" } };
  const sourceUrl = "https://example.test/?tab=announcements";
  let href = sourceUrl, state: unknown = sourceState;
  const destination = { url: "https://example.test/other", state: destinationState };
  const source = { url: sourceUrl, state: sourceState };
  const stack: { url: string; state: unknown }[] = direction === "Back" ? [destination, source] : [source, destination, { url: "https://example.test/future", state: destinationState }];
  let position = direction === "Back" ? 1 : 0;
  const restores = vi.fn(), traversals = vi.fn(), confirm = vi.fn(), dispose = vi.fn();
  const nativePush = vi.fn((data: unknown, unused: string, url: string) => { state = data; href = new URL(url, href).href; stack.splice(position + 1); stack.push({ url: href, state }); position++; });
  const browser = { location: { get href() { return href; }, reload: vi.fn() }, history: { get state() { return state; } } };
  const runtime = new Function("window", "originalPushState", "_react", "_useactionqueue", "_routerreducertypes", "_approuterinstance", `
    ${installed("copyNextJsInternalHistoryState")}
    const applyUrlFromHistoryPushReplace = ${installed("applyUrlFromHistoryPushReplace")};
    return { push: ${installed("pushState")}, pop: ${installed("onPopState")} };
  `)(browser, nativePush, { startTransition: (fn: () => void) => fn() }, { dispatchAppRouterAction: restores }, { ACTION_RESTORE: "restore" }, { dispatchTraverseAction: traversals });
  const back = vi.fn(() => { position--; href = stack[position].url; state = stack[position].state; pop(); });
  const controller = { dirty: () => dirty, dispose };
  const navigation = announcementLibraryNavigation(controller, {
    currentUrl: () => href, currentState: () => state, restore: (data, url) => runtime.push(data, "", url), back, confirm,
  });
  navigation.checkpoint();
  function pop() {
    let stopped = false;
    const event = { state, stopImmediatePropagation: vi.fn(() => { stopped = true; }) };
    navigation.popstate(event as unknown as PopStateEvent);
    if (!stopped) runtime.pop(event);
    return event;
  }
  const click = vi.fn();
  const anchor = { href: "https://example.test/route", click, target: "", hasAttribute: () => false };
  const event = { button: 0, target: { closest: () => anchor }, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
  return { navigation, controller, sourceState, destinationState, sourceUrl, restores, traversals, nativePush, back, confirm, click, anchor, event, pop,
    get url() { return href; }, get state() { return state; },
    traverse() { position += direction === "Back" ? -1 : 1; href = stack[position].url; state = stack[position].state; },
    traverseBack() { position--; href = stack[position].url; state = stack[position].state; },
    stackUrls: () => stack.map(entry => entry.url),
    move(url: string, data: unknown) { href = url; state = data; }, setDirty(value: boolean) { dirty = value; } };
}
afterEach(() => vi.useRealTimers());
describe("library departure through the installed Next history runtime", () => {
  for (const direction of ["Back", "Forward"]) it(`holds ${direction} with the source URL AND router state until the choice`, () => {
    const f = fixture(true, direction);
    // Traversal has already moved the browser to the destination before popstate.
    f.traverse(); const event = f.pop();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(f.url).toBe(f.sourceUrl); expect(f.state).toBe(f.sourceState);
    expect(f.nativePush).toHaveBeenCalledWith(f.sourceState, "", f.sourceUrl);
    expect(f.restores).not.toHaveBeenCalled(); expect(f.traversals).not.toHaveBeenCalled();
    if (direction === "Forward") expect(f.stackUrls()).not.toContain("https://example.test/future");
    f.navigation.stay(); expect(f.back).not.toHaveBeenCalled(); expect(f.controller.dispose).not.toHaveBeenCalled();
    f.traverseBack(); f.pop(); f.navigation.discard();
    expect(f.back).toHaveBeenCalledOnce();
    expect(f.traversals).toHaveBeenCalledWith("https://example.test/other", f.destinationState.__PRIVATE_NEXTJS_INTERNALS_TREE);
    expect(f.controller.dispose).not.toHaveBeenCalled();
    const immediate = fixture(true, direction); immediate.traverse(); immediate.pop(); immediate.navigation.discard();
    expect(immediate.traversals).toHaveBeenCalledWith("https://example.test/other", immediate.destinationState.__PRIVATE_NEXTJS_INTERNALS_TREE);
  });
  it("would expose the old null-state restoration's destination-tree mismatch", () => {
    const f = fixture(); f.move("https://example.test/other", f.destinationState);
    // This oracle validates the precise defect that a plain fake pushState missed.
    const push = new Function("window", "originalPushState", "_react", "_useactionqueue", "_routerreducertypes", `
      ${installed("copyNextJsInternalHistoryState")}
      const applyUrlFromHistoryPushReplace = ${installed("applyUrlFromHistoryPushReplace")}; return ${installed("pushState")};
    `)({ location: { href: f.url }, history: { state: f.state } }, f.nativePush, { startTransition: (fn: () => void) => fn() }, { dispatchAppRouterAction: f.restores }, { ACTION_RESTORE: "restore" });
    push(null, "", f.sourceUrl);
    expect(f.restores).toHaveBeenCalledWith(expect.objectContaining({ historyState: f.destinationState.__PRIVATE_NEXTJS_INTERNALS_TREE }));
    expect(f.state).toEqual(f.destinationState);
  });
  it("captures source state when clean navigation becomes dirty", () => {
    const f = fixture(false), newer = { ...f.sourceState, custom: "new checkpoint" };
    f.move("https://example.test/new-source", newer); f.setDirty(true); f.navigation.checkpoint();
    f.move("https://example.test/other", f.destinationState); f.pop();
    expect(f.nativePush).toHaveBeenCalledWith(newer, "", "https://example.test/new-source");
  });
  it("allows query/hash traversal while the same document keeps the library mounted", () => {
    const f = fixture(); f.move("https://example.test/?tab=other#section", f.sourceState);
    const event = f.pop(); expect(event.stopImmediatePropagation).not.toHaveBeenCalled(); expect(f.confirm).not.toHaveBeenCalled();
    f.move("https://example.test/other", f.destinationState); f.pop();
    expect(f.nativePush).toHaveBeenCalledWith(f.sourceState, "", "https://example.test/?tab=other#section");
  });
  it("intercepts actual route links, preserves Stay, and permits just the replay", () => {
    const f = fixture();
    f.click.mockImplementation(() => f.navigation.click(f.event as unknown as MouseEvent));
    f.navigation.click(f.event as unknown as MouseEvent);
    expect(f.event.preventDefault).toHaveBeenCalledOnce(); expect(f.click).not.toHaveBeenCalled();
    f.navigation.stay(); f.navigation.discard(); expect(f.click).not.toHaveBeenCalled();
    f.navigation.click(f.event as unknown as MouseEvent); f.navigation.discard();
    expect(f.click).toHaveBeenCalledOnce(); expect(f.controller.dispose).not.toHaveBeenCalled();
    // A canceled/failed replay leaves a mounted controller and its next barrier usable.
    f.navigation.click(f.event as unknown as MouseEvent); expect(f.confirm).toHaveBeenLastCalledWith(true);
  });
  it("ignores same-URL/hash links and allows ordinary non-departure gestures", () => {
    const f = fixture();
    for (const href of [f.sourceUrl, `${f.sourceUrl}#library`, "https://example.test/", "https://example.test/?tab=other", "mailto:teacher@example.test"]) {
      f.anchor.href = href; f.navigation.click(f.event as unknown as MouseEvent);
    }
    f.anchor.href = "https://example.test/route"; f.anchor.target = "_blank"; f.navigation.click(f.event as unknown as MouseEvent);
    f.anchor.target = ""; f.navigation.click({ ...f.event, ctrlKey: true } as unknown as MouseEvent);
    f.setDirty(false); f.navigation.click(f.event as unknown as MouseEvent);
    expect(f.confirm).not.toHaveBeenCalled();
  });
  it("allows a same-page brand link and keeps the mounted controller editable and autosaving", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => ({ ok: false as const, code: "unavailable" as const }));
    const c = createAnnouncementLibraryController("course", { list: async () => ({ ok: true, value: [] }), save, remove: async () => ({ ok: true, value: undefined }) }, vi.fn(), { debounceMs: 5, uuid: () => "one" });
    c.activate(); const id = c.add("first")!;
    const navigation = announcementLibraryNavigation(c, { currentUrl: () => "https://example.test/?tab=announcements", currentState: () => ({}), restore: vi.fn(), back: vi.fn(), confirm: vi.fn() });
    const click = vi.fn(), event = { button: 0, target: { closest: () => ({ href: "https://example.test/", click, target: "", hasAttribute: () => false }) }, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
    navigation.click(event as unknown as MouseEvent); navigation.discard();
    expect(event.preventDefault).not.toHaveBeenCalled(); expect(click).not.toHaveBeenCalled(); expect(c.isDisposed()).toBe(false);
    c.edit(id, "exemplarText", "still editable"); await vi.advanceTimersByTimeAsync(5);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ exemplarText: "still editable" }));
    // Strict Mode effect cleanup/setup is the lifecycle owner; the guard never disposes.
    c.dispose(); c.activate(); c.edit(id, "label", "remounted"); expect(c.isDisposed()).toBe(false); c.dispose();
  });
});
