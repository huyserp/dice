# ADR-5: Deferring IAM Identity Center

Status: accepted
Date: 2026-08-14

## Context

Root is for the few tasks that require it. Everything else should run as a
scoped, non-root identity, and the current AWS mechanism for that is IAM
Identity Center. The runbook in `aws-account-setup.md` treats enabling it as
Phase 2, before any deployment work.

Enabling it turns out not to be free. The organization instance of Identity
Center requires an AWS Organization, and creating an Organization converts a new
account from the free plan to pay-as-you-go — **expiring promotional credits
immediately**. This account holds $120 in credits, unused, expiring 2027-08-11.
Against the ~$8/month idle cost established in
[ADR-4](0004-zero-idle-cost-inside-a-vpc.md), and ephemeral deploys well below
that, $120 plausibly funds the entire project.

The decision initially looked like "pay $120 for a proper identity system."
That framing was wrong, and correcting it is most of this ADR. The real question
is narrower: **what actually needs AWS credentials?**

| Activity | Needs an identity? |
|---|---|
| Deployment | GitHub Actions via OIDC — requires neither Organizations nor Identity Center |
| Local development | Nothing. Docker containers, no AWS credentials at all |
| One-time bootstrap | A CloudFormation template uploaded in the console |
| Occasional console work | Root, MFA-protected |

Identity Center's daily-driver role has very little to do here. The credential
that matters — the one that deploys infrastructure — is issued by OIDC and
expires in minutes, and that path is unaffected either way.

## Options considered

**Enable Identity Center now.** The disciplined answer, and the one the runbook
assumed. Gives a non-root console identity, short-lived CLI credentials via
`aws configure sso`, and the Organization structure needed for multi-account
later. Costs $120 immediately, to solve a problem this project barely has yet.

**An IAM user with long-lived access keys.** The legacy path. Cheap and
immediate, and it puts a permanent credential on a laptop — precisely what the
"no long-lived AWS keys" standard in `CLAUDE.md` exists to prevent. Rejected
outright; a cost saving is not a reason to ship the thing the standard names.

**Defer Identity Center.** Keep the credits. Root, with two MFA devices and no
access keys, covers the rare console task. Deployment goes through GitHub
Actions OIDC. Local development uses containers and needs no AWS credentials.
Revisit on a stated trigger rather than on a vague intention.

## Decision

Defer IAM Identity Center. Specifically:

1. **No AWS Organization is created**, and the $120 in credits is preserved.
2. **All deployment runs through GitHub Actions OIDC.** No human deploys.
3. **Local development uses containers**, with no AWS credentials on the machine.
4. **Root is the only console identity**, protected by two MFA devices, with no
   access keys, and used rarely.
5. **Bootstrap is done by uploading a CloudFormation template** in the console —
   creating the OIDC provider and deploy role — rather than by authenticating a
   local CLI. This avoids needing any local credential even once.

## Consequences

**Root is doing a job it should not have to do.** This is the weakest part of the
decision and worth stating plainly. Root cannot be scoped, its permissions cannot
be reduced, and its use cannot be meaningfully audited per-service. The
mitigations are that it carries two MFA devices, has no access keys, and is used
for almost nothing — but "used rarely" is a behavioural control, not a technical
one, and behavioural controls decay.

**There is no local AWS CLI access, and that has a real cost.** No `cdk diff`
against the live account before opening a PR, no `aws logs tail` while
debugging, no poking at a running stack from a terminal. Every interaction with
the account goes through a pipeline run, which is slower than a shell.

The same constraint has an upside worth naming: it makes the "no console
clicking" and "deploy only through CI" standards *structurally* true rather than
merely intended. Nothing can drift by hand, because there is no hand to drift it
with. Whether that trade is comfortable is a question the first real debugging
session will answer.

**Multi-account is off the table while this holds.** Separate dev and prod
accounts require an Organization. This decision therefore also defers the account
topology question, which the runbook's Phase 3 previously assumed would already
be answered by enabling Identity Center.

**The region decision still has to be made before Identity Center is ever
enabled.** Identity Center is pinned to the region it is enabled in, and moving
it means deleting the instance along with its users, permission sets and
assignments. Deferring does not defer that constraint — it only postpones the
moment it binds. `us-east-2` is the chosen region.

**What would make us revisit this.** Any one of:

- The $120 in credits is exhausted, at which point the cost of enabling
  Organizations drops to zero.
- **2027-05-11** — three months before the credits expire, at which point holding
  them buys nothing and the remaining balance should be spent or written off.
- A second person needs access to the account. Sharing root is not an option, so
  this forces the issue immediately.
- The absence of local credentials becomes a genuine bottleneck rather than a
  mild inconvenience — most likely during an incident, when pipeline latency is
  least affordable.
