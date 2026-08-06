import type {
  CategoryId,
  CategoryRule,
  Die,
  Roll,
  Ruleset,
  ScoredCategory,
  ScorecardTotals,
} from './types.js';

const FACES: readonly Die[] = [1, 2, 3, 4, 5, 6];

/**
 * Compile-time exhaustiveness check.
 *
 * Adding a new `kind` to `CategoryRule` without handling it in the switches
 * below stops compilation here — the unhandled member is no longer assignable
 * to `never`. That turns a missing case into a build failure rather than a
 * wrong score.
 *
 * Exported because `suggest.ts` switches over the same union. Not part of the
 * package's public API: it is a language utility, not a scoring concept.
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled variant: ${JSON.stringify(value)}`);
}

/** How many of each face are showing. Exported for direct testing. */
export function faceCounts(roll: Roll): ReadonlyMap<Die, number> {
  const counts = new Map<Die, number>();
  for (const die of roll) {
    counts.set(die, (counts.get(die) ?? 0) + 1);
  }
  return counts;
}

function sumAll(roll: Roll): number {
  return roll.reduce<number>((total, die) => total + die, 0);
}

/** Whether any single face appears at least `n` times. */
function hasNOfAKind(counts: ReadonlyMap<Die, number>, n: number): boolean {
  return [...counts.values()].some((count) => count >= n);
}

/**
 * Score a single roll against a single category rule.
 *
 * `CategoryRule` is a discriminated union keyed on `kind`, so `rule` narrows
 * inside each branch: in `case 'sumOfFace'` the compiler knows `rule.face`
 * exists, and in `case 'straight'` it knows `rule.length` does. No branch needs
 * to check whether a field is present.
 *
 * `test/score.test.ts` is the spec for every case below.
 */
export function scoreCategory(rule: CategoryRule, roll: Roll): number {
  const counts = faceCounts(roll);

  switch (rule.kind) {
    /** Sum of only the dice showing `rule.face`. */
    case 'sumOfFace':
      return roll.reduce<number>(
        (total, die) => (die === rule.face ? total + die : total),
        0,
      );

    /** Sum of every die, unconditionally. */
    case 'sumAll':
      return sumAll(roll);

    /** Sum of ALL five dice if any face appears >= rule.n times, else 0. */
    case 'nOfAKind':
      return hasNOfAKind(counts, rule.n) ? sumAll(roll) : 0;

    /** rule.points if the counts are exactly {3, 2}, else 0. Watch the edge case. */
    case 'fullHouse':
      return counts.size === 2 && [...counts.values()].includes(3) ? rule.points : 0;

    /** rule.points if rule.length distinct consecutive faces are present, else 0. */
    case 'straight':
      for (let start = 0; start + rule.length <= FACES.length; start++) {
        const run = FACES.slice(start, start + rule.length);
        if (run.every((face) => counts.has(face))) return rule.points;
      }
      return 0;

    /** rule.points if all five dice match, else 0. */
    case 'allSame':
      return counts.size === 1 ? rule.points : 0;

    default:
      return assertNever(rule);
  }
}

/**
 * Roll up a completed (or partial) scorecard.
 *
 * Upper subtotal is the six `sumOfFace` categories. The bonus applies when that
 * subtotal reaches `ruleset.upperBonus.threshold`. Yahtzee bonus is
 * `ruleset.yahtzeeBonus` for each Yahtzee *after* the first — and is `null`
 * when the variant doesn't use it, which is why the field is nullable rather
 * than defaulting to 0.
 */
export function computeTotals(
  ruleset: Ruleset,
  scored: readonly ScoredCategory[],
): ScorecardTotals {
  // Which categories are "upper" is derived from the ruleset, not hardcoded:
  // the upper section is exactly the `sumOfFace` rules. A variant with
  // different upper categories therefore needs no change here.
  const upperIds = new Set<CategoryId>(
    ruleset.categories
      .filter((rule) => rule.kind === 'sumOfFace')
      .map((rule) => rule.id),
  );

  let upperSubtotal = 0;
  let lowerSubtotal = 0;
  for (const entry of scored) {
    if (upperIds.has(entry.categoryId)) {
      upperSubtotal += entry.score;
    } else {
      lowerSubtotal += entry.score;
    }
  }

  const upperBonus =
    upperSubtotal >= ruleset.upperBonus.threshold
      ? ruleset.upperBonus.points
      : 0;

  const yahtzeeBonus = yahtzeeBonusFor(ruleset, scored);

  return {
    upperSubtotal,
    upperBonus,
    lowerSubtotal,
    yahtzeeBonus,
    grandTotal: upperSubtotal + upperBonus + lowerSubtotal + yahtzeeBonus,
  };
}

/**
 * Bonus for every five-of-a-kind roll after the first.
 *
 * Implements standard Yahtzee, pinned by the `yahtzee bonus` block in
 * `test/score.test.ts`:
 *
 *   1. The bonus only applies if the Yahtzee category itself scored above zero.
 *      Scratching Yahtzee forfeits all later bonuses.
 *   2. Any recorded roll of five-of-a-kind counts, whichever category it was
 *      placed in — that is what makes joker rules work.
 *
 * The group plays a variant, so expect this to change. When it does, prefer
 * extending `Ruleset` so the difference is expressible as data; fall back to
 * editing this function only if the variant needs a genuinely different shape
 * of rule rather than a different number.
 */
function yahtzeeBonusFor(
  ruleset: Ruleset,
  scored: readonly ScoredCategory[],
): number {
  if (ruleset.yahtzeeBonus === null) return 0;

  const yahtzeeRule = ruleset.categories.find((rule) => rule.kind === 'allSame');
  if (yahtzeeRule === undefined) return 0;

  const primary = scored.find((entry) => entry.categoryId === yahtzeeRule.id);
  if (primary === undefined || primary.score === 0) return 0;

  const fiveOfAKindRolls = scored.filter(
    (entry) => faceCounts(entry.roll).size === 1,
  ).length;

  return Math.max(0, fiveOfAKindRolls - 1) * ruleset.yahtzeeBonus;
}