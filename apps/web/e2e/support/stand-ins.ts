// The local stand-ins (19 S19-8, S19-9, S19-13): Midtrans (the bank, the one thing PRD 14 lets us
// fake besides the clock), the block explorer, and two RPC proxies a test can switch to fail.
// Tests steer them through POST /__control on each.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export const PORTS = { midtrans: 4010, explorer: 3999, serverRpc: 8546, browserRpc: 8547 } as const;
export const ANVIL = "http://127.0.0.1:8545";

function body(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let s = "";
    req.on("data", (c: Buffer) => (s += c.toString()));
    req.on("end", () => {
      resolve(s);
    });
  });
}

function json(
  res: ServerResponse,
  status: number,
  value: unknown,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(value));
}

function listen(
  port: number,
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>,
): Promise<Server> {
  const server = createServer((req, res) => {
    handler(req, res).catch(() => {
      json(res, 500, { error: "stand-in failed" });
    });
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () => {
      resolve(server);
    }),
  );
}

/** Midtrans Core API: charge, status, and a control route to set an order's status (S19-9). */
export function midtrans(): Promise<Server> {
  const orders = new Map<string, { gross: string; status: string }>();
  let va = 8_127_850_000_000;
  return listen(PORTS.midtrans, async (req, res) => {
    const url = req.url ?? "";
    if (req.method === "POST" && url === "/__control") {
      const { orderId, status } = JSON.parse(await body(req)) as {
        orderId: string;
        status: string;
      };
      const o = orders.get(orderId);
      if (o) o.status = status;
      json(res, o ? 200 : 404, { ok: Boolean(o) });
      return;
    }
    if (req.method === "POST" && url === "/v2/charge") {
      const b = JSON.parse(await body(req)) as {
        transaction_details: { order_id: string; gross_amount: number };
      };
      const id = b.transaction_details.order_id;
      orders.set(id, {
        gross: `${String(b.transaction_details.gross_amount)}.00`,
        status: "pending",
      });
      const now = new Date(Date.now() + 7 * 3600_000).toISOString().replace("T", " ").slice(0, 19);
      json(res, 201, {
        status_code: "201",
        transaction_status: "pending",
        transaction_time: now,
        va_numbers: [{ bank: "bca", va_number: String(va++) }],
      });
      return;
    }
    const m = /^\/v2\/([0-9a-f]{32})\/status$/.exec(url);
    if (req.method === "GET" && m?.[1]) {
      const o = orders.get(m[1]);
      if (!o) {
        json(res, 200, { status_code: "404", status_message: "not found" });
        return;
      }
      json(res, 200, {
        order_id: m[1],
        status_code: o.status === "settlement" ? "200" : "201",
        gross_amount: o.gross,
        transaction_status: o.status,
        payment_type: "bank_transfer",
      });
      return;
    }
    json(res, 404, {});
  });
}

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const r = await fetch(ANVIL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return ((await r.json()) as { result: unknown }).result;
}

/** Answers 200 for a transaction Anvil knows, else 404 (S19-13 step 4). */
export function explorer(): Promise<Server> {
  return listen(PORTS.explorer, async (req, res) => {
    const m = /^\/tx\/(0x[0-9a-f]{64})$/.exec(req.url ?? "");
    const tx = m?.[1] ? await rpc("eth_getTransactionByHash", [m[1]]) : null;
    res.writeHead(tx ? 200 : 404, { "content-type": "text/html" });
    res.end(tx && m?.[1] ? `<html><body>${m[1]}</body></html>` : "not found");
  });
}

/** Forwards JSON-RPC to Anvil; `mode` "down" refuses every call (E21), "429" rate-limits (L5). */
export function rpcProxy(port: number): Promise<Server> {
  let mode: "ok" | "down" | "429" = "ok";
  return listen(port, async (req, res) => {
    const cors = {
      "access-control-allow-origin": "*",
      // Each profile sends its own x-real-ip on every request (fixtures.ts).
      "access-control-allow-headers": "content-type, x-real-ip",
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      return res.end();
    }
    const text = await body(req);
    if (req.url === "/__control") {
      mode = (JSON.parse(text) as { mode: typeof mode }).mode;
      json(res, 200, { mode });
      return;
    }
    if (mode === "down") {
      json(res, 503, { error: "down" }, cors);
      return;
    }
    if (mode === "429") {
      json(res, 429, { error: "rate limited" }, cors);
      return;
    }
    const r = await fetch(ANVIL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Anvil puts "finalized" 64 blocks back and automine adds none, so treat latest as final like Monad.
      body: text.replaceAll('"finalized"', '"latest"'),
    });
    res.writeHead(r.status, { "content-type": "application/json", ...cors });
    res.end(await r.text());
  });
}

/** Steer a stand-in from a test. */
export async function control(port: number, value: unknown): Promise<void> {
  // No stand-in on testnet: the real service answers instead.
  await fetch(`http://127.0.0.1:${String(port)}/__control`, {
    method: "POST",
    body: JSON.stringify(value),
  }).catch(() => undefined);
}
