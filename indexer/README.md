# Amplop indexer

An [Envio HyperIndex](https://docs.envio.dev) project (spec 16) that turns every `AmplopEnvelopes` event on Monad testnet into five entities and serves them through one public, read-only GraphQL endpoint.

| Entity             | What it is for                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `Account`          | Owner, trusted person, split, lock and skipped days. Also points at each account's newest open alert of a kind.  |
| `Deposit`          | One row per allowance, with the five envelope parts. Weekly release rows are computed by the app from `parts`.   |
| `Purchase`         | Card purchases from approval or decline to collect, release, refund and move. No shop names: those stay private. |
| `EmergencyRequest` | Each request and how it ended (approved, opened by time, cancelled). The reason text stays on the server.        |
| `Alert`            | What the trusted person sees on parent home (R26), addressed to the trusted person at the time of the event.     |

## Alert rules

- An alert is stored only when the account has a trusted person, and belongs to that person. A replaced trusted person keeps their old alerts; the new one starts empty.
- Kinds: Emergency requested, blocked purchase (category only), purchase moved (envelope names only), split saved with a wait, lock-off started, trusted removal started, recovery approved.
- A second waiting split or recovery marks the first `Replaced`. Finishing marks it `Done`, cancelling `Cancelled`.
- No alert holds a purchase id, a purchase amount, a new owner address or any text. The low-envelope warning is computed in the parent's app from contract totals and never stored.

## Core flows never depend on it

Balances, totals, the release schedule, the open Emergency request, card results and account lookup come from the contract. The app reads only history from here and treats the indexer as behind when a call fails or takes over 4 s, `isReady` is false, or it is more than 30 blocks behind the chain head. Then Activity says "History is catching up" and everything else keeps working.

## Run it

The indexer is its own pnpm project (Envio v3 installs with pnpm during codegen); `rescript` and `esbuild` are the only dependencies allowed to run build scripts (`pnpm-workspace.yaml`).

```bash
cd indexer
pnpm install --frozen-lockfile
pnpm codegen          # after any schema.graphql or config.yaml change
pnpm check            # ABI copy, address, start block, events and handlers
pnpm typecheck
pnpm test             # handler tests U1-U20 with simulated events
pnpm abi:sync         # after the contract ABI changes
```

`pnpm dev` runs the indexer against Monad testnet (Docker; set `ENVIO_API_TOKEN` for HyperSync) and serves GraphQL on `http://localhost:8080/v1/graphql`. Against a local Anvil deployment: `pnpm e2e:config`, then `pnpm exec envio dev --config config.e2e.yaml`.

## Deployment

- Chain: Monad testnet (10143), contract `0x5596Bf1014EC25F760e8976f1DD8a40Ee250c56C`, start block `70137747` (from `deployments/monad-testnet.json`).
- Envio Cloud endpoint: set once the deployment is promoted (spec 16 S16-15).

Files for the Envio bounty: [`config.yaml`](config.yaml), [`schema.graphql`](schema.graphql), [`src/handlers/`](src/handlers/).
