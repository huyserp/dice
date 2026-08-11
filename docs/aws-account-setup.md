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

- [ ] **Create the account with a dedicated email address.** An alias like
      `aws+dice@yourdomain` works. The address becomes the root user identity and
      cannot be reused for another AWS account, so a personal inbox address you
      might one day want for a second account is a bad choice.
- [ ] **Root password: long, random, in a password manager.** It should be
      inconvenient to type, because you should almost never type it.
- [ ] **Enable MFA on root.** Hardware key if you have one, TOTP otherwise.
- [ ] **Do not create root access keys.** If any exist, delete them. There is no
      legitimate use for a long-lived root key, and it is the single credential
      that cannot be scoped, revoked per-service, or audited meaningfully.
- [ ] **Set an account alias** so the sign-in URL is readable.
- [ ] **Fill in alternate contacts** (billing, operations, security). These are
      where AWS writes when something is wrong and you are not reading the console.

**Stop condition:** root is MFA-protected and has no access keys.

---

## Phase 1 — Spend guardrails, before anything is deployable

This phase comes before identity setup deliberately. The window where an account
exists and has no billing alarm is the window where a mistake is invisible.

- [ ] **Enable IAM access to billing data** (Account settings → IAM user and role
      access to billing information). Off by default; without it, non-root
      identities cannot see costs at all.
- [ ] **Create a monthly budget** with alerts at 50%, 80%, and 100% of a figure
      you would be annoyed to spend. Add a *forecasted* alert as well as actual —
      forecast warns you mid-month, actual tells you afterwards.
- [ ] **Enable Cost Anomaly Detection** with an email subscription. It catches the
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
account, changing the support plan, some billing settings). Daily work uses a
separate identity.

- [ ] **Enable IAM Identity Center.** This is the current mechanism; standalone
      IAM users with long-lived access keys are the legacy path and are what "no
      long-lived AWS keys" in `CLAUDE.md` refers to.
- [ ] **Create an administrative permission set** and assign yourself to the
      account through it.
- [ ] **Require MFA** on that user.
- [ ] **Configure the CLI:** `aws configure sso`. This yields short-lived
      credentials refreshed by `aws sso login` — no key material on disk.
- [ ] **Stop using root.** Sign out and use the Identity Center URL from here on.

**Stop condition:** `aws sts get-caller-identity` returns your Identity Center
role, and no access key exists anywhere on your machine.

---

## Phase 3 — Two decisions to make before bootstrapping

Both are cheap now and disruptive later. Each deserves an ADR.

- [ ] **Region.** `us-east-1` is cheapest, gets services first, and is required
      for a few global things (CloudFront certificates, for one). It is also the
      busiest region and the one whose outages make the news. `us-east-2` is a
      common default for this reason. Aurora Serverless v2 is available in both.
      Pick one and put it in an ADR — moving an Aurora cluster between regions
      later is a migration, not a config change.

- [ ] **One account or several.** The disciplined answer is an Organization with
      separate accounts for dev and prod, so a mistake in one cannot touch the
      other. The honest answer for a single-developer project is that it doubles
      the setup and the Identity Center configuration. A defensible middle path is
      one account now with stack-level separation, recorded in an ADR as a known
      compromise with the trigger for revisiting it stated.

**Stop condition:** two ADRs written, region fixed.

---

## Phase 4 — CDK bootstrap

- [ ] **`cdk bootstrap aws://<account-id>/<region>`.** This creates the S3 bucket,
      ECR repo, and IAM roles CDK needs to deploy. It is itself infrastructure,
      and it is the one piece that cannot be created by CDK.

> **Read the bootstrap roles before accepting them.**
>
> By default, bootstrap creates a CloudFormation execution role with
> `AdministratorAccess`. That is precisely the "generated policy you did not write
> by hand" that `CLAUDE.md` says to assume is wrong. It is defensible for a
> personal account and indefensible in a shared one.
>
> `--cloudformation-execution-policies` overrides it. Scoping it properly means
> enumerating every service the stacks touch, which is real work and is easier
> once the stacks exist. Either scope it now, or accept the default *and write
> down that you did* — the failure mode is accepting it silently and later
> believing the deploy role is least-privilege.

**Stop condition:** `cdk bootstrap` succeeded, and the execution policy is either
scoped or consciously deferred in writing.

---

## Phase 5 — GitHub OIDC

- [ ] **Register the OIDC identity provider** in IAM, for
      `token.actions.githubusercontent.com`.
- [ ] **Create the deploy role** with a trust policy pinning both claims:

      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      "token.actions.githubusercontent.com:sub": "repo:<owner>/<repo>:ref:refs/heads/main"

      Use `StringEquals`, not `StringLike`. A trust policy carrying `aud` but no
      `sub` condition permits *any* GitHub repository to assume the role — it is
      the highest-consequence mistake in this document.
- [ ] **Store the role ARN as a repository secret.** An ARN is an identifier, not
      a credential, and in a private repo a plain variable would be the better
      choice — visible in logs, which helps when a deploy fails. This repo is
      public, and so are its workflow logs. An ARN contains the account ID, so a
      variable would publish it on every run. A secret gets masked. The cost is
      slightly worse debugging; the alternative is publishing the account ID
      permanently.
- [ ] **Grant `id-token: write`** in the workflow, per job that needs it, never at
      workflow top level.

**Stop condition:** a workflow on `main` assumes the role and runs `cdk diff`
against a real account with no stored credentials.

---

## What this leaves open

Pinning `sub` to `refs/heads/main` means pull requests cannot assume the role, so
a PR cannot show a real `cdk diff` — infrastructure gets reviewed without seeing
its plan. The usual resolutions are a second read-only role scoped to
`pull_request`, or a GitHub Environment with required approval. Worth deciding
deliberately rather than discovering at the first infrastructure PR.
