# Roadmap

What is built, what is planned, and what is deliberately excluded.

## Current state

`packages/scoring` is complete, with its test suite green. The tests were written
first and are the specification. Nothing is deployed; M2 is in progress.

## Principles

The feature set is small on purpose. A scorekeeper records turns, other players
watch, and the history is queryable. Everything else is operational: infrastructure
as code, CI/CD, auth, structured logging, alarms. When scope has to give, features
are cut before the operational edges are.

The architecture is more than a four-person dice game strictly requires. That is a
deliberate choice, not an oversight — the interesting problem here is running a
small system properly, not maximising the feature count.

## Milestones

### M1 — Scoring engine

A pure, dependency-free TypeScript module. Rules as data, discriminated unions for
the thirteen categories, `unknown` at every parse boundary. Full Vitest coverage.
Includes a one-roll expected-value helper that ranks open categories for a given
roll.

*Done when:* the engine runs unchanged in Node and the browser, with the test
suite green.

### M2 — Infrastructure and one vertical slice

AWS account hardening (root MFA, a Budgets alarm on day one, GitHub OIDC in
place of any local credential) — sequenced in
[`aws-account-setup.md`](aws-account-setup.md), with IAM Identity Center
deliberately deferred per [ADR-5](adr/0005-deferring-iam-identity-center.md).
Then `cdk bootstrap`, and a first stack shaped by
[ADR-4](adr/0004-zero-idle-cost-inside-a-vpc.md): Aurora Serverless v2 at
`MinCapacity = 0`, one Lambda inside the VPC connecting directly over TLS with
IAM database authentication, one HTTP API route, and no NAT Gateway — outbound
reach is a single EventBridge interface endpoint plus free gateway endpoints.

Two routes end to end: `POST /games`, and the `GET /ready` probe that
[ADR-6](adr/0006-absorbing-the-database-resume.md) requires to keep the database
resume off the critical path. GitHub Actions deploys via OIDC role assumption; no
long-lived access keys, and pull requests post a `cdk diff` from a separate
read-only role so infrastructure is reviewed as a plan rather than as TypeScript.

*Done when:* one endpoint is live, deployed by pipeline, with nothing created by
hand in the console.

### M3 — The application

Full game flow: create a game, record turns, render a live scorecard. WebSocket
fan-out to viewers with the connection registry in DynamoDB. EventBridge into the
stats projection. Cognito, invite-only. React frontend on S3 + CloudFront, with
the suggestion engine running in the browser per
[ADR-3](adr/0003-suggestion-engine-placement.md) — so it stays responsive even
while the database is resuming.

*Done when:* a real game can be played on it.

### M4 — Operational hardening

Structured JSON logs with correlation IDs, EMF custom metrics, alarms on 5xx rate
and p99 latency, a saved Logs Insights query. Load test with artillery — no
longer to resolve [ADR-2](adr/0002-scale-to-zero-vs-rds-proxy.md), which
[ADR-4](adr/0004-zero-idle-cost-inside-a-vpc.md) settled on cost grounds, but to
characterise resume latency and to find where concurrent Lambdas start pressing
on Aurora's connection limit. ADR-4 records that limit as "does not bind at this
scale" rather than as impossible, and the usual remedy is closed off — RDS Proxy
prevents auto-pause — so the number is worth knowing before it matters.
Accessibility pass on the scorecard grid — it is a real table
read on phones in dim rooms, so touch targets, contrast, screen-reader labels and
keyboard navigation all matter.

### M5 — Historical data import

Several years of games currently live in a spreadsheet. Importing them is a real
migration with messy input: an inferred schema, duplicate rows, and players whose
names are spelled three different ways. Needs source profiling, name
normalisation, a dedup strategy, a dry run, a rollback path, and reconciliation
counts.

Legacy rows land in `players` / `games` / `game_players` with `turns` empty —
per-turn detail was never recorded. The reporting queries are designed to tolerate
that gap from the start rather than being retrofitted for it.

## Data model

```sql
players       (id, display_name, created_at)
rulesets      (id, name, version, config JSON)
games         (id, played_at, ruleset_id, status,
               created_by, winner_player_id)
game_players  (game_id, player_id, seat_order)
turns         (id, game_id, player_id, turn_number,
               category, dice JSON, score, recorded_at,
               idempotency_key UNIQUE)
player_stats  (player_id, ruleset_id, games_played, wins,
               avg_score, category_averages JSON, updated_at)
```

`turns` is the event log. `player_stats` is a projection, rebuildable from `turns`
at any time. No statistic is ever written that cannot be recomputed from the log.

## Flow of one turn

The scorekeeper POSTs a turn with an idempotency key. The Lambda validates it
through the pure scoring engine, writes to `turns`, and publishes `TurnRecorded`
to EventBridge. Two subscribers then fire independently: one broadcasts to
connected viewers, the other updates the stats projection. Neither blocks the
write path, and either can be replayed.

## Out of scope

Each of these was considered and dropped for a reason, not overlooked.

| Excluded | Why |
|---|---|
| Offline sync | The game is played on reliable wifi. Idempotency keys are still used — they are needed for ordinary retries regardless. |
| Optimal-play solver | Optimal Yahtzee play is a solved dynamic-programming problem and a deep rabbit hole. Expected value over a single roll is enough to be useful at the table. |
| Multi-writer scorecards | One person keeps score at a real table. Supporting concurrent writers would mean inventing conflicts that never occur. |
| Containers / ECS | Lambda covers every workload here. |
| Multi-cloud abstraction | See [ADR-1](adr/0001-cdk-over-terraform.md). |

## House rules

The group plays a variant. Standard Yahtzee ships first, with scoring behaviour
held in `Ruleset` objects so the variant arrives as a configuration row rather
than a branch in the scoring code. See `packages/scoring`.
