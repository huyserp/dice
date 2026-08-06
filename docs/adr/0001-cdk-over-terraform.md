# ADR-1: AWS CDK over Terraform

Status: accepted
Date: 2026-07-31

## Context

All infrastructure must be defined in code and deployed from CI — nothing created
by hand in the console. Two mainstream options.

## Options considered

**Terraform.** Larger ecosystem, provider-agnostic, and `plan`/`apply` gives a
clearer picture of pending change than anything CloudFormation offers. Costs: HCL
is a second language in a codebase that is otherwise entirely TypeScript, and
remote state needs its own bootstrap — an S3 bucket and a lock table — before any
other infrastructure can be created.

**AWS CDK.** Synthesises to CloudFormation. Infrastructure is written in the same
language as the application, which means one toolchain, one set of lint and test
conventions, and constructs that are type-checked against the resources they
create. State is managed by CloudFormation, so there is no state store to stand up
or protect. L2 constructs collapse a large amount of boilerplate. Costs: AWS-only;
drift and failed-stack rollback are harder to reason about than Terraform's
plan/apply cycle; and a single mis-specified construct can generate a surprising
number of resources.

## Decision

CDK, in TypeScript.

The deciding factor is that this stack is entirely AWS and expected to stay that
way, which makes Terraform's main advantage — provider portability — worth
nothing here, while its costs (a second language, a state store to bootstrap and
secure) are real and immediate.

## Consequences

- One language across application and infrastructure. Shared types between a
  Lambda's handler and the construct that configures it are checked by the
  compiler.
- `cdk diff` before every deploy is non-negotiable. It is the closest analogue to
  `terraform plan`, and skipping it is precisely how CDK produces surprises.
- Multi-cloud is off the table. Acceptable here; it would not be at an
  organisation with an existing Terraform estate.
- **Revisit if:** this ever needs to run somewhere other than AWS, or joins an
  estate already managed by Terraform. The concepts transfer; only the syntax
  does not.

## Follow-up

Record anything an L2 construct creates that was not expected — a log group, a
security group, a NAT gateway. Those findings are the measurable cost of the
abstraction and belong in this file.
