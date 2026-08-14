# ADR-4: Zero idle cost without dropping the network boundary

Status: accepted
Date: 2026-08-14
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

That framing suggests an obvious escape: stop being VPC-bound. Aurora's RDS Data
API exposes the database over an ordinary HTTPS endpoint, so Lambda can leave the
VPC entirely and the NAT Gateway disappears with it. The escape is real, and it
has a price that is easy to miss — which is what makes this a decision rather
than an optimisation.

Databases conventionally sit behind two independent controls:

| Control | Question it answers | Built from | How it fails |
|---|---|---|---|
| Network | Can packets reach it at all? | VPC, subnets, security groups | Loudly — connection timeout |
| Identity | Is this caller permitted? | IAM, database grants | `AccessDenied` |

Leaving the VPC removes the first one. Not obviously fatal — DynamoDB, S3 and
EventBridge are all in this stack already and all rely on IAM alone, so a
single-control data store is not per se wrong. But a wildcard `rds-data` grant
that slips into any role in the account then reaches the whole database from
anywhere on the internet, where the same mistake behind a VPC reaches nothing.
Identity mistakes are silent — an over-broad policy passes every test — while
network mistakes announce themselves immediately.

The question is therefore not "how do we get to zero" but **"how close to zero
can we get without spending the second control to do it."**

## Options considered

**Accept the floor.** Deploy the conventional design and pay ~$75/month.
Defensible for a system with real users and an availability target. Here it means
paying for a database that is idle more than 95% of the time, at a cost that is
permanent rather than proportional to anything.

**RDS Data API, with Lambda outside the VPC.** Removes the NAT Gateway and the
need for any interface endpoints, and manages connections service-side. Rejected
for three reasons, in ascending order of weight:

1. The Data API's constraints are uncharacterised for this workload. It caps
   result set size and does not expose the full MySQL protocol. The historical
   reporting in M5 is the most likely place to hit that ceiling, and discovering
   it there means rewriting the data access layer late.
2. It has no local equivalent. Development would run against a shim — one code
   path locally, a different one in production — which puts the divergence
   exactly where database bugs live.
3. It spends the network control, as set out above, to buy roughly $7/month.

**Keep Lambda in the VPC, replace NAT with VPC interface endpoints.** Interface
endpoints bill hourly too, at $0.01/hour *per availability zone* — ~$7.30/month
for one AZ. The cost is therefore proportional to how many services the
VPC-attached functions actually call, which is a number under this design's
control rather than a given. Chosen; see below for how that number was reduced
to one.

**Aurora minimum capacity of 0 ACU (auto-pause).** The cluster pauses after a
configurable idle interval and bills no instance capacity while paused — storage
only. Independent of the VPC question: auto-pause keys on the absence of database
*connections*, not on how those connections are made, so it composes with either
network design. Costs: the first request after a pause waits for a resume.

**IAM database authentication instead of a stored password.** Aurora MySQL can
authenticate connections with a short-lived token in place of a password. The
token is produced by signing locally with SigV4 — no API call — so it needs
neither a Secrets Manager endpoint nor an STS endpoint. Removes a stored
credential, a ~$0.40/month secret, and a ~$7.30/month endpoint at once.

**RDS Proxy.** Considered and rejected in ADR-2 as the conventional answer to
Lambda connection exhaustion. It is now excluded outright rather than merely
unnecessary: an attached RDS Proxy holds an open connection to every instance in
the cluster, which prevents auto-pause from ever engaging.

## Decision

Keep both controls, and get the idle cost down by removing hourly billing rather
than by removing the VPC.

1. **Aurora Serverless v2 with `MinCapacity = 0`** and an auto-pause interval.
2. **Lambda inside the VPC**, in private subnets, connecting directly to Aurora
   over TLS with `mysql2`.
3. **IAM database authentication.** No stored password, no Secrets Manager.
4. **No NAT Gateway.** Private subnets have no route to the internet at all.
5. **VPC membership is per-function, not per-stack** — see below.
6. **No RDS Proxy.**

### Only database-touching functions join the VPC

VPC attachment is configured per Lambda, and the cost of attachment is losing
default internet access. Only the functions that talk to Aurora need to pay it:

| Function | In VPC? | Why |
|---|---|---|
| API handlers (turns, games) | **Yes** | Query Aurora |
| Stats projection | **Yes** | Rebuilds `player_stats` from `turns` |
| WebSocket broadcast | No | DynamoDB + `PostToConnection` only |
| WebSocket authorizer | No | Fetches Cognito JWKS over the internet |

Keeping the authorizer and broadcast functions outside the VPC means neither
needs a Cognito nor an API Gateway Management endpoint, which is what holds the
interface endpoint count at one.

### What the VPC-attached functions still need to reach

| Destination | Mechanism | Cost |
|---|---|---|
| Aurora | In-VPC routing | free |
| CloudWatch Logs | Lambda's own log delivery, not the function's ENI | free |
| S3, DynamoDB | Gateway endpoints | free |
| EventBridge (`PutEvents`) | **Interface endpoint** | ~$7.30/month |

Only the outbound `PutEvents` call from the turn handler requires an interface
endpoint. Inbound invocation *by* EventBridge does not — that is the service
invoking Lambda, not Lambda calling the service.

### Resulting idle cost

| Item | Idle cost |
|---|---|
| Aurora storage (10 GB minimum) | ~$1/month |
| EventBridge interface endpoint, one AZ | ~$7.30/month |
| Everything else at this volume | $0 |
| **Total** | **~$8/month** |

