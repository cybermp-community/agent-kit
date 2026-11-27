# Contributing

Contributions are welcome. See [CONTRIBUTORS.md](CONTRIBUTORS.md) for attribution.

## Before a pull request

Run the checks that CI runs:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm run build
pnpm run check:examples
pnpm run test:packed
```

## Pull requests

`main` is protected: direct pushes and force pushes are rejected, and every
change lands through a pull request. A pull request merges only when it has one
approval, the branch is up to date with `main` and the three CI jobs pass
(`Public packages` on Node 22 and 26, `Resource template` on Node 22).
Organization owners bypass the approval requirement, so a maintainer merges
their own pull request once CI is green. Merging is squash-only, so the pull
request title becomes the commit on `main` — write it as a Conventional Commit
(`fix:`, `feat:`, `docs:`, `chore:`, with `!` for a breaking change).

Branches are named `<type>/<kebab-topic>`, for example
`fix/bridge-reconnect-race`. Keep a branch to one concern; unrelated cleanups
belong in their own pull request.

## Layout

| Path | Contents |
|---|---|
| `packages/agent-kit` | CLI, MCP server, runtime data, skills, rules, templates |
| `packages/bridge` | Bridge library |
| `resources/mcp-bridge` | Private resource template and build |
| `docs/` | Audits and design notes |

`pnpm run build:index` regenerates the shipped knowledge index from the checked-in guide summaries, kit references and locked type packages. `pnpm run sync:docs` fetches the pinned upstream guide snapshot for comparison. Release builds use the checked-in indices.
