# ADR-2: Aurora scale-to-zero vs. RDS Proxy

Status: superseded by ADR-4
Date: 2026-07-31

## Context

Lambda scales by adding concurrent execution environments, each opening its own
database connection. Aurora has a finite connection limit. Under any real
concurrency, connections are exhausted long before compute is.

The standard fix is **RDS Proxy**: it maintains a warm pool and multiplexes
Lambda connections onto it.

Separately, Aurora Serverless v2 supports a **0 ACU minimum**, pausing compute
when there are no active connections — which for a game played a few evenings a
month means compute cost near zero.

These two conflict directly. RDS Proxy keeps connections warm. Scale-to-zero
requires that nothing is holding a connection. **You cannot have both.**

## Options considered

**Scale-to-zero, no proxy.** Cheapest by a wide margin — storage only between
sessions. Costs: the first request of an evening pays a resume delay while the
cluster wakes, which lands on a real player waiting at a real table, and nothing
protects the connection limit if concurrency ever rises.

**RDS Proxy, warm minimum capacity.** Consistent low latency, survives
concurrency spikes, and the connection-pooling behaviour is what production
systems actually run. Costs: the cluster never pauses, so you pay ACU-hours
around the clock plus the Proxy itself.

**Neither, for now.** At this application's real concurrency — one scorekeeper
writing — a handful of connections is genuinely enough. Deferring is defensible,
but only if recorded explicitly rather than reached by omission.

## Decision

_Never recorded here. Superseded by ADR-4, which decided the question on cost and
usage shape rather than on the load-test measurement this ADR was waiting for._

## Consequences

_See ADR-4._

## Note

The reflex is to reach for RDS Proxy because it is the recognised production
answer to Lambda connection exhaustion. At one writer's worth of concurrency,
that reflex buys insurance against a problem this workload does not have, and
pays for it with the single largest cost saving available — a cluster that bills
storage only between sessions a few evenings a month.

Whichever way this resolves, it should resolve against a measurement. The load
test in M4 exists to produce that number.
