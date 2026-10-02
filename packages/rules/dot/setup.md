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

The prompt and Custom Rules are soft limits. These repository settings are the hard ones:

- Branch protection on `main` in `ifaemuh/elsewhere`: require a pull request and the
  `Rules CI / rules` status check, allow no direct pushes, and tick **Do not allow
  bypassing the above settings** (otherwise repository admins, including the founder's own
  token, skip all of it).
- Auto-merge stays disabled for the repository.

These guards stop the Dot from landing code on `main` unreviewed and from pushing to it.
They do not stop a merge by the identity recorded above. If the connector authenticates as
the founder's own account, "Merging pull requests" in the table is a soft limit only: the
founder's token can merge a PR whose CI is green, and the Dot cannot be stopped from doing
so by anything on GitHub's side. If that matters, authorize the connector as a separate
GitHub account or app with write access but not merge rights, and name it in the identity
row. The connector's write access to `ifaemuh/elsewhere` is the residual risk.

**CI access.** PRs the Dot opens must run Rules CI with access to `SOURCES_REPOS_TOKEN`.
A same-repo branch pushed through the founder-authorized connector does. A fork would not.
