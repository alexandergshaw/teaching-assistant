// Blackboard rubric parsing - split out of cartridge-import-blackboard.ts for
// the same 1000-line-cap reason cartridge-import-blackboard-body.ts was, and
// because this is a distinct concern from manifest/tree parsing and item body
// resolution: recovering a course's grading rubric(s) from a Blackboard
// archive's LearnRubrics resource.
//
// THE SHAPE (verified against the instructor's real archive - see
// docs/REGRESSION.md entry 301's closing note: "the rubric resource (res00181,
// one 'Coding Assignment' rubric of 3 criteria x 4 ratings, attribute-
// addressable and mappable onto the existing CartridgeRubric model)"). A
// rubric .dat file's root is <LEARNRUBRICS>, holding one or more <RUBRIC>
// elements:
//   RUBRIC/TITLE/@value            - rubric title
//   RUBRIC/TYPE/@value              - "PERCENTAGE" in the real sample; every
//                                      other value (including absent) means
//                                      the numbers below are already absolute
//   RUBRIC/MAXVALUE/@value          - the rubric's overall point total
//   RUBRICROWS/ROW/HEADER/@value    - criterion description
//   ROW/PERCENTAGE/@value           - criterion weight (or absolute points -
//                                      see the TYPE branch above)
//   ROW/RUBRICCOLUMNS/COLUMN/HEADER/@value - the level name (e.g. "Exemplary
//                                      Performance") - NOT part of
//                                      CartridgeRubricRating's shape, so this
//                                      value is read but deliberately
//                                      discarded (see parseBlackboardRating).
//   COLUMN/CELL/CELLDESCRIPTION/@value - the rating prose
//   CELL/PERCENTAGE/@value          - rating weight (or absolute points)
//
// Element names are written here in the SAME uppercase convention already
// confirmed elsewhere in this Blackboard archive family (COURSEID, TITLE,
// DESCRIPTION, CONTENTHANDLER, REFERRER, REFERREDTO, ASMTID, COURSEASSESSMENT
// - see cartridge-import-blackboard.ts and cartridge-import-blackboard-body.ts)
// - LEARNRUBRICS itself is given verbatim by the survey that produced this
// module. This has NOT been verified byte-for-byte against the real
// res00181.dat the way the item-body pipeline was in entry 301 (that .dat was
// read only far enough to confirm its root element and criteria/ratings
// count) - see this file's test suite for the synthetic fixtures standing in
// for it, and parseBlackboardArchive's own comment for the honest caveat this
// carries into production.
//
// Dependency direction: this file depends only on cartridge-import-shared.ts
// (for the CartridgeRubric* shapes) and cartridge-import-blackboard-body.ts
// (for selfClosingAttrValue and BlackboardResourceEntry, exactly like
// cartridge-import-blackboard.ts itself does) - never the reverse, avoiding
// an import cycle the same way those two files already do.
import {
  type CartridgeRubric,
  type CartridgeRubricCriterion,
  type CartridgeRubricRating,
} from "./cartridge-import-shared";
import { type BlackboardResourceEntry, selfClosingAttrValue } from "./cartridge-import-blackboard-body";

const BLACKBOARD_RUBRIC_PERCENTAGE_TYPE = "PERCENTAGE";

// AC1 contract: never verified against a real manifest's <resources> block
// (the survey only opened res00181.dat itself, never the <resource> entry
// pointing at it - see this file's header comment), so rather than trust one
// unverified literal resource `type` string (Blackboard's other course-level
// resources follow a "course/x-bb-<name>" pattern, but the exact rubric
// variant was never confirmed), this matches ANY resource type CONTAINING
// "rubric" case-insensitively. Mirrors this codebase's existing preference
// for content-sniffing over trusting an unverified label (see
// detectCartridgeFormat in cartridge-import.ts, which inspects manifest
// content rather than a file extension) - and degrades safely: a manifest
// whose rubric resource type does not match this pattern simply yields no
// rubrics, exactly the status quo before this module existed, rather than
// throwing or guessing at a wrong resource.
const BLACKBOARD_RUBRIC_TYPE_PATTERN = /rubric/i;

// Rounding precision for AC3: `Row.Percentage * Rubric.MaxValue / 100` lands
// on values like 4.800000000000001 in IEEE754 (12.00000 * 40.000... / 100 -
// verified interactively; other MaxValue/Percentage combinations, e.g.
// 12 * 33.33 / 100, reproduce it even more visibly). Both consumers
// (useCourseImportActions.ts's handleImportRubric and
// useLmsAssignmentPull.ts's cartridgeRubricToText) interpolate `points`
// verbatim into text an instructor reads, and neither rounds downstream - so
// this module is the only place that ever will. Two decimal places matches
// the granularity Canvas's own rubric UI (and course_settings/rubrics.xml,
// this app's Canvas-format sibling) actually uses for point values - not
// zero (a PERCENTAGE-type rubric's converted points are frequently
// fractional, e.g. 4.8, and rounding to a whole number would silently change
// what the numbers mean) and not more (nothing downstream needs sub-cent-style
// precision, and carrying the raw IEEE754 tail into instructor-facing text is
// exactly the bug this rounds away).
const RUBRIC_POINTS_DECIMALS = 100;

