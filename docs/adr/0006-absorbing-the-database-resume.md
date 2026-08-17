# ADR-6: Absorbing the database resume

Status: accepted
Date: 2026-08-14

## Context

[ADR-4](0004-zero-idle-cost-inside-a-vpc.md) sets Aurora's minimum capacity to
zero, so the cluster pauses when idle and must resume on first use. It recorded
the resulting problem as unresolved:

- A cluster paused for more than 24 hours enters a deeper sleep. AWS documents
  the resume as **30 seconds or longer**, "roughly equivalent to doing a reboot."
  This system idles for days or weeks, so that is the normal case here.
- An API Gateway **HTTP API caps its integration timeout at 30 seconds**, and
  unlike a REST API that limit cannot be raised by a service quota request.

The two numbers collide. A resume cannot be absorbed inside a synchronous
request: the gateway returns 504 while the Lambda is still waiting, and the
Lambda's own timeout is irrelevant because the gateway gives up first. Raising
timeouts — the obvious first instinct, and what ADR-4 originally advised — does
nothing, because the binding limit is not one this application controls.

Two further facts shape the options:

- **Any connection attempt resumes the cluster**, including one with invalid
  credentials. Waking it is therefore cheap and needs no successful query.
- **Lambda cannot fire and forget.** Work not awaited before the handler returns
  is frozen when the invocation ends. A "kick off a resume and return
  immediately" endpoint does not reliably do anything.

## Options considered

**Make game creation asynchronous.** `POST /games` returns `202` with a poll or
WebSocket callback. Correct in the general case and the textbook answer. Costs: a
job record, a status endpoint or socket message, and client state machinery — all
to solve a problem that exists only on the first request of a session.

**Use a REST API for the write path.** REST APIs can have the integration timeout
raised to 300 seconds by quota request, so the resume fits inside one synchronous
call. Costs: more per request, a second API type to configure and reason about,
and it contradicts the stack table in `CLAUDE.md` for a single endpoint's benefit.

**A dedicated `POST /wake` endpoint.** Fire it when the app opens. Rejected in
this form: because Lambda cannot fire and forget, the handler must either block
on the resume — reintroducing the same 30-second problem — or return before doing
anything useful.

**A polled `GET /ready`.** One endpoint that both triggers the resume and reports
progress. Each call attempts a connection with a short timeout and returns
whether the cluster is up. The first call starts the resume as a side effect;
subsequent calls report on it.

## Decision

**`GET /ready`**, polled by the client, gating the actions that need a database.

1. The handler attempts a database connection with a short timeout (~5 seconds)
   and returns `{ "ready": true | false }`. It does not wait for the resume.
2. The client calls it when the scorekeeper opens the app, and polls every few
   seconds until ready. Game setup — naming players, choosing a ruleset — happens
   during that window, which is human work that comfortably exceeds 30 seconds.
3. `POST /games` therefore only ever runs against a warm cluster in the normal
   flow.
4. If it is called cold anyway, it returns **503 with `Retry-After`** rather than
   blocking until the gateway times out.

Three constraints are part of the decision, not implementation detail:

- **`/ready` sits behind Cognito**, like every other route. Its entire purpose is
  to start a database, which makes an unauthenticated version a cost
  amplification vector: anyone who found the URL could hold the cluster awake and
  delete the saving ADR-4 exists to produce. The user pool is invite-only.
- **The route is throttled** at the API Gateway level, so a malfunctioning client
  cannot hammer it.
- **The client stops polling once ready.** A retry loop with no terminating
  condition keeps the cluster permanently awake — the same failure as an
  unauthenticated endpoint, arrived at by accident rather than malice.

## Consequences

**The 30-second resume is paid where nobody is blocked on it.** It overlaps game
setup instead of landing on a player waiting for their turn to be recorded. The
delay is not eliminated; it is moved to the only point in a session where a human
is already busy.

**Two endpoints in M2 rather than one.** The vertical slice is now `GET /ready`
and `POST /games`. This is deliberate: `/ready` is what makes `POST /games`
work, so shipping the slice without it would mean shipping a known-broken first
request.

**A 503 is a design output, not a failure.** Returning `503` with `Retry-After`
from a cold `POST /games` is the honest response, and it is diagnosable. A
gateway 504 tells the client nothing about why or whether retrying will help.

**Connection retry logic is still mandatory.** AWS notes that a paused instance
receiving several connection requests while resuming may reject some of them.
Polling `/ready` does not remove that; it means the rejections happen against a
probe rather than against a real write.

**Nothing about this protects a first request that skips the client.** A `curl`
straight at `POST /games`, or an integration test, will hit a cold cluster and
get a 503. That is correct behaviour and the test suite has to expect it.

**The wake path is reachable only by authenticated users**, which is a property
of ADR-4's network boundary rather than of this decision. Because Aurora sits in
private subnets with no public endpoint, the "any connection attempt resumes it"
behaviour cannot be exercised from the internet at all — a caller would have to
be inside the VPC. Under the RDS Data API design ADR-4 rejected, this would have
needed thinking about far more carefully.

**What would make us revisit this.** Sessions frequent enough that the cluster
rarely pauses, at which point `/ready` becomes a permanently-true endpoint and
can be dropped along with the polling. The trigger is the same
`ServerlessDatabaseCapacity` metric ADR-4 nominates: if it is rarely zero, both
decisions have stopped paying for themselves.
