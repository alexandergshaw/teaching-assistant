import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./InstitutionDirectoryTab.tsx", import.meta.url), "utf8");

describe("institution directory production handler wiring", () => {
  it.each([
    ["listInstitutionDirectoryAction", "runInstitutionDirectoryList"],
    ["saveInstitutionDirectoryProfileAction", "runProfileRequest"],
    ["removeInstitutionDirectoryProfileAction", "runInstitutionDirectoryRemoveProfile"],
    ["saveInstitutionDirectoryColumnAction", "runColumnRequest"],
    ["removeInstitutionDirectoryColumnAction", "runInstitutionDirectoryRemoveColumn"],
    ["saveInstitutionDirectoryValueAction", "runValueRequest"],
  ])("passes %s through its production request handler", (action, handler) => {
    const actionCall = new RegExp(`${handler}\\(\\{[\\s\\S]{0,500}?request:\\s*(?:\\(\\)\\s*=>\\s*)?${action}\\b`);
    expect(source).toMatch(actionCall);
  });

  it("dispatches create/update, create/rename, and save/clear through fixed operation handlers", () => {
    expect(source).toContain('mode === "create" ? runInstitutionDirectoryCreateProfile : runInstitutionDirectoryUpdateProfile');
    expect(source).toContain("id ? runInstitutionDirectoryRenameColumn : runInstitutionDirectoryCreateColumn");
    expect(source).toContain('operation === "save-value" ? runInstitutionDirectorySaveValue : runInstitutionDirectoryClearValue');
  });

  it("delegates closed errors and busy reset to handlers with the real setters", () => {
    expect(source).toContain("isRefresh: loadedOnce.current, setError, setBusy");
    expect(source).toContain("request: () => saveInstitutionDirectoryProfileAction(profile, mode), setError, setBusy");
    expect(source).toContain("request: () => removeInstitutionDirectoryProfileAction(record.profile.acronym), setError, setBusy");
    expect(source).toContain("request: () => removeInstitutionDirectoryColumnAction(id), setError, setBusy");
    expect(source).toMatch(/saveInstitutionDirectoryColumnAction\([\s\S]{0,500}?setError, setBusy/);
    expect(source).toMatch(/saveInstitutionDirectoryValueAction\([\s\S]{0,500}?setError, setBusy/);
    expect(source).toContain("Could not load institutions. Try again.");
    expect(source).toContain("Could not refresh institutions. Your last saved rows are still shown; try again.");
  });

  it("refreshes through a separate list handler after fulfilled mutations", () => {
    expect(source).toMatch(/await load\(\)/);
    expect(source).toContain("runInstitutionDirectoryList({ startedAt: started");
  });
});
