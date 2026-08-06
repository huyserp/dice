import { describe, expect, it } from 'vitest';
import {
  computeTotals,
  faceCounts,
  scoreCategory,
} from '../src/score.js';
import { STANDARD_YAHTZEE } from '../src/rulesets.js';
import type {
  CategoryId,
  CategoryRule,
  Roll,
  Ruleset,
  ScoredCategory,
} from '../src/types.js';

/**
 * The executable spec for `score.ts`.
 *
 * Rules are stated here as expectations before they are implemented, so a
 * disagreement between an intuition about the rules and the code shows up as a
 * failing test rather than as a wrong scorecard. The edge cases carry a comment
 * explaining why the expected value is what it is.
 */

function rule(id: CategoryId): CategoryRule {
  const found = STANDARD_YAHTZEE.categories.find((c) => c.id === id);
  if (!found) throw new Error(`No rule for category: ${id}`);
  return found;
}

describe('faceCounts', () => {
  it('counts each face', () => {
    const counts = faceCounts([3, 3, 5, 1, 3]);
    expect(counts.get(3)).toBe(3);
    expect(counts.get(5)).toBe(1);
    expect(counts.get(1)).toBe(1);
    expect(counts.get(6)).toBeUndefined();
  });
});

describe('upper section — sumOfFace', () => {
  it('sums only the matching face', () => {
    expect(scoreCategory(rule('fours'), [4, 4, 4, 2, 1])).toBe(12);
  });

  it('scores zero when the face is absent', () => {
    expect(scoreCategory(rule('sixes'), [1, 2, 3, 4, 5])).toBe(0);
  });

  it('handles all five matching', () => {
    expect(scoreCategory(rule('twos'), [2, 2, 2, 2, 2])).toBe(10);
  });
});

describe('chance — sumAll', () => {
  it('always sums every die', () => {
    expect(scoreCategory(rule('chance'), [1, 2, 3, 4, 5])).toBe(15);
    expect(scoreCategory(rule('chance'), [6, 6, 6, 6, 6])).toBe(30);
  });
});

describe('nOfAKind', () => {
  it('three of a kind scores the sum of ALL dice, not just the triple', () => {
    expect(scoreCategory(rule('threeOfAKind'), [5, 5, 5, 2, 1])).toBe(18);
  });

  it('four of a kind also satisfies three of a kind', () => {
    expect(scoreCategory(rule('threeOfAKind'), [3, 3, 3, 3, 6])).toBe(18);
  });

  it('scores zero without enough matching dice', () => {
    expect(scoreCategory(rule('threeOfAKind'), [5, 5, 4, 2, 1])).toBe(0);
    expect(scoreCategory(rule('fourOfAKind'), [5, 5, 5, 2, 1])).toBe(0);
  });

  it('five of a kind satisfies four of a kind', () => {
    expect(scoreCategory(rule('fourOfAKind'), [2, 2, 2, 2, 2])).toBe(10);
  });
});

describe('fullHouse', () => {
  it('scores 25 for a 3+2 split', () => {
    expect(scoreCategory(rule('fullHouse'), [3, 3, 3, 5, 5])).toBe(25);
  });

  it('scores zero for 4+1', () => {
    expect(scoreCategory(rule('fullHouse'), [3, 3, 3, 3, 5])).toBe(0);
  });

  it('scores zero for two pair plus a single', () => {
    expect(scoreCategory(rule('fullHouse'), [3, 3, 5, 5, 1])).toBe(0);
  });

  // The edge case worth thinking about: five of a kind is arguably {5} not
  // {3,2}. Standard rules say this is NOT a full house on its own merits.
  it('scores zero for five of a kind', () => {
    expect(scoreCategory(rule('fullHouse'), [4, 4, 4, 4, 4])).toBe(0);
  });
});

describe('straights', () => {
  it('small straight needs four consecutive distinct faces', () => {
    expect(scoreCategory(rule('smallStraight'), [1, 2, 3, 4, 4])).toBe(30);
    expect(scoreCategory(rule('smallStraight'), [2, 3, 4, 5, 1])).toBe(30);
    expect(scoreCategory(rule('smallStraight'), [3, 4, 5, 6, 6])).toBe(30);
  });

  it('duplicates do not break a straight', () => {
    expect(scoreCategory(rule('smallStraight'), [2, 2, 3, 4, 5])).toBe(30);
  });

  it('gaps do break a straight', () => {
    expect(scoreCategory(rule('smallStraight'), [1, 2, 4, 5, 6])).toBe(0);
  });

  it('a large straight also contains a small straight', () => {
    expect(scoreCategory(rule('smallStraight'), [1, 2, 3, 4, 5])).toBe(30);
  });

  it('large straight needs all five consecutive', () => {
    expect(scoreCategory(rule('largeStraight'), [1, 2, 3, 4, 5])).toBe(40);
    expect(scoreCategory(rule('largeStraight'), [2, 3, 4, 5, 6])).toBe(40);
    expect(scoreCategory(rule('largeStraight'), [1, 2, 3, 4, 6])).toBe(0);
  });
});

describe('yahtzee — allSame', () => {
  it('scores 50 for five of a kind', () => {
    expect(scoreCategory(rule('yahtzee'), [6, 6, 6, 6, 6])).toBe(50);
  });

  it('scores zero otherwise', () => {
    expect(scoreCategory(rule('yahtzee'), [6, 6, 6, 6, 5])).toBe(0);
  });
});

