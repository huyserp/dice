/**
 * The public API of `@dice/scoring`.
 *
 * Everything other packages may import is listed here. Module-level `export`
 * inside `src/` is a narrower thing — it means "a sibling file or a test may
 * reach this" — and does not imply the symbol belongs on this list.
 *
 * Kept deliberately small: widening this later is a non-event, narrowing it is
 * a breaking change for every caller.
 */

export type {
  CategoryId,
  CategoryRule,
  Die,
  LowerCategoryId,
  Roll,
  Ruleset,
  ScoredCategory,
  ScorecardTotals,
  UpperBonus,
  UpperCategoryId,
} from './types.js';

export { STANDARD_YAHTZEE, UPPER_CATEGORY_IDS } from './rulesets.js';

export { computeTotals, scoreCategory } from './score.js';

export { suggest, UnknownCategoryError } from './suggest.js';
export type { Suggestion } from './suggest.js';
