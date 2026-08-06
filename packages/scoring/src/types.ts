/**
 * Core domain types.
 *
 * TypeScript notes for a first pass:
 *
 * - `Die` is a *literal union*, not `number`. The compiler will reject a 7 at the
 *   call site instead of letting it become a runtime bug. This is the single
 *   biggest day-one win over plain JS.
 *
 * - `Roll` is a fixed-length readonly tuple. Length is checked at compile time,
 *   and `readonly` stops a scoring function from mutating its input.
 *
 * - `CategoryRule` is a *discriminated union*: every member has a `kind` field,
 *   so narrowing on `kind` tells the compiler exactly which other fields exist.
 *   This is the pattern that replaces the "one big object with lots of optional
 *   fields" habit from JS. Learn this one properly — it's most of idiomatic TS.
 */

export type Die = 1 | 2 | 3 | 4 | 5 | 6;

/** Five dice. Fixed length, immutable. */
export type Roll = readonly [Die, Die, Die, Die, Die];

export type UpperCategoryId =
  | 'ones'
  | 'twos'
  | 'threes'
  | 'fours'
  | 'fives'
  | 'sixes';

export type LowerCategoryId =
  | 'threeOfAKind'
  | 'fourOfAKind'
  | 'fullHouse'
  | 'smallStraight'
  | 'largeStraight'
  | 'yahtzee'
  | 'chance';

export type CategoryId = UpperCategoryId | LowerCategoryId;

/**
 * Rules as data.
 *
 * The group's house variant should be expressible as a different `Ruleset`
 * value — a row in the `rulesets` table — never as a new branch in the scoring
 * code. If you find yourself adding `if (ruleset.name === ...)` anywhere, the
 * rule shape needs extending instead.
 */
export type CategoryRule =
  /** Sum only the dice showing `face`. Upper section. */
  | { readonly kind: 'sumOfFace'; readonly id: UpperCategoryId; readonly face: Die }
  /** Needs `n` of a kind; scores the sum of all five dice. */
  | { readonly kind: 'nOfAKind'; readonly id: CategoryId; readonly n: number }
  /** Three of one face plus two of another. Fixed points. */
  | { readonly kind: 'fullHouse'; readonly id: CategoryId; readonly points: number }
  /** `length` distinct consecutive faces. Fixed points. */
  | { readonly kind: 'straight'; readonly id: CategoryId; readonly length: number; readonly points: number }
  /** All five dice equal. Fixed points. */
  | { readonly kind: 'allSame'; readonly id: CategoryId; readonly points: number }
  /** Sum of all five dice, unconditionally. */
  | { readonly kind: 'sumAll'; readonly id: CategoryId };

export interface UpperBonus {
  /** Upper-section subtotal needed to earn the bonus. */
  readonly threshold: number;
  readonly points: number;
}

export interface Ruleset {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly categories: readonly CategoryRule[];
  readonly upperBonus: UpperBonus;
  /** Points per additional Yahtzee after the first. `null` disables the rule. */
  readonly yahtzeeBonus: number | null;
}

/** A filled-in slot on a player's scorecard. */
export interface ScoredCategory {
  readonly categoryId: CategoryId;
  readonly roll: Roll;
  readonly score: number;
}

export interface ScorecardTotals {
  readonly upperSubtotal: number;
  readonly upperBonus: number;
  readonly lowerSubtotal: number;
  readonly yahtzeeBonus: number;
  readonly grandTotal: number;
}
