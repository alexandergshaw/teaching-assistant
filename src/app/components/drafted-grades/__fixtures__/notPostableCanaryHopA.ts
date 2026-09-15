// Fixture only - proves classTrendsDraft.not-postable.test.ts's walker
// recurses past depth 1, not merely checks the root's own direct imports.
// Never imported by application code, only by classTrendsDraft.not-postable.test.ts.
export { canaryHopB } from "./notPostableCanaryHopB";
