# ADR-4: Designing for zero idle cost

Status: accepted
Date: 2026-08-11
Supersedes: ADR-2

## Context

This system is played a few evenings a month by around twenty people. Between
sessions it has no users at all. Its cost should approach zero when idle, and the
architecture as originally sketched does not — two components bill by the hour
regardless of traffic:

| Component | Idle cost | Why it bills while idle |
|---|---|---|
| NAT Gateway | ~$32/month | Charged per hour of existence, plus data processed |
| Aurora Serverless v2 at 0.5 ACU minimum | ~$43/month | Minimum capacity runs continuously |

That is roughly $75/month for an application serving nobody. Everything else in
the stack — Lambda, API Gateway, S3, CloudFront, DynamoDB, EventBridge — is
priced per request and rounds to zero at this volume.

The NAT Gateway is not in the design because anyone wanted it. It appears because
Lambda functions placed inside a VPC to reach Aurora lose their default route to
the internet, and need a NAT Gateway to reach any AWS service without a VPC
endpoint. It is a second-order consequence of the database being VPC-bound.

## Options considered

**Accept the floor.** Deploy the conventional design and pay ~$75/month.
Defensible for a system with real users and an availability target. Here it means
paying for a database that is idle more than 95% of the time, and the cost is
permanent rather than proportional to anything.

**Keep Lambda in the VPC, replace NAT with VPC interface endpoints.** Removes the
NAT Gateway but interface endpoints bill hourly too, at roughly $7.20/month each.
Needing three or four of them recreates most of the cost with more moving parts.
Gateway endpoints for S3 and DynamoDB are free, but do not cover the rest.

**RDS Data API, with Lambda outside the VPC entirely.** Aurora exposes an HTTPS
endpoint; Lambda calls it as an ordinary AWS API with IAM authentication and
credentials in Secrets Manager. No VPC attachment, therefore no NAT Gateway and
no interface endpoints. Also removes the ENI cold-start penalty that VPC-attached
Lambdas pay. Costs: an extra network hop, and the Data API's own constraints on
result size and SQL surface.

**Aurora minimum capacity of 0 ACU (auto-pause).** The cluster pauses after a
configurable idle interval and bills no instance capacity while paused — storage
only, which is pennies at this data volume. Costs: the first request after a
pause waits for the cluster to resume.

**RDS Proxy.** Considered and rejected in ADR-2 as the conventional answer to
Lambda connection exhaustion. It is now excluded outright rather than merely
unnecessary: an attached RDS Proxy holds an open connection to every instance in
the cluster, which prevents auto-pause from ever engaging. It is also redundant
under the Data API, which manages connections service-side.

## Decision

Design for a zero idle floor:

1. **Aurora Serverless v2 with `MinCapacity = 0`** and an auto-pause interval.
2. **RDS Data API enabled**, with **Lambda outside the VPC**.
3. **No NAT Gateway, no RDS Proxy.**

This resolves the question ADR-2 left open, though not on the grounds ADR-2
anticipated. ADR-2 expected to decide between scale-to-zero and RDS Proxy against
a load test measuring where the connection limit binds. That measurement is no
longer the deciding factor: at twenty users the connection limit was never going
to bind, and the Data API removes connection management from the application
entirely. The decision is made on cost and usage shape instead.

## Consequences

**The first request of a session is slow, and slower than the usual figure.** AWS
documents a typical resume of ~15 seconds. But a cluster paused for more than 24
hours enters a deeper sleep with a resume time of **30 seconds or more**. Given
this system idles for days or weeks between sessions, the 30-second case is the
normal case here, not the exception. The 15-second figure quoted in most write-ups
does not apply to this workload.

Two things follow. Client and Lambda timeouts must exceed 30 seconds, or the first
request of every session fails. And the resume should be paid somewhere it does
not hurt: creating a game is the scorekeeper's first action and happens before
anyone is waiting on a turn, so that request should absorb the wake-up behind
visible progress in the UI rather than a spinner that looks broken.

**Connection retry logic is mandatory, not defensive.** AWS explicitly recommends
retrying, since requests arriving while a cluster is mid-resume can fail.

**Engine version is constrained.** Auto-pause requires Aurora MySQL 3.08.0 or
higher; the Data API requires 3.07 or higher. 3.08+ satisfies both, and the
version must be pinned in CDK rather than left to a default.

**Several features become unavailable**, because each prevents auto-pause: RDS
Proxy, binlog replication, zero-ETL integration to Redshift, and Aurora Global
Database. None are wanted here, but adding any one of them silently disables
pausing — no error, just a bill that stops going to zero. Whoever adds one needs
to know that.

**The MySQL event scheduler will not run reliably.** Aurora does not wake a paused
instance for scheduled jobs, and cancels in-flight ones when pausing. Anything
periodic must be an EventBridge rule invoking a Lambda, which is where this
architecture would have put it anyway.

**Storage still bills while paused.** "Zero" means zero compute, not zero.

**The Data API's limits are not yet fully characterised.** It caps result set
size, does not expose the full MySQL protocol, and adds latency versus a direct
connection. None of these are expected to bind on a scorecard-sized workload, but
they have not been verified against the real queries — particularly the historical
reporting in M5, which is the most likely place to hit a result-size limit.
Verify before building on it. If a reporting query does exceed the limits, the
fallback is a VPC-attached Lambda for that path alone, which reintroduces a
private-subnet route but not necessarily a NAT Gateway.

**Region availability should be confirmed at bootstrap.** Both the Data API and
0-ACU auto-pause are region-gated. `us-east-2` is expected to support both; it
has not been checked directly and is a pre-flight item, not an assumption to
deploy on.

**What would make us revisit this.** Real users with a latency expectation, or
sessions frequent enough that the cluster rarely pauses — at which point the
saving disappears and a warm minimum capacity costs little more. The trigger to
watch is the `ServerlessDatabaseCapacity` metric: if it is rarely zero, this
decision has stopped paying for itself.
