// Starts the local stack once for the run and returns its teardown (19 S19-7 to S19-9). With BASE_URL
// set to a deployed app (smoke and testnet runs), nothing local is started.
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import { logLeaks } from "./support/log-scan";
import { explorer, midtrans, PORTS, rpcProxy } from "./support/stand-ins";
import {
  appEnv,
  deployment,
  startAnvil,
  startApp,
  startIndexer,
  stopIndexer,
  WEB,
} from "./support/stack";

export default async function globalSetup(): Promise<() => Promise<void>> {
  if (process.env.BASE_URL && !process.env.BASE_URL.includes("localhost"))
    return () => Promise.resolve();
  const anvil = await startAnvil();
  const servers: Server[] = await Promise.all([
    midtrans(),
    explorer(),
    rpcProxy(PORTS.serverRpc),
    rpcProxy(PORTS.browserRpc),
  ]);
  const indexer = process.env.E2E_NO_INDEXER ? null : await startIndexer();
  const app = await startApp(appEnv(deployment()));
  return async () => {
    app.kill();
    if (indexer) stopIndexer(indexer);
    anvil.kill();
    await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
    const leaks = logLeaks(readFileSync(`${WEB}test-results/server.log`, "utf8"));
    if (leaks.length) throw new Error(`SEC3: test-results/server.log contains ${leaks.join(", ")}`);
  };
}