function roundRubricPoints(value: number): number {
  return Math.round(value * RUBRIC_POINTS_DECIMALS) / RUBRIC_POINTS_DECIMALS;
}

// Parses a numeric attribute value, defaulting to 0 for anything missing or
// non-finite - mirrors parseRubrics' own `tagNumber(...) ?? 0` fallback in
// cartridge-import.ts, so AC1's "points is ALWAYS a number" holds the same
// way on both parsers.
function parseRubricNumber(value: string | null): number {
  if (value === null) return 0;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

// Generic <TAG ...>...</TAG> block finder for the LEARNRUBRICS shape - none
// of RUBRIC/ROW/COLUMN/CELL nest within themselves (unlike Blackboard's
// <item> tree, which is why that shape needed the depth-counted
// findDirectChildItemBlocks in cartridge-import-shared.ts instead), so a
// plain non-recursive regex pair is enough here. `[^>]*` in the opening-tag
// half already tolerates a mid-tag attribute line wrap (it is a negated
// character class, not `.`, so it matches newlines too) - the same tolerance
// selfClosingAttrValue's own doc comment explains, and the same hazard
// documented at cartridge-import-blackboard.ts:135.
function blackboardTagBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  // CASE-INSENSITIVE, and that is load-bearing rather than defensive.
  // Blackboard MIXES casing inside one file: verified against a real archive's
  // rubric resource, the root is `<LEARNRUBRICS>` and its date block is
  // `<DATES><CREATED/><UPDATED/></DATES>` (upper), while every element this
  // parser actually reads is mixed - `<Rubric>`, `<Title>`, `<Type>`,
  // `<MaxValue>`, `<RubricRows>`, `<Row>`, `<Header>`, `<Percentage>`,
  // `<RubricColumns>`, `<Column>`, `<Cell>`, `<CellDescription>`. An
  // upper-only matcher returns ZERO rubrics on a real archive while passing
  // every synthetic test written in the same wrong casing - green gates, dead
  // feature, which is the exact failure entries 262 check 10 and 274 check 6a
  // record. The `\b` after the tag keeps this safe: `<Rubric` cannot swallow
  // `<RubricRows`, and `<Cell` cannot swallow `<CellDescription`.
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) blocks.push(m[1]);
  return blocks;
}

// AC1: a Cell with no CELLDESCRIPTION is skipped entirely - mirrors
// parseRubrics' `if (ratingDescription === null) continue`.
function parseBlackboardRating(
  cellBlock: string,
  criterionPoints: number,
  isPercentage: boolean
): CartridgeRubricRating | null {
  const description = selfClosingAttrValue(cellBlock, "CELLDESCRIPTION");
  if (!description) return null;
  const raw = parseRubricNumber(selfClosingAttrValue(cellBlock, "PERCENTAGE"));
  // AC2: PERCENTAGE type converts a rating's own Percentage against its
  // criterion's (already-rounded - see the header comment above
  // parseBlackboardCriterion for why the rounded value is what feeds this,
  // not the raw intermediate) points; any other type takes the value as
  // already-absolute points, unconverted.
  const points = isPercentage ? roundRubricPoints((raw * criterionPoints) / 100) : roundRubricPoints(raw);
  return { description, points };
}

// AC1: a Row with no HEADER is skipped entirely (its criterion, and thus
// every rating nested under it, never surfaces) - mirrors parseRubrics'
// `if (description === null) continue`. `longDescription` is always null:
// Blackboard's rubric shape has no equivalent field (unlike Canvas's
// course_settings/rubrics.xml <long_description>), so there is nothing to
// populate it from - see CartridgeRubricCriterion's own `string | null` type
// in cartridge-import-shared.ts, which this satisfies directly rather than
// via `?? null`.
function parseBlackboardCriterion(
  rowBlock: string,
  rubricMaxValue: number,
  isPercentage: boolean
): CartridgeRubricCriterion | null {
  // Row's own HEADER/PERCENTAGE come before its nested RUBRICCOLUMNS - same
  // head/tail split parseRubrics uses for a criterion's own fields vs its
  // <ratings> block, and resolveBlackboardManifest-family functions use
  // throughout this file family. Scoping to the head also guards against
  // ever reading a nested COLUMN's own HEADER as if it were the row's.
  const columnsStart = rowBlock.search(/<RUBRICCOLUMNS\b/i);
  const head = columnsStart === -1 ? rowBlock : rowBlock.slice(0, columnsStart);
  const description = selfClosingAttrValue(head, "HEADER");
  if (!description) return null;

  const rawWeight = parseRubricNumber(selfClosingAttrValue(head, "PERCENTAGE"));
  // AC2: PERCENTAGE type converts Row.Percentage against Rubric.MaxValue;
  // any other Type (POINTS, absent, or an unrecognised future value) takes
  // Row.Percentage as already-absolute points, unconverted - see this file's
  // header comment on BLACKBOARD_RUBRIC_PERCENTAGE_TYPE's sibling constant
  // for the rationale: degrading to plausible absolute numbers on an unknown
  // Type beats silently zeroing the rubric, and applying the PERCENTAGE
  // conversion to an already-absolute value would silently produce a rubric
  // whose criteria sum to total-squared-over-100.
  const points = isPercentage ? roundRubricPoints((rawWeight * rubricMaxValue) / 100) : roundRubricPoints(rawWeight);

  const columnsBlock = columnsStart === -1 ? "" : rowBlock.slice(columnsStart);
  const ratings: CartridgeRubricRating[] = [];
  // AC1: ratings stay in document order - blackboardTagBlocks/regex exec walk
  // forward through the source text, and nothing here ever sorts the result.
  for (const columnBlock of blackboardTagBlocks(columnsBlock, "COLUMN")) {
    // A COLUMN's own HEADER is the level name (e.g. "Exemplary Performance")
    // - read out of the source shape, but CartridgeRubricRating has no field
    // for it (only description + points, sourced from the CELL below per
    // AC1/the contract in cartridge-import.ts's parseRubrics), so it is
    // deliberately never captured into a variable here.
    const cellBlock = blackboardTagBlocks(columnBlock, "CELL")[0];
    if (!cellBlock) continue;
    const rating = parseBlackboardRating(cellBlock, points, isPercentage);
    if (rating) ratings.push(rating);
  }

  return { description, points, longDescription: null, ratings };
}

