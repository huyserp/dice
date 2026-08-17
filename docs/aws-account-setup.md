# AWS account setup

The one-time steps that precede any deployment, in the order they need to happen.

Most of this is console work. That does not contradict "no console clicking, ever"
— that rule is about *infrastructure*, which is defined in CDK and versioned here.
Account creation, root credentials, and the identity system that CDK itself
authenticates through cannot be provisioned by the tool that depends on them.
Everything below is bootstrap; everything after it is code.

Each phase ends in a state worth stopping at. Nothing here needs to happen in one
sitting.

---

## Phase 0 — Account

- [x] **Create the account with a dedicated email address.** An alias like
      `aws+dice@yourdomain` works. The address becomes the root user identity and
      cannot be reused for another AWS account, so a personal inbox address you
      might one day want for a second account is a bad choice.
- [x] **Root password: long, random, in a password manager.** It should be
      inconvenient to type, because you should almost never type it.
- [x] **Enable MFA on root.** Hardware key if you have one, TOTP otherwise.
- [x] **Do not create root access keys.** If any exist, delete them. There is no
      legitimate use for a long-lived root key, and it is the single credential
      that cannot be scoped, revoked per-service, or audited meaningfully.
- [x] **Set an account alias** so the sign-in URL is readable.
- [x] **Fill in alternate contacts** (billing, operations, security). These are
      where AWS writes when something is wrong and you are not reading the console.

**Stop condition:** root is MFA-protected and has no access keys.

---

## Phase 1 — Spend guardrails, before anything is deployable

This phase comes before identity setup deliberately. The window where an account
exists and has no billing alarm is the window where a mistake is invisible.

- [x] **Enable IAM access to billing data** (Account settings → IAM user and role
      access to billing information). Off by default; without it, non-root
      identities cannot see costs at all.
- [x] **Create a monthly budget** with alerts at 50%, 80%, and 100% of a figure
      you would be annoyed to spend. Add a *forecasted* alert as well as actual —
      forecast warns you mid-month, actual tells you afterwards.
- [x] **Enable Cost Anomaly Detection** with an email subscription. It catches the
      shape of problem a fixed threshold misses: a small service suddenly costing
      ten times its normal amount while the total stays under budget.

> **Budgets alert. They do not cap.**
>
> AWS has no hard spend limit. A budget is a notification, and nothing stops
> spend when it trips. The protection against a runaway bill is the alarm
> reaching you plus your ability to tear the stack down — which is one more
> reason everything is in CDK.

**Stop condition:** you would receive an email within hours of unexpected spend.

---

## Phase 2 — Identity

Root is for the handful of tasks that legitimately require it (closing the
account, changing the support plan, some billing settings). Daily work should use
a separate identity, and the current mechanism for that is IAM Identity Center.

> **This phase is deliberately skipped. See
> [ADR-5](adr/0005-deferring-iam-identity-center.md).**
>
> The organization instance of Identity Center requires an AWS Organization, and
> creating one converts a new account from the free plan to pay-as-you-go,
> expiring promotional credits immediately. Weighed against what actually needs
> AWS credentials here — deployment runs on GitHub Actions OIDC, which needs
> neither Organizations nor Identity Center, and local development runs on
> containers with no AWS credentials at all — the credits were worth more than a
> non-root console identity this project barely uses.
>
> ADR-5 records the trade, what it costs, and the triggers that end it.

What stands in for this phase in the meantime:

- [x] **Root carries two MFA devices and no access keys** (Phase 0), and is used
      rarely.
- [x] **Deployment authenticates via GitHub OIDC** (Phase 4). No human deploys.
- [x] **Local development uses containers**, so no AWS credential exists on the
      development machine to leak.

### When this phase is revisited

The steps below are the ones to run at that point. They are listed now so the
deferral is a decision with a plan attached rather than an omission.

> **Pick the region before enabling anything here.**
>
> IAM Identity Center is pinned to the region it is enabled in, and moving it
> means deleting the instance — taking its users, permission sets, and
> assignments with it. Deferring does not defer this constraint; it only
> postpones the moment it binds. The region is `us-east-2` (Phase 3).

