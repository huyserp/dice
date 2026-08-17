# ADR-3: Where the suggestion engine runs

Status: accepted
Date: 2026-07-31 (decided 2026-08-14)

## Context

`packages/scoring` is pure TypeScript with no I/O, so it runs unchanged in a
Lambda or in the browser. That's a deliberate property of the package — and it
means the deployment location is a genuine choice rather than a constraint.

## Options considered

**Server-side (Lambda).** Logic stays authoritative and unmodifiable by the
client; one place to fix a rules bug. Costs: a network round trip on every
suggestion, cold-start latency on the first call, and per-invocation billing on
what is a pure function.

**Client-side (browser).** Instant, free, works while the connection hiccups.
Costs: the rules ship to the client, so a determined player could inspect or
tamper with them; and a rules fix requires a frontend deploy.

**Both.** Client computes for responsiveness, server validates on submit.
Costs: two call sites to keep consistent — though shared code makes divergence
unlikely.

## The question that actually decides it

Is the suggestion *advisory* or *authoritative*?

If it only advises the scorekeeper where to allocate a roll, the trust boundary
doesn't matter and the browser wins on every axis. If the recorded score is ever
derived from it, the server must validate regardless — because a score the
client can alter is not a score you can build historical reporting on.

Answer that first; the deployment choice falls out of it.

## Decision

**Client-side.** The suggestion is advisory: it ranks open categories for a roll,
and the scorekeeper allocates the points wherever they like, including against
the suggestion. Nothing recorded is derived from it.

This is not the "both" option. The server is not duplicating the suggestion —
it scores the category the scorekeeper actually chose, which is a different
operation that happens to call the same module. `packages/scoring` stays the
single source of truth for both, and neither call site reimplements the other.

## Consequences

**The rules ship to the browser, and that is fine here.** A player could read or
tamper with the suggestion logic. Doing so changes only the advice they are
shown, not any recorded score — the server computes that independently from the
category and dice submitted. Tampering with a hint you were free to ignore is
not an attack.

**A rules fix requires a frontend deploy.** The scoring engine is consumed by
both the Lambda and the browser bundle, so correcting a rule means shipping both.
That is a real cost of putting logic on the client, and it is bounded by the
rules being data (`Ruleset` objects) rather than code — the common case of adding
the group's house variant is a configuration row, not a redeploy of either side.

**It keeps working while the database is asleep.** Suggestions are pure
computation over dice already in hand, so they need no network call at all. Given
[ADR-4](0004-zero-idle-cost-inside-a-vpc.md) accepts a resume delay of 30 seconds
or more on the first request of a session, having the most interactive part of
the UI stay responsive throughout is a larger benefit here than it would be on a
conventional always-warm stack.

**No per-invocation cost for a pure function.** Ranking categories is
milliseconds of arithmetic. Paying Lambda invocation and a network round trip for
it would be paying for nothing.

**What would make us revisit this.** A scored mode where the suggestion is
binding — a solitaire or timed variant where the app allocates automatically.
That makes the suggestion authoritative, and it would have to move server-side or
be validated there.
