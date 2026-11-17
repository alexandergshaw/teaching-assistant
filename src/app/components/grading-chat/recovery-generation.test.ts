import { expect, it } from "vitest";
import { automaticRecoveryIsCurrent, invalidateRecoveryGeneration } from "./recovery-generation";

it("invalidates an in-flight inspection even if manual selection advanced it", () => {
  const generation = { current: 1 }, oldToken = generation.current;
  generation.current += 1;
  const manualToken = generation.current;
  invalidateRecoveryGeneration(generation);
  expect(generation.current).not.toBe(oldToken);
  expect(generation.current).not.toBe(manualToken);
});

it("never auto-admits a prior file, prior owner, or invalidated inspection", () => {
  const file = new File(["a"], "a.zip"), next = new File(["b"], "b.zip");
  const automatic = { file, labels: ["1"], generation: 3, identityGroup: "1", identityStudent: "Ada" };
  expect(automaticRecoveryIsCurrent(automatic, 3, file, file, "1", "Ada")).toBe(true);
  expect(automaticRecoveryIsCurrent(automatic, 4, file, file, "1", "Ada")).toBe(false);
  expect(automaticRecoveryIsCurrent(automatic, 3, file, next, "1", "Ada")).toBe(false);
  expect(automaticRecoveryIsCurrent(automatic, 3, file, file, "1", "Bea")).toBe(false);
  expect(automaticRecoveryIsCurrent(automatic, 3, file, file, "2", "Ada")).toBe(false);
});