- [ ] **Enable IAM Identity Center.** Standalone IAM users with long-lived access
      keys are the legacy path and are what "no long-lived AWS keys" in
      `CLAUDE.md` refers to. They are not the fallback here — the fallback is
      having no local credentials at all.
- [ ] **Create an administrative permission set** and assign yourself to the
      account through it.
- [ ] **Require MFA** on that user.
- [ ] **Configure the CLI:** `aws configure sso`. This yields short-lived
      credentials refreshed by `aws sso login` — no key material on disk.
- [ ] **Stop using root.** Sign out and use the Identity Center URL from here on.

**Stop condition (deferred):** no AWS credential exists on the development
machine, and the only path into the account is root-with-MFA or a pipeline run.

---

## Phase 3 — Decisions to record before bootstrapping

Both are cheap now and disruptive later. Each deserves an ADR. The region has to
be chosen before anything is deployed *and* before Identity Center is ever
enabled, whenever that happens — see ADR-5.

- [ ] **Region.** `us-east-1` is cheapest, gets services first, and is required
      for a few global things (CloudFront certificates, for one). It is also the
      busiest region and the one whose outages make the news. `us-east-2` is a
      common default for this reason. Moving an Aurora cluster between regions
      later is a migration, not a config change.

- [ ] **Confirm the region supports what the architecture depends on.** Per
      ADR-4, this stack needs Aurora Serverless v2 auto-pause at 0 ACU, which
      requires Aurora MySQL 3.08+ and is region-gated. Discovering a gap after
      bootstrapping is expensive.

- [x] **One account or several.** The disciplined answer is separate accounts for
      dev and prod, so a mistake in one cannot touch the other. Multi-account
      requires an AWS Organization, which [ADR-5](adr/0005-deferring-iam-identity-center.md)
      defers — so this is decided for now by that decision rather than on its own
      merits. One account, revisited on ADR-5's triggers.

**Stop condition:** ADRs written, region fixed and verified.

---

## Phase 4 — GitHub OIDC

This comes before bootstrapping, not after. Under
[ADR-5](adr/0005-deferring-iam-identity-center.md) there are no local AWS
credentials, so `cdk bootstrap` runs in CI — which means the identity CI uses has
to exist first.

- [ ] **Write a CloudFormation template** creating the OIDC identity provider for
      `token.actions.githubusercontent.com` and the deploy role. Keep it in the
      repo. This is the one piece of infrastructure that cannot be created by CDK,
      because it is what CDK will authenticate through.
- [ ] **Give the deploy role a trust policy pinning both claims:**

      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      "token.actions.githubusercontent.com:sub": "repo:<owner>/<repo>:ref:refs/heads/main"

      Use `StringEquals`, not `StringLike`. A trust policy carrying `aud` but no
      `sub` condition permits *any* GitHub repository to assume the role — it is
      the highest-consequence mistake in this document.
- [ ] **Scope the deploy role's permissions to `sts:AssumeRole` on the CDK
      bootstrap roles**, and nothing else:

      arn:aws:iam::<account-id>:role/cdk-hnb659fds-*-role-<account-id>-<region>

      Those roles do not exist yet — Phase 5 creates them — and that is fine, an
      IAM policy may name an ARN before it exists. This is what keeps the GitHub
      role from needing broad permissions: it can assume CDK's roles and do
      nothing else directly. `hnb659fds` is the default bootstrap qualifier, not
      a random string; it changes only if the bootstrap is customised.
- [ ] **Add a second, read-only role for pull requests**, in the same template.
      Its trust policy pins `sub` to `repo:<owner>/<repo>:pull_request` — the
      claim a PR-triggered workflow actually presents, which is why the deploy
      role above cannot serve both. Grant it only what `cdk diff` needs: reading
      CloudFormation stack state, and `sts:AssumeRole` on the CDK **lookup** role.
      Never the deploy role.

      Without this, infrastructure changes get merged having been reviewed as
      TypeScript rather than as a plan — and CDK source shows intent, not
      consequence. Renaming a construct changes its logical ID, which
      CloudFormation reads as *delete and recreate*; on an Aurora cluster that is
      the data. `cdk diff` says so plainly and the source does not. ADR-5 removed
      the local fallback, so this role is now the only place a plan can be seen.
