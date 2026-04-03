# k-skill repository instructions

This repository inherits the broader oh-my-codex guidance from the parent environment.
These rules are repo-specific and apply to everything under this directory.

## Release automation rules

- Node packages live under `packages/*` and use npm workspaces.
- Node package releases use **Changesets**. Do not hand-edit package versions only to cut a release; add a `.changeset/*.md` file instead.
- npm publish is automated from GitHub Actions and should happen only after the bot-generated **Version Packages** PR is merged into `main`.
- Python packages live under `python-packages/*` and use **release-please**. Until a real Python package exists, keep the Python release workflow as scaffold-only.
- PyPI publish should run only when release-please reports `release_created=true` for a concrete package path.
- Prefer trusted publishing via OIDC for npm and PyPI. Do not introduce long-lived registry tokens unless trusted publishing is unavailable.

## Verification rules

- For release or packaging changes, run `npm run ci`.
- Keep release docs, workflow files, and package metadata aligned in the same change.

## Testing anti-patterns

- **Never write tests that assert `.changeset/*.md` files exist.** Changesets are consumed (deleted) by `changeset version` during the release flow. Any test guarding changeset file presence will break CI on the version-bump commit and block the release pipeline.

## Development skill install rules

- When testing or developing skills from this repository, install or sync the current skill directories into the user's home-directory global skill locations first.
- Use `~/.claude/skills/<skill-name>` for Claude Code and `~/.agents/skills/<skill-name>` for agents-compatible home installs.
- Respect existing home-directory indirection such as symlinks when syncing `~/.agents/skills`.
- Do **not** create repo-local `.claude` or `.agents` directories for skill installation unless the user explicitly asks for a repository-local test fixture.

## Free API proxy policy

- The built-in `k-skill-proxy` is for **free APIs only**.
- Default posture: public read-only endpoint, **no proxy auth by default**.
- Keep free-API proxy surfaces narrow, allowlisted, cache-backed, and rate-limited.
- If abuse or operational issues appear later, add stricter controls then instead of preemptively requiring auth.
