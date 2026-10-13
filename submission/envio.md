# Envio bounty entry

Spec 20 S20-9, the materials from 16 S16-19. Links point at the submission tag once it exists.

## Indexer

- Config: [`indexer/config.yaml`](https://github.com/amplop-orgz/amplop/blob/main/indexer/config.yaml), start block 70137747 on Monad testnet (chain 10143).
- Schema: [`indexer/schema.graphql`](https://github.com/amplop-orgz/amplop/blob/main/indexer/schema.graphql)
- Handlers: [`indexer/src/handlers/`](https://github.com/amplop-orgz/amplop/blob/main/indexer/src/handlers)
- GraphQL endpoint: `https://hasura-production-1503.up.railway.app/v1/graphql` (`NEXT_PUBLIC_INDEXER_URL`). The same HyperIndex project runs self-hosted from [`indexer/Dockerfile`](https://github.com/amplop-orgz/amplop/blob/main/indexer/Dockerfile) with Postgres and Hasura, syncing through HyperSync, because the Envio Cloud org could not link the GitHub repo on 13 Oct.

## The parent's alerts

The query is `AlertsForTrustedQuery` in [`packages/shared/src/indexer/queries.ts`](https://github.com/amplop-orgz/amplop/blob/main/packages/shared/src/indexer/queries.ts).

Screenshot: **To fill** `apps/docs/src/assets/envio-alerts-query.png`, the parent's alerts next to this query and its result.

```graphql
query AlertsForTrusted($accountId: numeric!, $trusted: String!, $limit: Int!) {
  Alert(
    where: { accountId: { _eq: $accountId }, trusted: { _eq: $trusted } }
    order_by: { sortKey: desc }
    limit: $limit
  ) {
    id
    accountId
    trusted
    kind
    status
    statusAt
    statusTx
    amount
    requestSeq
    shopType
    fromEnvelope
    toEnvelope
    split
    readyAt
    blockNumber
    logIndex
    sortKey
    timestamp
    accountClock
    txHash
  }
}
```

## Design

The indexer builds Activity and the parent's alerts from the contract's events. Balances, totals and card results come from the contract itself, so the app keeps working when the indexer is behind.
