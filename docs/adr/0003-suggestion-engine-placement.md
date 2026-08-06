# ADR-3: Where the suggestion engine runs

Status: proposed
Date: 2026-07-31

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

## Decision

_Pending._

## The question that actually decides it

Is the suggestion *advisory* or *authoritative*?

If it only advises the scorekeeper where to allocate a roll, the trust boundary
doesn't matter and the browser wins on every axis. If the recorded score is ever
derived from it, the server must validate regardless — because a score the
client can alter is not a score you can build historical reporting on.

Answer that first; the deployment choice falls out of it.