describe('computeTotals', () => {
  const scoredCard = (
    entries: ReadonlyArray<[CategoryId, number, Roll]>,
  ): ScoredCategory[] =>
    entries.map(([categoryId, score, roll]) => ({ categoryId, score, roll }));

  it('applies the upper bonus at the threshold', () => {
    // 3+6+9+12+15+18 = 63, exactly the threshold.
    const card = scoredCard([
      ['ones', 3, [1, 1, 1, 4, 5]],
      ['twos', 6, [2, 2, 2, 4, 5]],
      ['threes', 9, [3, 3, 3, 4, 5]],
      ['fours', 12, [4, 4, 4, 1, 5]],
      ['fives', 15, [5, 5, 5, 1, 2]],
      ['sixes', 18, [6, 6, 6, 1, 2]],
    ]);

    const totals = computeTotals(STANDARD_YAHTZEE, card);
    expect(totals.upperSubtotal).toBe(63);
    expect(totals.upperBonus).toBe(35);
    expect(totals.grandTotal).toBe(98);
  });

  it('withholds the upper bonus one point short', () => {
    const card = scoredCard([
      ['ones', 3, [1, 1, 1, 4, 5]],
      ['twos', 6, [2, 2, 2, 4, 5]],
      ['threes', 9, [3, 3, 3, 4, 5]],
      ['fours', 12, [4, 4, 4, 1, 5]],
      ['fives', 15, [5, 5, 5, 1, 2]],
      ['sixes', 17, [6, 6, 1, 2, 3]], // 62 total
    ]);

    const totals = computeTotals(STANDARD_YAHTZEE, card);
    expect(totals.upperSubtotal).toBe(62);
    expect(totals.upperBonus).toBe(0);
  });

  it('separates lower section from upper', () => {
    const card = scoredCard([
      ['ones', 3, [1, 1, 1, 4, 5]],
      ['fullHouse', 25, [3, 3, 3, 5, 5]],
      ['chance', 20, [6, 6, 4, 2, 2]],
    ]);

    const totals = computeTotals(STANDARD_YAHTZEE, card);
    expect(totals.upperSubtotal).toBe(3);
    expect(totals.lowerSubtotal).toBe(45);
    expect(totals.grandTotal).toBe(48);
  });

  it('handles an empty scorecard', () => {
    const totals = computeTotals(STANDARD_YAHTZEE, []);
    expect(totals.grandTotal).toBe(0);
    expect(totals.upperBonus).toBe(0);
  });
});

/**
 * Standard Yahtzee bonus rules, pinned deliberately.
 *
 * The group plays a variant and these may well change. When they do, the tests
 * that fail here are exactly the rules that differ — which is the point of
 * writing them down before the variant arrives rather than after.
 *
 * Standard rules, as implemented:
 *   1. 100 points for every five-of-a-kind AFTER the first.
 *   2. Nothing at all if the Yahtzee box itself was scratched (scored zero).
 *   3. A five-of-a-kind counts wherever it was recorded, not only in the
 *      Yahtzee box — this is what makes joker rules work.
 */
describe('yahtzee bonus', () => {
  const YAHTZEE_ROLL: Roll = [6, 6, 6, 6, 6];

  it('pays nothing for the first yahtzee', () => {
    const totals = computeTotals(STANDARD_YAHTZEE, [
      { categoryId: 'yahtzee', score: 50, roll: YAHTZEE_ROLL },
    ]);

    expect(totals.yahtzeeBonus).toBe(0);
    expect(totals.grandTotal).toBe(50);
  });

  it('pays 100 for a second yahtzee recorded elsewhere', () => {
    const totals = computeTotals(STANDARD_YAHTZEE, [
      { categoryId: 'yahtzee', score: 50, roll: YAHTZEE_ROLL },
      { categoryId: 'sixes', score: 30, roll: YAHTZEE_ROLL },
    ]);

    expect(totals.yahtzeeBonus).toBe(100);
    // 30 upper + 0 upper bonus + 50 lower + 100 yahtzee bonus
    expect(totals.grandTotal).toBe(180);
  });

  it('pays per additional yahtzee, not per yahtzee', () => {
    const totals = computeTotals(STANDARD_YAHTZEE, [
      { categoryId: 'yahtzee', score: 50, roll: YAHTZEE_ROLL },
      { categoryId: 'sixes', score: 30, roll: YAHTZEE_ROLL },
      { categoryId: 'threeOfAKind', score: 30, roll: YAHTZEE_ROLL },
    ]);

    expect(totals.yahtzeeBonus).toBe(200);
  });

  it('pays nothing when the yahtzee box was scratched', () => {
    const totals = computeTotals(STANDARD_YAHTZEE, [
      { categoryId: 'yahtzee', score: 0, roll: [1, 2, 3, 4, 5] },
      { categoryId: 'sixes', score: 30, roll: YAHTZEE_ROLL },
    ]);

    expect(totals.yahtzeeBonus).toBe(0);
    expect(totals.grandTotal).toBe(30);
  });

  it('pays nothing before the yahtzee box is filled at all', () => {
    const totals = computeTotals(STANDARD_YAHTZEE, [
      { categoryId: 'sixes', score: 30, roll: YAHTZEE_ROLL },
    ]);

    expect(totals.yahtzeeBonus).toBe(0);
  });

  it('is disabled entirely by a ruleset with a null bonus', () => {
    const noBonus: Ruleset = { ...STANDARD_YAHTZEE, yahtzeeBonus: null };

    const totals = computeTotals(noBonus, [
      { categoryId: 'yahtzee', score: 50, roll: YAHTZEE_ROLL },
      { categoryId: 'sixes', score: 30, roll: YAHTZEE_ROLL },
    ]);

    expect(totals.yahtzeeBonus).toBe(0);
    expect(totals.grandTotal).toBe(80);
  });
});
