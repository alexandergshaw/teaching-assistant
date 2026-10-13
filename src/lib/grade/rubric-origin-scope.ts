/** Attribution carried by a rubric, rather than a requested memory lookup key. */
export type RubricOriginScope = string & { readonly rubricOriginScope: true };

/** Ordinary lookup strings are accepted; directly typed origins are excluded. */
export type RubricStorageScope = string & { readonly rubricOriginScope?: never };

/** Establish attribution at its boundary without changing the stored bytes. */
export function asRubricOriginScope(scope: string): RubricOriginScope {
  return scope as RubricOriginScope;
}
