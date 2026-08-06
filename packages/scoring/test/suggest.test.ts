import { describe, expect, it } from 'vitest';
import { suggest, UnknownCategoryError } from '../src/suggest.js';
import { STANDARD_YAHTZEE } from '../src/rulesets.js';
import type { CategoryId } from '../src/types.js';

const ALL_CATEGORIES: readonly CategoryId[] = STANDARD_YAHTZEE.categories.map(
  (rule) => rule.id,
);

describe('suggest', () => {
  it('ranks a perfect fit above a merely large score', () => {
    // 30 in a small straight is the whole category; 15 in chance is half of it.
    const [best] = suggest(STANDARD_YAHTZEE, [1, 2, 3, 4, 5], ALL_CATEGORIES);

    expect(best?.categoryId).toBe('largeStraight');
    expect(best?.efficiency).toBe(1);
  });

  it('breaks ties on efficiency by raw score', () => {
    // Five sixes maxes out yahtzee, sixes, both n-of-a-kinds and chance —
    // all at efficiency 1. The highest-scoring of them should come first.
    const ranked = suggest(STANDARD_YAHTZEE, [6, 6, 6, 6, 6], ALL_CATEGORIES);
    const perfect = ranked.filter((s) => s.efficiency === 1);

    expect(perfect.length).toBeGreaterThan(1);
    expect(perfect[0]?.categoryId).toBe('yahtzee');
    expect(perfect[0]?.score).toBe(50);
  });

  it('only considers open categories', () => {
    const ranked = suggest(STANDARD_YAHTZEE, [1, 2, 3, 4, 5], [
      'chance',
      'ones',
    ]);

    expect(ranked.map((s) => s.categoryId)).toEqual(['chance', 'ones']);
  });

  it('throws on category ids the ruleset does not define', () => {
    // Reaching here with an unknown id means the parse boundary upstream is
    // broken. Failing loudly is the point — a shorter list would hide the bug.
    expect(() =>
      suggest(STANDARD_YAHTZEE, [1, 2, 3, 4, 5], [
        'chance',
        'notARealCategory' as CategoryId,
      ]),
    ).toThrow(UnknownCategoryError);
  });

  it('names the offending categories in the error', () => {
    expect(() =>
      suggest(STANDARD_YAHTZEE, [1, 2, 3, 4, 5], [
        'nope' as CategoryId,
        'alsoNope' as CategoryId,
      ]),
    ).toThrow(/nope, alsoNope/);
  });

  it('still returns categories that score zero, ranked last', () => {
    // No five-of-a-kind here, so yahtzee is a scratch — but it must remain a
    // visible option, because sometimes scratching is the correct move.
    const ranked = suggest(STANDARD_YAHTZEE, [1, 2, 3, 4, 5], [
      'yahtzee',
      'chance',
    ]);

    expect(ranked.map((s) => s.categoryId)).toEqual(['chance', 'yahtzee']);
    expect(ranked[1]?.score).toBe(0);
  });

  it('returns an empty list when nothing is open', () => {
    expect(suggest(STANDARD_YAHTZEE, [1, 2, 3, 4, 5], [])).toEqual([]);
  });
});
