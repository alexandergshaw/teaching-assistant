/** A single portable path component used only as an argument or sandbox file
 * name, never as shell syntax. Permit Unicode letters and numbers without
 * allowing separators, controls, metacharacters, or traversal. */
export function isSafeGenericExecutionComponent(value: string): boolean {
  return value !== "." && value !== ".." && /^[\p{L}\p{M}\p{N}_. -]+$/u.test(value);
}
