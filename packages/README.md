# Packages

Only `scoring` exists so far. The others are created in the milestone that needs
them — empty scaffolding rots and lies about progress.

| Package | Added in | Contains |
|---|---|---|
| `scoring` | M1 | Pure rules engine. No deps, no I/O. Consumed by both `api` and `web`. |
| `infra` | M2 | CDK app: VPC, Aurora, Lambda, API Gateway, alarms. |
| `api` | M2 | Lambda handlers. Imports `scoring`, never reimplements it. |
| `web` | M3 | React + Vite frontend. Also imports `scoring`. |

The reason `scoring` is its own package rather than a folder inside `api`: the
suggestion engine may end up running in the browser (see ADR-3), and the scoring
rules must not fork between client and server. Sharing it is the whole point.
