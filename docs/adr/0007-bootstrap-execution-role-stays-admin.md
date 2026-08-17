# ADR-7: The bootstrap execution role keeps AdministratorAccess

Status: accepted
Date: 2026-08-14

## Context

`cdk bootstrap` creates a CloudFormation stack named `CDKToolkit` containing an
S3 bucket, an ECR repository, and four IAM roles. Three are plumbing. The fourth
decides how much power a deployment has:

| Role | Assumed by | Purpose |
|---|---|---|
| `deploy-role` | CI | Starts a deployment |
| `file-publishing-role` | CDK CLI | Uploads assets to S3 |
| `lookup-role` | CDK CLI | Reads account state for context lookups |
| **`cfn-exec-role`** | **CloudFormation** | **Creates, modifies and deletes the resources** |

The `cfn-exec-role` is not the role the pipeline holds. It is the role
CloudFormation assumes on the account's behalf to act on whatever the stacks
describe. By default AWS attaches `AdministratorAccess` to it.

`CLAUDE.md` says to assume any policy not written by hand is wrong, and this is
the largest such policy in the account. It is also the one that is hardest to
scope correctly before the stacks it serves exist: scoping means enumerating
every service the stacks will touch, and a missing permission surfaces as a
failed deployment with an error that does not clearly name what was denied.

## Options considered

**Scope it now.** Pass `--cloudformation-execution-policies` at bootstrap with a
hand-written policy. Correct in principle. In practice it means predicting the
service list before writing the stacks, then rebootstrapping each time a
prediction is wrong. The list is knowable later by reading the deployed stacks;
it is guesswork now.

**Accept the default and say nothing.** What happens by default, and the actual
failure mode this ADR exists to prevent — not the permission itself, but
believing months later that the deploy path is least-privilege when it is not.

**Accept the default, record it, and narrow it on a trigger.** Deployment works
immediately, the gap is written down where a reader will find it, and the scoping
happens when it can be done from evidence rather than from prediction.

## Decision

Accept `AdministratorAccess` on the `cfn-exec-role`, and record it here.

**Narrow it at the end of M3**, when M1–M3 stacks are deployed and the service
list can be read off them rather than guessed. Until then, the honest description
of this pipeline is that CloudFormation deploys as an administrator.

## Consequences

**The deploy path is not least-privilege, and the repo says so.** If asked
whether it is scoped, the answer is "no, deliberately, and here is when that
changes." That is a different position from not having considered it, and only
one of the two survives contact with a reviewer.

**The GitHub credential is still narrow, but the distinction is thinner than it
looks.** The chain is: GitHub Actions assumes the deploy role, which can do
nothing but `sts:AssumeRole` on the CDK roles; CDK then hands CloudFormation the
`cfn-exec-role`, which is admin. A leaked GitHub token therefore cannot make
arbitrary AWS API calls — it can only trigger CDK deployments. But a CDK
deployment can create anything, so this is administrator access by proxy rather
than genuine containment. Worth stating plainly rather than presenting as defence
in depth.

**A bug in the CDK app has no blast-radius limit.** Whatever a stack describes,
CloudFormation will build. There is no permission boundary that would stop an
accidental IAM role, an unintended public bucket, or a resource in an unexpected
service. The controls that remain are code review, the `cdk diff` posted on pull
requests, and the budget alarms from Phase 1 of the account runbook.

**Narrowing it later is a bootstrap update, not a migration.** Rerunning
bootstrap with `--cloudformation-execution-policies` updates the `CDKToolkit`
stack in place. The cost of deferring is the exposure window, not rework.

**This applies to a single-developer personal account.** The same default in a
shared account, or one holding anything of value, would not be defensible on
these grounds. The reasoning here rests on the account containing one hobby
project and no data anyone else depends on.

**What would make us revisit this sooner than M3.** A second person gaining
access to the account, anything resembling production data landing in the
database, or the account being used for a second project. Any of those removes
the premise the decision rests on.
