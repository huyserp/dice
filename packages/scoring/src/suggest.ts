import type { CategoryId, CategoryRule, Roll, Ruleset } from './types.js';
import { assertNever, scoreCategory } from './score.js';

/**
 * Highest value a single die can show. `Die` is `1 | 2 | 3 | 4 | 5 | 6`, and
 * TypeScript can't hand back the largest member of a literal union at runtime,
 * so this is stated once here rather than scattered through the ceilings below.
 */
const MAX_FACE = 6;

/**
 * Thrown when a caller asks about a category the ruleset doesn't define.
 *
 * This is an invariant violation, not user input validation — see `suggest`.
 *
 * The `readonly` modifiers in the constructor signature are TypeScript
 * "parameter properties": they declare and assign the fields in one step, so
 * there is no separate `this.rulesetId = rulesetId`. The fields carry the
 * offending ids so a log line can name them without re-deriving anything.
 */
export class UnknownCategoryError extends Error {
  constructor(
    readonly rulesetId: string,
    readonly categoryIds: readonly CategoryId[],
  ) {
    super(`Ruleset ${rulesetId} defines no category: ${categoryIds.join(', ')}`);
    this.name = 'UnknownCategoryError';
  }
}

export interface Suggestion {
  readonly categoryId: CategoryId;
  /** What this roll scores in that category right now. */
  readonly score: number;
  /**
   * How much of that category's realistic ceiling this roll captures, 0..1.
   * Taking 30/30 in a small straight ranks above taking 24 in chance even
   * though 24 > 30 is false — the point is opportunity cost, not raw points.
   */
  readonly efficiency: number;
}

/**
 * The best this category could ever score, used as the denominator for
 * `efficiency`.
 *
 * Derived from the rule rather than tabulated per category id, so a variant
 * gets correct ceilings without touching this function. Same exhaustive-switch
 * shape as `scoreCategory` — adding a new `CategoryRule` kind breaks compilation
 * here too, which is the intended behaviour.
 */
function ceilingFor(rule: CategoryRule, diceCount: number): number {
  switch (rule.kind) {
    // Best case is every die showing this face.
    case 'sumOfFace':
      return diceCount * rule.face;

    // Both score the sum of all dice, so the ceiling is all sixes.
    case 'nOfAKind':
    case 'sumAll':
      return diceCount * MAX_FACE;

    // Fixed-award categories score their face value or nothing.
    case 'fullHouse':
    case 'straight':
    case 'allSame':
      return rule.points;

    default:
      return assertNever(rule);
  }
}

/**
 * Rank the open categories for a given roll, best first.
 *
 * SCOPE LIMIT: this is a one-roll heuristic, not a solver. It scores the roll in
 * every open category, divides by that category's ceiling, and sorts. It does
 * not model re-rolls, does not look at what is still unfilled elsewhere on the
 * card, and will happily advise taking a small straight when holding for the
 * large one is better.
 *
 * A real expected-value solver is a dynamic-programming problem over the whole
 * game state. If that gets built, it belongs behind this same signature in a
 * separate module — see docs/roadmap.md, "Out of scope".
 *
 * Throws `UnknownCategoryError` if any id isn't defined by the ruleset. That is
 * an assertion about a bug, not input validation: by the time a request reaches
 * this function its body must already have been parsed and checked at the
 * network boundary. Reaching here with a bad id means the parse layer is broken
 * or was skipped, and silently returning a shorter list would hide that.
 *
 * A Lambda must therefore validate untrusted input *before* calling in, and map
 * this exception to a 5xx rather than a 4xx — it means we shipped a bug, not
 * that the client sent something bad.
 */
export function suggest(
  ruleset: Ruleset,
  roll: Roll,
  openCategories: readonly CategoryId[],
): readonly Suggestion[] {
  const known = new Set<CategoryId>(ruleset.categories.map((rule) => rule.id));
  const unknown = openCategories.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new UnknownCategoryError(ruleset.id, unknown);
  }

  const open = new Set<CategoryId>(openCategories);

  return ruleset.categories
    .filter((rule) => open.has(rule.id))
    .map((rule) => {
      const score = scoreCategory(rule, roll);
      const ceiling = ceilingFor(rule, roll.length);
      return {
        categoryId: rule.id,
        score,
        // Guard the divide: a variant could define a zero-point category, and
        // 0/0 is NaN, which would poison the sort silently.
        efficiency: ceiling === 0 ? 0 : score / ceiling,
      };
    })
    .sort((a, b) => b.efficiency - a.efficiency || b.score - a.score);
}
