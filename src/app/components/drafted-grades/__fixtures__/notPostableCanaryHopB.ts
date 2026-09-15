// Fixture only - see notPostableCanaryHopA.ts. This is the file that
// actually carries the forbidden import; hop A does not. Never imported by
// application code, only reached (through hop A) by
// classTrendsDraft.not-postable.test.ts.
export { resolveCourse as canaryHopB } from "@/lib/canvas-core";
