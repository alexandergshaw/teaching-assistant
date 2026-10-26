import { expect, it } from "vitest";
import { isLengthDeductionThresholdWords, LENGTH_DEDUCTION_THRESHOLD_WORDS_DEFAULT } from "./length-deduction-policy";
it.each([1, 25, 1_000_000])("accepts an integer word shortfall %s", (value) => expect(isLengthDeductionThresholdWords(value)).toBe(true));
it.each([undefined, null, "25", 0, -1, 1.5, NaN, Infinity, 1_000_001, {}, true])("rejects malformed shortfall %s", (value) => expect(isLengthDeductionThresholdWords(value)).toBe(false));
it("defaults the chat threshold to one word", () => expect(LENGTH_DEDUCTION_THRESHOLD_WORDS_DEFAULT).toBe(1));
