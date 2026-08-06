import type { Ruleset } from './types.js';

/**
 * Standard Yahtzee. This is a *value*, not code — the group's house rules
 * become a second export here (and a row in `rulesets`) rather than an edit to
 * this one. Bump `version` on any change to a shipped ruleset, so historical
 * games stay reproducible.
 */
export const STANDARD_YAHTZEE: Ruleset = {
  id: 'standard-yahtzee',
  name: 'Standard Yahtzee',
  version: 1,
  categories: [
    { kind: 'sumOfFace', id: 'ones', face: 1 },
    { kind: 'sumOfFace', id: 'twos', face: 2 },
    { kind: 'sumOfFace', id: 'threes', face: 3 },
    { kind: 'sumOfFace', id: 'fours', face: 4 },
    { kind: 'sumOfFace', id: 'fives', face: 5 },
    { kind: 'sumOfFace', id: 'sixes', face: 6 },
    { kind: 'nOfAKind', id: 'threeOfAKind', n: 3 },
    { kind: 'nOfAKind', id: 'fourOfAKind', n: 4 },
    { kind: 'fullHouse', id: 'fullHouse', points: 25 },
    { kind: 'straight', id: 'smallStraight', length: 4, points: 30 },
    { kind: 'straight', id: 'largeStraight', length: 5, points: 40 },
    { kind: 'allSame', id: 'yahtzee', points: 50 },
    { kind: 'sumAll', id: 'chance' },
  ],
  upperBonus: { threshold: 63, points: 35 },
  yahtzeeBonus: 100,
} as const;

export const UPPER_CATEGORY_IDS = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
] as const;
