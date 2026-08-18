# Dice

Scoring and history for a long-running Yahtzee-variant dice game.

One scorekeeper records turns on their phone; the other players at the table
watch a live scorecard on theirs. Every turn is stored as an event, so the
historical record — who plays, who wins, who is quietly terrible at full houses —
is queryable rather than trapped in a spreadsheet.

## Status

Early. The scoring engine is complete and tested; nothing is deployed yet.
See [`docs/roadmap.md`](docs/roadmap.md) for milestones and scope.

Decisions are recorded as they are made, with what each one costs.
[ADR-4](docs/adr/0004-zero-idle-cost-inside-a-vpc.md) gets idle cost down to
roughly a dollar a month without giving up the database's network boundary.
[ADR-7](docs/adr/0007-bootstrap-execution-role-stays-admin.md) records a
deployment role that is deliberately *not* least-privilege, and names the point
at which that changes.

## Architecture

Target architecture. See [Status](#status) for what exists today.

```
React + TypeScript (Vite) ──► S3 + CloudFront
        │
        ├── Cognito (invite-only)
        │
   HTTP API Gateway            WebSocket API Gateway
        │                             │
   Lambda (Node 22, TS)        connect / disconnect
        │                             │
        │                      DynamoDB (connections)
        │                             ▲
   Aurora Serverless v2              │
   (MySQL)                    broadcast Lambda
        │                             ▲
        └────► EventBridge ───────────┘
                    │
                    └──► stats projection Lambda
```

A turn write publishes `TurnRecorded` to EventBridge; broadcast and stats
projection subscribe independently, so neither blocks the write path.

`turns` is the event log. `player_stats` is a projection and is rebuildable from
`turns` alone.

## Packages

| Package | Added in | What |
|---|---|---|
| `packages/scoring` | M1 | Pure rules engine. No deps, no I/O. Runs in Node and the browser. |
| `packages/infra` | M2 | CDK app |
| `packages/api` | M2 | Lambda handlers |
| `packages/web` | M3 | React frontend |

Only `scoring` exists today. The rest are created in the milestone that needs
them — see [`packages/README.md`](packages/README.md).

## Getting started

```bash
npm install
npm test          # vitest across workspaces
npm run typecheck # tsc --noEmit across workspaces
```

The scoring test suite is the specification for `packages/scoring` — rules are
stated as expectations first, so a misunderstanding of the rules surfaces as a
failing test rather than as a wrong scorecard.

Note that `npm test` does not typecheck. Vitest transpiles via esbuild, which
strips types without checking them, so `npm run typecheck` is a separate gate.

## Docs

- [`docs/roadmap.md`](docs/roadmap.md) — scope, milestones, and what's excluded
- [`docs/adr/`](docs/adr/) — architecture decision records
- [`docs/aws-account-setup.md`](docs/aws-account-setup.md) — one-time account
  hardening that precedes any deployment
- [`CLAUDE.md`](CLAUDE.md) — conventions and standards

## License

None. Copyright © 2026 Peter Huyser, all rights reserved.

This source is published to be read, not reused. No permission is granted to
use, copy, modify, or distribute it.