// AC1: a RUBRIC with no TITLE is skipped entirely.
function parseBlackboardRubric(rubricBlock: string): CartridgeRubric | null {
  const rowsStart = rubricBlock.search(/<RUBRICROWS\b/i);
  const head = rowsStart === -1 ? rubricBlock : rubricBlock.slice(0, rowsStart);
  const title = selfClosingAttrValue(head, "TITLE");
  if (!title) return null;

  // AC2's TYPE branch: only an EXACT "PERCENTAGE" match converts. This is a
  // conversion, not a validation - see the header comment above
  // parseBlackboardCriterion for why an unrecognised future Type value must
  // fall through to "absolute" rather than being treated as an error.
  const isPercentage = selfClosingAttrValue(head, "TYPE") === BLACKBOARD_RUBRIC_PERCENTAGE_TYPE;
  const maxValue = parseRubricNumber(selfClosingAttrValue(head, "MAXVALUE"));

  const rowsBlock = rowsStart === -1 ? "" : rubricBlock.slice(rowsStart);
  const criteria: CartridgeRubricCriterion[] = [];
  for (const rowBlock of blackboardTagBlocks(rowsBlock, "ROW")) {
    const criterion = parseBlackboardCriterion(rowBlock, maxValue, isPercentage);
    if (criterion) criteria.push(criterion);
  }
  // AC4: no maxValue field is added to CartridgeRubric - it was only ever
  // needed as an input to the PERCENTAGE conversion above, not as output.
  return { title, criteria };
}

/**
 * Parse a Blackboard rubric resource's raw .dat XML (root <LEARNRUBRICS>)
 * into the same CartridgeRubric[] shape cartridge-import.ts's parseRubrics
 * produces from Canvas's course_settings/rubrics.xml - see this file's
 * header comment for the source shape and cartridge-import.ts's parseRubrics
 * (the contract this mirrors: title-less rubrics, header-less criteria, and
 * description-less ratings are all skipped; points is always a number;
 * longDescription is string | null; nothing is sorted).
 */
export function parseBlackboardRubrics(learnRubricsXml: string): CartridgeRubric[] {
  const rubrics: CartridgeRubric[] = [];
  for (const rubricBlock of blackboardTagBlocks(learnRubricsXml, "RUBRIC")) {
    const rubric = parseBlackboardRubric(rubricBlock);
    if (rubric) rubrics.push(rubric);
  }
  return rubrics;
}

/**
 * Find and parse every rubric resource in a Blackboard manifest's resources
 * map (see BLACKBOARD_RUBRIC_TYPE_PATTERN above for the type-matching
 * heuristic and its honesty caveat), reading only the candidate file(s) -
 * never every resource in the archive. Fail-forward, matching every other
 * field in this module family: a manifest with no matching resource, or a
 * matching resource whose .dat cannot be read, simply yields no rubrics
 * rather than failing the whole import.
 */
export async function resolveBlackboardRubrics(
  resources: Map<string, BlackboardResourceEntry>,
  readEntry: (path: string) => Promise<string | null>
): Promise<CartridgeRubric[]> {
  const rubrics: CartridgeRubric[] = [];
  for (const entry of resources.values()) {
    if (!entry.type || !entry.bbFile || !BLACKBOARD_RUBRIC_TYPE_PATTERN.test(entry.type)) continue;
    const dat = await readEntry(entry.bbFile);
    if (!dat) continue;
    rubrics.push(...parseBlackboardRubrics(dat));
  }
  return rubrics;
}
