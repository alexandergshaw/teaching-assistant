import { expect, it, vi } from "vitest";
import { createScriptCopyController } from "./script-copy";

it("reports only the latest overlapping clipboard request", async () => {
  const controller = createScriptCopyController();
  let finishFirst!: () => void;
  const first = new Promise<void>(resolve => { finishFirst = resolve; });
  const report = vi.fn();
  const older = controller.copy("old", () => first, report);
  await controller.copy("new", async () => { throw new Error("clipboard unavailable"); }, report);
  finishFirst();
  await older;
  expect(report.mock.calls).toEqual([["failed"]]);
});

it("invalidates pending copies when the script changes or resets", async () => {
  const controller = createScriptCopyController();
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const report = vi.fn();
  const copy = controller.copy("draft", () => pending, report);
  controller.invalidate();
  finish();
  await copy;
  expect(report).not.toHaveBeenCalled();
  await controller.copy("edited", async () => {}, report);
  expect(report).toHaveBeenCalledWith("copied");
});
