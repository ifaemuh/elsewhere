# Rules Keeper — Dot setup

Dots are configured in ChatGPT, not by API, so this file records the exact settings. If
you change a setting in ChatGPT, change it here in the same week.

| Setting | Value |
|---|---|
| Plan | ChatGPT Pro (the founder's account) |
| Name | Rules Keeper |
| Goal | The full contents of `packages/rules/dot/goal.md` at the commit noted below |
| Connector | GitHub, authorized for `ifaemuh/elsewhere` (read and write) and `ifaemuh/elsewhere-sources-versions` (read) |
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
