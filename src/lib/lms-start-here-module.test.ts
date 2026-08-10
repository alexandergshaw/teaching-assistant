import { describe, it, expect } from "vitest";
import { findStartHereModule, resolveModuleForSyllabusPlacement, type ModuleLike } from "./lms-start-here-module";

const mods = (...names: string[]): ModuleLike[] => names.map((name, i) => ({ id: i + 1, name }));

describe("findStartHereModule", () => {
  it("finds an exact-case match", () => {
    const found = findStartHereModule(mods("Week 1", "Start Here", "Week 2"));
    expect(found?.name).toBe("Start Here");
  });

  it("matches case-insensitively", () => {
    const found = findStartHereModule(mods("Week 1", "START HERE"));
    expect(found?.id).toBe(2);
  });

  it("matches with leading/trailing whitespace on the module name", () => {
    const found = findStartHereModule(mods("  Start Here  "));
    expect(found?.id).toBe(1);
  });

  it("returns undefined when no module matches - never invents one", () => {
    expect(findStartHereModule(mods("Week 1", "Week 2"))).toBeUndefined();
  });

  it("returns undefined for an empty module list", () => {
    expect(findStartHereModule([])).toBeUndefined();
  });

  it("returns the FIRST match when (unexpectedly) more than one module matches", () => {
    const found = findStartHereModule(mods("Start Here", "start here"));
    expect(found?.id).toBe(1);
  });
});

describe("resolveModuleForSyllabusPlacement", () => {
  it("prefers Start Here even when it is not first in the list", () => {
    const modules = mods("Week 1", "Start Here", "Week 2");
    expect(resolveModuleForSyllabusPlacement(modules)?.name).toBe("Start Here");
  });

  it("falls back to the first module when there is no Start Here module", () => {
    const modules = mods("Week 1", "Week 2");
    expect(resolveModuleForSyllabusPlacement(modules)?.name).toBe("Week 1");
  });

  it("returns null when the course has no modules at all", () => {
    expect(resolveModuleForSyllabusPlacement([])).toBeNull();
  });
});
