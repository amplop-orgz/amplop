# Amplop: notes for AI agents

Read `specs/00-index.md` and `specs/01-conventions.md` first, then the spec you are building.

## Commit rule

> Never one big commit. Commit after each finished piece (a feature plus its tests), about every 30–90 minutes, and push at least once a day. Never squash the history or force-push `main`. Messages follow `type(area): what changed`, for example `feat(card): decline gambling purchases`. Self-audit fixes name their finding: `fix(contract): cap skipDays (SA-03)`. Every commit passes the pre-commit hook, so `main` is always deployable. The same rule applies when an AI agent makes the commits.

- Never pass `--no-verify`. Never force-push. Never squash.
- Run `npm ci` once so the git hooks are installed before your first commit.

## Skills

- Use the pinned skills in `.claude/skills/`. If they are missing, run `scripts/install-ai-skills.sh`.
- Never update the skills during the freeze: no "update skills to latest version", no `/plugin update`, no `npx skills add` without a commit.
- Where a skill disagrees with a spec, the spec wins. Where a skill disagrees with the PRD, the PRD wins.

## Secrets

Never put a value from `.env.local` (or any other env file) in a file, log, commit or message.
