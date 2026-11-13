/** Recognize narrowly-scoped optional build output in this assignment only.
 * The caller must first verify bytes against the pinned Git blob and establish
 * that the instruction text came from the instructor's trusted template. */
export function classifyModule12Artifact(
  path: string, bytes: Uint8Array, sourcePaths: readonly string[], trustedInstructions: string,
): { sourcePath: string; format: "java-class" | "elf" | "pe" | "python-bytecode" } | null {
  const required = ["test_utils.py", "TestUtils.java", "test_utils.cpp"];
  if (!/Module 12\s*[–-]\s*Unit Testing Suite/i.test(trustedInstructions)
    || !/three separate files/i.test(trustedInstructions)
    || !required.every((name) => trustedInstructions.includes(name))) return null;
  if (/^assignments\/module_12\/__pycache__\/test_utils\.cpython-\d{2,3}\.pyc$/.test(path)) {
    const sourcePath = "assignments/module_12/test_utils.py";
    // CPython bytecode header identifies a candidate for disclosure, not its
    // correctness or equivalence to the source.
    if (bytes.length < 16 || bytes[2] !== 13 || bytes[3] !== 10
      || ![0, 1, 3].includes(bytes[4]) || bytes[5] !== 0 || bytes[6] !== 0 || bytes[7] !== 0
      || !sourcePaths.includes(sourcePath)) return null;
    return { sourcePath, format: "python-bytecode" };
  }
  const slash = path.lastIndexOf("/");
  const dir = slash < 0 ? "" : path.slice(0, slash + 1);
  const base = path.slice(slash + 1);
  let source: string, format: "java-class" | "elf" | "pe";
  if (base === "TestUtils.class" && bytes.length >= 8
    && bytes[0] === 0xca && bytes[1] === 0xfe && bytes[2] === 0xba && bytes[3] === 0xbe) {
    source = "TestUtils.java"; format = "java-class";
  } else if (base === "test_utils" && bytes.length >= 16
    && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
    source = "test_utils.cpp"; format = "elf";
  } else if (base === "test_utils.exe" && bytes.length >= 64 && bytes[0] === 0x4d && bytes[1] === 0x5a) {
    const offset = bytes[60] | bytes[61] << 8 | bytes[62] << 16 | bytes[63] << 24;
    if (offset < 64 || offset + 4 > bytes.length || bytes[offset] !== 0x50 || bytes[offset + 1] !== 0x45 || bytes[offset + 2] !== 0 || bytes[offset + 3] !== 0) return null;
    source = "test_utils.cpp"; format = "pe";
  } else return null;
  const sourcePath = dir + source;
  if (!sourcePaths.includes(sourcePath)) return null;
  return { sourcePath, format };
}
