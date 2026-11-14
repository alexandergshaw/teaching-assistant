import { describe, expect, it } from "vitest";
import { isSafeGenericExecutionComponent } from "./generic-execution-path";
import { planGenericRepoExecution } from "./generic-repo-execution-plan";

describe("portable execution paths", () => {
  it("accepts Unicode names in a pinned source plan", () => {
    const path = "assignments/estudiantes/área principal/solución.py";
    const bytes = new TextEncoder().encode("if __name__ == '__main__':\n    print('ok')\n");
    expect(planGenericRepoExecution([{ path, bytes }]).runs).toEqual([
      { language: "python", entryPoint: path, selection: "heuristic" },
    ]);
  });

  it.each(["", ".", "..", "a/b", "a\\b", "a;cmd", "$(cmd)", "a\nfile"])(
    "rejects unsafe component %j", (name) => {
      expect(isSafeGenericExecutionComponent(name)).toBe(false);
    },
  );
});
