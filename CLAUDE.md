# CLAUDE.md

Context for agentic sessions in this repo. Read `docs/roadmap.md` for scope and
milestones.

## What this is

A scoring and history app for a recurring Yahtzee-variant dice game. One scorekeeper
records turns; other players watch a live read-only scorecard on their phones.
Historical game data is the point — reporting on it is a first-class feature, not an
afterthought.

The architecture is deliberately more than the feature set requires. The interesting
problem here is operating a small system properly — infrastructure as code, real
CI/CD, structured observability, honest failure handling — not maximising features.
Where a design choice trades "simplest possible thing" against "the thing that holds
up in production," prefer the latter, and say so in an ADR rather than quietly
building it.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + TypeScript, Vite, S3 + CloudFront |
| Auth | Cognito, invite-only user pool |
| API | API Gateway HTTP API → Lambda (Node 22, TypeScript) |
| Realtime | API Gateway WebSocket API, connection registry in DynamoDB |
| Events | EventBridge |
| Database | Aurora Serverless v2 (MySQL) |
| IaC | AWS CDK (TypeScript) — no console clicking, ever |
| CI/CD | GitHub Actions → OIDC role assumption |
| Tests | Vitest (unit), Playwright (one E2E happy path) |
| Observability | CloudWatch: structured JSON logs, EMF metrics, alarms |

## Layout

```
packages/scoring   pure TS rules engine — no deps, no AWS, runs in Node and browser
packages/api       Lambda handlers
packages/web       React frontend
packages/infra     CDK app
docs/adr           architecture decision records
```

## Standards

- **`packages/scoring` stays pure.** No AWS SDK, no I/O, no framework imports. It is
  consumed by both Lambda and the browser. If something needs a network call, it does
  not belong here.
- **Rules are data, not code.** Scoring behaviour lives in `Ruleset` objects. Adding
  the group's house variant should mean a new ruleset row, not an `if` branch.
- **`turns` is the event log; everything else is a projection.** `player_stats` must
  be rebuildable from `turns` alone. Never write a stat that can't be recomputed.
- **Every mutating endpoint takes an idempotency key.** Retries are normal, not
  exceptional.
- **TypeScript:** `strict: true`. `unknown` at every parse boundary, never `any`.
  Discriminated unions over optional-field bags. Exhaustive switches with `assertNever`.
- **No long-lived AWS keys.** GitHub Actions authenticates via OIDC.
- **Least privilege.** Scope IAM to the specific resource. Generated policies are
  over-permissioned by default — assume any policy you didn't write by hand is wrong.

## Working agreements for agents

- Explain any non-obvious TypeScript or AWS pattern in a line or two rather than
  leaving it to be reverse-engineered from the diff.
- Flag over-permissioned IAM, unhandled failure modes, and anything that would break
  under concurrent Lambda invocations. Those are the failure classes this
  architecture is most exposed to.
- When a decision has a real tradeoff, write an ADR in `docs/adr/` rather than
  picking silently.
- `docs/ai-journal.md` records cases where generated code was wrong and what caught
  it. Append to it as they happen.

## Commands

```bash
npm install          # root, npm workspaces
npm test             # vitest across workspaces
npm run typecheck    # tsc --noEmit across workspaces
```
