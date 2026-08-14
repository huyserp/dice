# AI-assisted development log

A running record of where AI-generated code in this repo was wrong, what caught
it, and what guardrail was added afterwards.

Generated infrastructure, migrations and IAM policies are reviewed before they
are applied, on the assumption that anything not written by hand is wrong until
demonstrated otherwise. This file is where that review process leaves evidence.

**Entries are written as things happen.** Reconstructing one later produces a
vague entry, and a vague entry records nothing useful.

## Format

```
### YYYY-MM-DD — one-line summary
**Asked for:** the prompt
**Got:** what came back
**Problem:** what was actually wrong with it
**Caught by:** test / review / typecheck / reached production
**Guardrail added:** what stops it recurring
```

## Known failure modes to check for

- **Over-permissioned IAM.** Generated policies reach for `*` on actions or
  resources. Every policy gets scoped to a named resource by hand.
- **Migrations that look correct.** A schema change that would drop or truncate a
  column on populated tables runs clean against an empty one. Migrations are
  dry-run against a copy with real data.
- **Hallucinated constructs.** CDK classes and SDK methods that do not exist, or
  that exist under a different name in a different major version.
- **Confidently wrong scoring rules.** The edge cases in the `scoring` test suite
  are exactly where a model states a rule fluently and incorrectly. The tests are
  the specification; generated explanations are not.
- **Scope overreach.** An agent asked to change one function editing six files.
- **Cases where generation was abandoned** in favour of writing it by hand, and
  what made that the right call.

## Entries

<!-- newest first -->

### 2026-08-14 — ADR-4 traded away a security control without pricing it

**Asked for:** an ADR capturing how to get the architecture's ~$75/month idle
cost down, given a workload of roughly twenty users a few evenings a month.

**Got:** a well-argued case for the RDS Data API with Lambda outside the VPC.
The cost analysis was sound, the engine-version constraints were correct, and
the auto-pause caveats were researched rather than asserted.

**Problem:** moving Lambda out of the VPC deletes the network boundary in front
of the database, and the ADR did not mention it. Every listed consequence was
about latency, cost or engine versions. The decision was presented as a pure
win, when it was a trade of one security control for roughly $7/month —
defensible, but not something an ADR should leave for the reader to notice.
The ADR that argues *for* a change is exactly where its cost has to be written
down, because that is the document someone will cite later as proof the
question was considered.

**Caught by:** code review of the docs branch, before the branch was pushed.

**Guardrail added:** ADR-4 was rewritten to treat the two controls as the
subject of the decision rather than a side effect, and the design changed to
keep both. `notes/cdk-and-iam.md` gained a section on network versus identity
boundaries and why over-permission is the failure class that produces no
symptoms.

### 2026-08-14 — a consequence that could not be acted on

**Asked for:** the same ADR.

**Got:** the consequence "client and Lambda timeouts must exceed 30 seconds, or
the first request of every session fails," with `POST /games` nominated as the
request that should absorb the database resume.

**Problem:** the stack uses an API Gateway HTTP API, whose integration timeout
is capped at 30 seconds and — unlike a REST API — cannot be raised by a quota
request. The gateway returns 504 while the Lambda is still waiting, so the
Lambda timeout the consequence tells you to raise is not the binding limit.
Following the instruction exactly would have produced the failure it was
written to prevent, on the first request of every session. The advice was
locally sensible and globally impossible, which is the harder kind to spot: it
reads as concrete and actionable.

**Caught by:** code review, which cross-checked the claim against the stack
table in `CLAUDE.md`.

**Guardrail added:** the consequence now states the constraint as unresolved
and lists three candidate resolutions, with an explicit note that it must be
settled before `POST /games` is built. The roadmap's M2 section carries the same
warning, so it cannot be missed by someone reading only the milestone.
