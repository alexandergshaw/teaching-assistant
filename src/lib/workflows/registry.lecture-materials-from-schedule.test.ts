import { describe, it, expect } from "vitest";
import { getStepDefinition } from "./registry";

describe("lecture-materials-from-schedule step", () => {
  it("has correct inputs and outputs", () => {
    const step = getStepDefinition("lecture-materials-from-schedule");
    expect(step, "step is registered").toBeTruthy();

    const inputs = step!.inputs;
    const inputByKey = new Map(inputs.map((inp) => [inp.key, inp]));

    // Verify required inputs
    expect(inputByKey.has("schedule"), "has schedule input").toBe(true);
    expect(inputByKey.get("schedule")!.required, "schedule is required").toBe(true);
    expect(inputByKey.get("schedule")!.type, "schedule type").toBe("schedule");

    expect(inputByKey.has("minutes"), "has minutes input").toBe(true);
    expect(inputByKey.get("minutes")!.required, "minutes is required").toBe(true);
    expect(inputByKey.get("minutes")!.type, "minutes type").toBe("number");
    expect(
      inputByKey.get("minutes")!.help,
      "minutes has help text about default 50 behavior"
    ).toContain("50");

    // Verify optional inputs
    expect(inputByKey.has("description"), "has description input").toBe(true);
    expect(inputByKey.get("description")!.required, "description is optional").toBe(false);
    expect(inputByKey.get("description")!.type, "description type").toBe("longtext");

    expect(inputByKey.has("hubCourse"), "has hubCourse input").toBe(true);
    expect(inputByKey.get("hubCourse")!.required, "hubCourse is optional").toBe(false);
    expect(inputByKey.get("hubCourse")!.type, "hubCourse type").toBe("hubCourse");

    expect(inputByKey.has("includeInstructions"), "has includeInstructions input").toBe(true);
    expect(inputByKey.get("includeInstructions")!.required, "includeInstructions is optional").toBe(
      false
    );
    expect(inputByKey.get("includeInstructions")!.type, "includeInstructions type").toBe("boolean");

    expect(inputByKey.has("template"), "has template input").toBe(true);
    expect(inputByKey.get("template")!.required, "template is optional").toBe(false);
    expect(inputByKey.get("template")!.type, "template type").toBe("deckTemplate");

    expect(inputByKey.has("sources"), "has sources input").toBe(true);
    expect(inputByKey.get("sources")!.required, "sources is optional").toBe(false);
    expect(inputByKey.get("sources")!.type, "sources type").toBe("sourcePolicy");

    // Verify outputs
    const outputs = step!.outputs;
    const outputByKey = new Map(outputs.map((out) => [out.key, out]));

    expect(outputByKey.has("files"), "has files output").toBe(true);
    expect(outputByKey.get("files")!.type, "files type").toBe("files");
  });
});
