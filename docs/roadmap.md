# Roadmap

What is built, what is planned, and what is deliberately excluded.

## Current state

`packages/scoring` is under construction. Its test suite is written and failing —
the tests are the specification. Nothing is deployed.

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

AWS account hardening (MFA, IAM Identity Center, a Budgets alarm on day one).
`cdk bootstrap`, then a first stack: VPC, Aurora Serverless v2, one Lambda, one
HTTP API route. Exactly one endpoint end to end — `POST /games`. GitHub Actions
deploys via OIDC role assumption; no long-lived access keys.

*Done when:* one endpoint is live, deployed by pipeline, with nothing created by
hand in the console.

### M3 — The application

Full game flow: create a game, record turns, render a live scorecard. WebSocket
fan-out to viewers with the connection registry in DynamoDB. EventBridge into the
stats projection. Cognito, invite-only. React frontend on S3 + CloudFront.

*Done when:* a real game can be played on it.

### M4 — Operational hardening

Structured JSON logs with correlation IDs, EMF custom metrics, alarms on 5xx rate
and p99 latency, a saved Logs Insights query. Load test with artillery until
concurrent Lambdas exhaust Aurora's connection limit, then resolve
[ADR-2](adr/0002-scale-to-zero-vs-rds-proxy.md) against the measurement rather than
against intuition. Accessibility pass on the scorecard grid — it is a real table
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
