# Architecture Decision Records

An Architecture Decision Record captures one significant technical decision: what
forced it, which options were weighed, what was chosen, and what that choice
costs. Source code records what was decided but never why, and never what was
rejected — so without this, a deliberate constraint becomes indistinguishable
from an accident, and gets "cleaned up" by someone who wasn't there.

Records are append-only. An accepted ADR is not edited when the decision changes;
a new one is written and the old is marked `superseded by ADR-N`. The point is the
historical record of what was believed at the time, wrong turns included.

One file per decision that had a real tradeoff. Short is fine — half a page beats
nothing. The value is in recording what was given up, not in justifying what was
picked.

Format:

```
# ADR-N: <decision>

Status: proposed | accepted | superseded by ADR-M
Date: YYYY-MM-DD
Supersedes: ADR-K          (only on a record that replaces an earlier one)

## Context
What forced a decision. Constraints, scale, cost, deadline.

## Options considered
Each with its actual cost, not a strawman.

## Decision
What you picked.

## Consequences
What this makes easy. What it makes hard. What would make you revisit it.
```

An ADR is written when a decision has a real tradeoff, and is left at `proposed`
until there is enough evidence to resolve it honestly.