- [ ] **Deploy the template in the CloudFormation console**, signed in as root.
      Under ADR-5 this is the only console-created infrastructure, and it exists
      to avoid ever putting a credential on a laptop.
- [ ] **Store the role ARN as a repository secret.** An ARN is an identifier, not
      a credential, and in a private repo a plain variable would be the better
      choice — visible in logs, which helps when a deploy fails. This repo is
      public, and so are its workflow logs. An ARN contains the account ID, so a
      variable would publish it on every run. A secret gets masked. The cost is
      slightly worse debugging; the alternative is publishing the account ID
      permanently.
- [ ] **Grant `id-token: write`** in the workflow, per job that needs it, never at
      workflow top level.

**Stop condition:** a workflow on `main` assumes the role and calls
`aws sts get-caller-identity` successfully, with no stored credentials.

---

## Phase 5 — CDK bootstrap

Bootstrap creates the S3 bucket, ECR repository, and IAM roles CDK needs to
deploy. It is itself infrastructure, and it is the one thing CDK cannot create
for itself.

- [ ] **Generate the template locally:** `cdk bootstrap --show-template >
      bootstrap-template.yaml`. This prints the template and contacts nothing —
      it needs no AWS credentials, which is what makes it usable under ADR-5.
- [x] **Decide what the CloudFormation execution role may do.** Settled in
      [ADR-7](adr/0007-bootstrap-execution-role-stays-admin.md): the default
      `AdministratorAccess` is accepted and recorded, to be narrowed at the end of
      M3 when the service list can be read off deployed stacks rather than
      guessed. Deploy the template unmodified.
- [ ] **Deploy it as the `CDKToolkit` stack** in the CloudFormation console, with
      `CAPABILITY_NAMED_IAM`. The stack name matters: CDK looks for exactly
      `CDKToolkit`.

> **Know what you accepted.**
>
> `cfn-exec-role` is the role **CloudFormation** assumes to create your
> resources — not the role CI holds. With `AdministratorAccess` on it, whatever a
> stack describes gets built, with no permission boundary to stop an accidental
> IAM role or a resource in an unexpected service.
>
> ADR-7 records why that is accepted here and what would change it. The failure
> this guards against is not the permission itself but forgetting it, and later
> believing the deploy path is least-privilege when it is not.

**Stop condition:** a workflow on `main` assumes the deploy role, assumes the CDK
roles in turn, and runs `cdk diff` against a real account with no stored
credentials.

---

## Known limits of this setup

Not open questions — decided, with consequences worth keeping in view.

**Fork pull requests get no plan.** Repository secrets are not exposed to
workflows triggered by pull requests from forks, so the role ARN stored in Phase 4
is empty on exactly those runs and the `cdk diff` job cannot authenticate. On a
single-maintainer repo this never fires. It is a reason not to build process
around the diff job, and a thing to remember if the repo ever takes outside
contributions.

**Adopting a GitHub Environment would break every deploy.** An Environment
changes the OIDC `sub` claim to `repo:<owner>/<repo>:environment:<name>` — it
stops being a ref-based claim at all. Because Phase 4 pins `sub` with
`StringEquals`, adding one without rewriting the trust policy makes every deploy
fail `AssumeRoleWithWebIdentity`, and the error does not point at the Environment
as the cause. Worth knowing before reaching for required-approval gates.

**Two roles now share one template, and only one of them is safe to widen.** The
deploy role and the read-only PR role differ by their `sub` claim and their
permissions. Loosening the PR role's `sub` to a wildcard, or granting it the
deploy role's `sts:AssumeRole` target, silently converts a review mechanism into
a deployment path triggerable by any pull request.
