/** File count matches the pinned GitHub scoped-reader ceiling. Byte limits
 * and the pre-dispatch evidence capacity check apply independently. */
export const MAX_GENERIC_EXECUTION_FILES = 200;
export const MAX_GENERIC_OUTPUT_JSON_BYTES = 4000;
/** Bounds apply to hash-verified binary execution, not the model text digest. */
export const MAX_WINDOWS_EXECUTABLE_BYTES = 3_000_000;
export const MAX_WINDOWS_INVENTORY_BYTES = 4_000_000;
