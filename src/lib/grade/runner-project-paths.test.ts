import { expect, it } from "vitest";
import { restoreRunnerProjectPaths } from "./runner-project-paths";
it("restores project paths and preserves plain upload names", () => {
  expect(restoreRunnerProjectPaths([{ name: "generate_data.py", content: "code" }, { name: "input.csv", content: "data" }], [{ name: "src/generate_data.py", extension: "py" }, { name: "data/input.csv", extension: "csv" }])).toEqual([{ name: "src/generate_data.py", content: "code" }, { name: "data/input.csv", content: "data" }]);
  expect(restoreRunnerProjectPaths([{ name: "main.py", content: "code" }], [{ name: "main.py", extension: "py" }])).toEqual([{ name: "main.py", content: "code" }]);
});
it.each(["../main.py", "/main.py", "C:/main.py", "src/../main.py"])("refuses unsafe path %s", name => {
  expect(restoreRunnerProjectPaths([{ name: "main.py", content: "code" }], [{ name, extension: "py" }])).toBeNull();
});
it("refuses ambiguous duplicate basenames", () => {
  expect(restoreRunnerProjectPaths([{ name: "main.py", content: "code" }], [{ name: "a/main.py", extension: "py" }, { name: "b/main.py", extension: "py" }])).toBeNull();
});
