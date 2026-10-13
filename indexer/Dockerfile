# Self-hosted indexer: the same config.yaml Envio Cloud would run, beside its own Postgres and Hasura
# (hasura/graphql-engine v2.43.0, as `envio dev` uses). Built and run by Railway from ./indexer.
FROM node:24.21.0-slim
# The HyperSync client checks TLS against the system roots, which the slim image leaves out.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.11.2
WORKDIR /indexer
COPY . .
RUN pnpm install --frozen-lockfile && pnpm codegen
# No terminal UI in a container; plain logs instead.
ENV TUI_OFF=true
# envio configures Hasura only when it first creates its tables, so wait until Hasura answers.
CMD ["sh", "-c", "until node -e 'fetch(new URL(\"/healthz\", process.env.HASURA_GRAPHQL_ENDPOINT)).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))'; do echo waiting for hasura; sleep 3; done; exec pnpm start"]
