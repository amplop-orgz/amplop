# Contributing

## Commit rule

> Never one big commit. Commit after each finished piece (a feature plus its tests), about every 30–90 minutes, and push at least once a day. Never squash the history or force-push `main`. Messages follow `type(area): what changed`, for example `feat(card): decline gambling purchases`. Self-audit fixes name their finding: `fix(contract): cap skipDays (SA-03)`. Every commit passes the pre-commit hook, so `main` is always deployable. The same rule applies when an AI agent makes the commits.

The `commit-msg` hook and the CI job `commits` check the first line against:

```
^(feat|fix|test|docs|chore|refactor|ci|build|perf|style|revert)\([a-z0-9-]+\): [^\s].{0,98}( \(SA-\d{2}\))?$
```

## Repository settings checklist (set on GitHub on setup day)

- [ ] Ruleset on `main`: block force pushes, block deletion. Direct pushes by the owner allowed.
- [ ] Merge options: merge commits only. Squash merging and rebase merging off.
- [ ] Private vulnerability reporting on.
- [ ] Dependabot alerts and Dependabot security updates on. Secret scanning and push protection on.
- [ ] Code scanning: CodeQL advanced setup (`ci.yml`), default setup off.
- [ ] Actions permissions: "Read repository contents" by default.
- [ ] Secret `DEPENDABOT_READ_TOKEN`: fine-grained token, this repository only, "Dependabot alerts: read".

## Vet before adding a package

Before adding any npm package, check: weekly downloads (above 10,000, or published by an organisation already trusted in the lockfile), number and age of maintainers, linked source repository, last publish date, install scripts, licence (MIT, Apache-2.0, BSD-2/3-Clause, ISC, 0BSD, OFL for fonts). The commit that adds it carries a body line:

```
vetted: <name>@<version> downloads=<n> maintainers=<n> scripts=<none or which> licence=<id>
```

Versions are exact (`save-exact=true`), and CI installs with `npm ci` only. A package with an install script must be listed in `tools/allowed-install-scripts.json` with a reason.

## Deploys

Production deploys only from CI, after every gate is green. A manual production deploy from a laptop is not allowed.
