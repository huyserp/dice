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
