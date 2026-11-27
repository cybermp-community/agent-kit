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

## Layout

| Path | Contents |
|---|---|
| `packages/agent-kit` | CLI, MCP server, runtime data, skills, rules, templates |
| `packages/bridge` | Bridge library |
| `resources/mcp-bridge` | Private resource template and build |
| `docs/` | Audits and design notes |

`pnpm run build:index` regenerates the shipped knowledge index from the checked-in guide summaries, kit references and locked type packages. `pnpm run sync:docs` fetches the pinned upstream guide snapshot for comparison. Release builds use the checked-in indices.
