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

## Releases

One tag releases both public packages: the bridge is published first, then the
CLI, which pins that bridge version. Both packages share one version, and the
tag must match it.

```bash
# stable: 2.1.0
pnpm --dir packages/bridge pkg set version=2.1.0
pnpm --dir packages/agent-kit pkg set version=2.1.0
pnpm pkg set version=2.1.0
git commit -am "chore(release): 2.1.0"
git tag v2.1.0 && git push origin main v2.1.0
```

A prerelease follows the same steps with a semver suffix, for example
`2.1.0-beta.1` and tag `v2.1.0-beta.1`. Prereleases are published under the
`beta` dist-tag; asking for `latest` with a prerelease version fails the
release, so `npm install @cybermp-community/agent-kit` keeps resolving to the
last stable release while `npm install @cybermp-community/agent-kit@beta`
picks the beta.

`workflow_dispatch` runs the same pipeline for an existing tag and accepts both
`tag` and `dist-tag`, which is how a version is republished under another tag or
recovered after a partial failure: a rerun skips what is already published with
the same number and continues with the rest.

Publishing uses npm trusted publishing: the release job requests a short-lived
OIDC token and npm exchanges it for a credential for the package, so no
long-lived write token is stored in the repository.

1. Publish the first version of each package yourself with `npm login` and
   `npm publish`, since npm only offers trusted publishing for a package that
   already exists.
2. On npmjs.com open the package settings, add a trusted publisher for GitHub
   Actions: organization `cybermp-community`, repository `agent-kit`, workflow
   `release.yml`. Do the same for the bridge package.
3. Set the repository variable `NPM_PUBLISH` to `true`
   (Settings → Secrets and variables → Actions → Variables) and tag a release.

While `NPM_PUBLISH` is unset, a tag still runs the tests, builds and verifies
both tarballs and attaches them to the GitHub release, so a release can be
prepared before the registry access exists.
