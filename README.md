# Amplop

Allowance envelopes on Monad. The full README comes with spec 18; the specs are in [`specs/`](specs/00-index.md).

## Set up

```
nvm use            # Node 24, see .nvmrc
npm ci             # also installs the git hooks
npm run generate   # forge build + ABI into packages/shared
npm run test:contracts
```

Local chain: `npm run chain:up` in one terminal, `npm run deploy:local` in another.