Against ~$75, and with both controls intact. The design is also intended to be
deployed ephemerally — `cdk destroy` between sessions leaves Aurora storage
alone, at which point even the $7.30 is proportional to use.

### On ADR-2

This resolves the question ADR-2 left open, but not on the grounds ADR-2
anticipated. ADR-2 expected to choose between scale-to-zero and RDS Proxy against
a load test measuring where the connection limit binds. That measurement cannot
decide it: at twenty users the limit does not bind, so the number would have been
real and irrelevant. The decision is made on cost and usage shape instead.

## Consequences

**The first request of a session is slow, and slower than the usual figure.** AWS
documents a typical resume of ~15 seconds. But a cluster paused for more than 24
hours enters a deeper sleep with a resume time of **30 seconds or more**. Given
this system idles for days or weeks between sessions, the 30-second case is the
normal case here, not the exception.

**The resume time exceeds what an HTTP API request can wait for.** API Gateway
HTTP APIs cap the integration timeout at 30 seconds, and unlike REST APIs that
limit is hard — it cannot be raised by a service quota request. A resume
therefore cannot be absorbed inside a synchronous request: the gateway returns
504 while the Lambda is still waiting, and the Lambda's own timeout is irrelevant
because the gateway gives up first.

This is a constraint on the API shape rather than a tuning problem, and it is the
main thing this decision costs. It is **unresolved**, and must be settled before
`POST /games` is built. Three candidates:

- **Wake asynchronously.** A `POST /wake` fired when the scorekeeper opens the
  app issues a trivial query and returns immediately; by the time they finish
  naming players the cluster is up. Cheapest, and it fails soft — a missed wake
  just means the slow path. It must sit behind Cognito like every other route:
  an unauthenticated endpoint whose purpose is to start a database lets anyone
  who finds it hold the cluster awake, deleting the saving this ADR exists for.
- **Make game creation async.** `POST /games` returns `202` with a poll or a
  WebSocket callback. Correct in the general case, and more machinery.
- **A REST API for the write path,** where the integration timeout can be raised
  to 300 seconds by quota request. Costs more per request and contradicts the
  stack table in `CLAUDE.md`.

Whichever is chosen, the resume should be paid before anyone is waiting on a
turn, not on the first turn of the evening.

**Connection retry logic is mandatory, not defensive.** Connections attempted
while a cluster is mid-resume fail. This is ordinary operation here, not an edge
case.

**Connection exhaustion returns to scope, on weaker grounds than before.** A
direct connection per warm execution environment is exactly the pressure ADR-2
described, and nothing in this design manages connections service-side. At twenty
users it does not bind — but the reasoning is now "does not bind at this scale"
rather than "cannot happen by construction," which is a claim that expires if the
scale changes. Note that the usual remedy is unavailable: RDS Proxy prevents
auto-pause. If concurrency ever rises, the choice is application-level pooling or
giving up scale-to-zero, and that is a real fork.

**IAM database authentication has its own edges.** Tokens expire after 15 minutes,
so they are generated per connection rather than cached for the life of a warm
container. Connections must use TLS. There is a ceiling of roughly 200 new
connections per second, far above anything this workload produces. In exchange
there is no database password anywhere — not in Secrets Manager, not in an
environment variable, not in the CDK app.

**Both controls exist, and it is worth being precise about what that buys.** The
network boundary means an attacker holding leaked IAM credentials still cannot
reach the database without also achieving code execution inside the VPC. It does
*not* help if the attack path is compromising a VPC-attached Lambda itself, since
that function is already inside. Credential leakage being the more common vector,
the boundary is worth its ~$7.30.

**Local development uses the production code path.** `mysql2` against a MySQL
container is the same driver, SQL and connection semantics as `mysql2` against
Aurora. Nothing about data access needs a local substitute, which is not true of
the Data API alternative.

**Single-AZ is a deliberate compromise.** One interface endpoint in one
availability zone means an AZ failure takes the application down. For a dice game
played a few evenings a month that is acceptable; recording it here so it is not
later mistaken for an oversight. A second AZ costs another ~$7.30/month and is a
config change, not a migration.

**Engine version is constrained.** Auto-pause requires Aurora MySQL 3.08.0 or
higher. The version must be pinned in CDK rather than left to a default.

**Several features silently prevent auto-pause**: RDS Proxy, binlog replication,
zero-ETL integration to Redshift, and Aurora Global Database. None are wanted
here, but adding any one produces no error — just a bill that stops going to
zero.

**The MySQL event scheduler will not run reliably.** Aurora does not wake a paused
instance for scheduled jobs, and cancels in-flight ones when pausing. Anything
periodic must be an EventBridge rule invoking a Lambda, which is where this
architecture would have put it anyway.

**VPC attachment no longer carries a meaningful cold-start penalty.** The ENI
setup cost that made VPC-attached Lambda notorious was removed by Hyperplane ENIs
in 2019. Any argument for leaving the VPC has to stand on something else.

**Region availability should be confirmed at bootstrap.** 0-ACU auto-pause is
region-gated. `us-east-2` is expected to support it; that has not been checked
directly and is a pre-flight item, not an assumption to deploy on.

**What would make us revisit this.** Real users with a latency expectation, or
sessions frequent enough that the cluster rarely pauses — at which point the
saving disappears and a warm minimum capacity costs little more. The trigger to
watch is the `ServerlessDatabaseCapacity` metric: if it is rarely zero, this
decision has stopped paying for itself.
