# Rules Keeper — Dot setup

Dots are configured in ChatGPT, not by API, so this file records the exact settings. If
you change a setting in ChatGPT, change it here in the same week.

| Setting | Value |
|---|---|
| Plan | ChatGPT Pro (the founder's account) |
| Name | Rules Keeper |
| Goal | The full contents of `packages/rules/dot/goal.md` at the commit noted below |
| Connector | GitHub, authorized for `ifaemuh/elsewhere` (read and write) and `ifaemuh/elsewhere-sources-versions` (read) |
| Connector identity | **Record at creation:** the GitHub account or app the connector authenticates as: `__________`. Date checked: `__________` |
| Connector scopes | **Confirm at creation:** the token has no `workflows` permission (it cannot create or edit `.github/workflows/**`) and no admin, secrets, or settings permission. Date checked: `__________` |
| Web access | `www.federalregister.gov` |

**Custom Rules**

| Allow | Require approval | Prohibit |
|---|---|---|
| Read both repositories | Any change to `packages/rules/sources.yaml` or `packages/rules/ota-overrides.yaml` | Merging pull requests |
| Create branches named `rules/refresh-*` in `ifaemuh/elsewhere` | Any change outside `packages/rules/data/` | Pushing to `main` |
| Commit to its own `rules/refresh-*` branches | | Deleting branches it didn't create |
| Open pull requests from those branches to `main`, and comment on them | | Any other repository |
| Open or comment on issues labelled `rules-watch` | | Repository settings, secrets, or workflows |
| Fetch the Federal Register API | | |
| | Any edit to a `verified_by` or `last_verified` line | Force-pushing |
| | | Enabling auto-merge |
| | | Approving pull requests |
| | | Closing pull requests it didn't open |
| | | Editing labels other than applying `rules-watch` to its own issues |

**Server-side guards (founder)**

The prompt and Custom Rules are soft limits. These repository settings are the hard ones.
**Set them up first, and only then give the Dot write access.** Order: protection, then the Dot.

- **Plan requirement.** Branch protection and rulesets on a private repository need GitHub
  Pro (or higher). If `ifaemuh/elsewhere` is private, upgrade before anything else; without
  it none of the guards below exist and the Dot must not get write access.
- **Rule for `main`** (a ruleset, or classic branch protection): require a pull request,
  require the status check, and allow no direct pushes. In the check picker the check
  appears as `rules` (job name), shown on PRs as "Rules CI / rules". **Untick "Require
  approvals"**: a solo founder cannot approve their own PR, and approval is not the control
  here; the founder's merge is.
- **Restrict who can update `main` with a ruleset** whose bypass list contains only the
  founder. That is the real mechanism for keeping the Dot from merging: the Dot's
  connector identity is not on the bypass list. Do not tick any option that lets
  administrators skip the rule ("Do not allow bypassing the above settings" for classic
  protection).
- Auto-merge stays disabled for the repository.

These guards stop the Dot from landing code on `main` unreviewed and from pushing to it.
They do not stop a merge by the identity recorded above. If the connector authenticates as
the founder's own account, "Merging pull requests" in the table is a soft limit only: the
founder's token is on the bypass list and can merge. To make it hard, authorize the
connector as a separate GitHub account or app that is not on the bypass list, and name it
in the identity row. The connector's write access to `ifaemuh/elsewhere` is the residual
risk.

**Connector permissions.** Contents and pull requests read/write on `ifaemuh/elsewhere`;
issues read/write. No `workflows`, no Actions write, no admin, secrets, or settings.

**Token design for Actions (recommended).** `SOURCES_REPOS_TOKEN` is a write-capable token.
Use two: a read-only token (contents read on `elsewhere-sources-versions`) for `rules-ci`
and `rules-backstop`, and the write token stored as a secret of a GitHub Environment
restricted to the `main` branch, used only by `sources-track`.

**CI access.** PRs the Dot opens must run Rules CI with access to `SOURCES_REPOS_TOKEN`.
A same-repo branch pushed through the founder-authorized connector does. A fork would not.
