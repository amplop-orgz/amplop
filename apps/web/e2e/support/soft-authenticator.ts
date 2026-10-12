// 19 S19-4: a software passkey for WebKit, which has no virtual authenticator in Playwright. It answers
// navigator.credentials.create and get for public keys with discoverable credentials and the PRF
// extension (HMAC-SHA-256 of the salt with a per-credential secret, so one passkey always gives one
// account). Mera reads only rawId, the PRF result and the transports. Where the engine has no WebAuthn
// at all (Linux WebKit), it also supplies PublicKeyCredential and navigator.credentials. Credentials live on the Node
// side per profile, never in page storage, so they survive reloads.
import type { BrowserContext } from "@playwright/test";

type Cred = { id: string; secret: string; rpId: string };

export async function installSoftAuthenticator(context: BrowserContext) {
  const creds: Cred[] = [];
  let failNext = false;
  await context.exposeBinding("__amplopSoftAuth", (_source, op: string, arg: unknown) => {
    if (failNext) {
      failNext = false;
      return { error: "NotAllowedError" };
    }
    if (op === "create") {
      const c = arg as Cred;
      creds.push(c);
      return c;
    }
    const { allow, rpId } = arg as { allow: string[]; rpId: string };
    const found = allow.length
      ? creds.find((c) => allow.includes(c.id))
      : creds.filter((c) => c.rpId === rpId).at(-1);
    return found ?? { error: "NotAllowedError" };
  });
  await context.addInitScript(() => {
    type Bind = (
      op: string,
      arg: unknown,
    ) => Promise<{ id: string; secret: string; error?: string }>;
    const bind = (window as unknown as { __amplopSoftAuth: Bind }).__amplopSoftAuth;
    const hex = (b: ArrayBuffer | Uint8Array) =>
      Array.from(new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b)), (x) =>
        x.toString(16).padStart(2, "0"),
      ).join("");
    const bytes = (h: string) => new Uint8Array(h.match(/../g)?.map((x) => parseInt(x, 16)) ?? []);
    const buf = (s: BufferSource) =>
      s instanceof ArrayBuffer
        ? new Uint8Array(s)
        : new Uint8Array(s.buffer, s.byteOffset, s.byteLength);
    async function prf(secret: string, salt: BufferSource | undefined) {
      if (!salt) return undefined;
      const key = await crypto.subtle.importKey(
        "raw",
        bytes(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      return crypto.subtle.sign("HMAC", key, buf(salt));
    }
    function credential(id: string, results: ArrayBuffer | undefined, created: boolean) {
      const raw = bytes(id).buffer;
      return {
        type: "public-key",
        id,
        rawId: raw,
        authenticatorAttachment: "platform",
        response: { clientDataJSON: new ArrayBuffer(0), getTransports: () => ["internal"] },
        getClientExtensionResults: () => ({
          prf: {
            ...(created ? { enabled: true } : {}),
            ...(results ? { results: { first: results } } : {}),
          },
        }),
      };
    }
    const fail = () =>
      Promise.reject(new DOMException("The operation was cancelled.", "NotAllowedError"));
    type Container = {
      create?: (o?: CredentialCreationOptions) => Promise<Credential | null>;
      get?: (o?: CredentialRequestOptions) => Promise<Credential | null>;
    };
    // Linux WebKit (CI) is built without WebAuthn: give it the API surface the app checks for.
    let creds: Container;
    if (typeof CredentialsContainer === "undefined") {
      creds = {};
      Object.defineProperty(navigator, "credentials", { value: creds, configurable: true });
    } else creds = CredentialsContainer.prototype;
    if (!("PublicKeyCredential" in window))
      Object.defineProperty(window, "PublicKeyCredential", {
        value: {}, // the app only checks it exists and calls the two methods set below
        configurable: true,
        writable: true,
      });
    const nativeCreate = creds.create ?? (() => Promise.resolve(null));
    const nativeGet = creds.get ?? (() => Promise.resolve(null));
    Object.defineProperty(creds, "create", {
      configurable: true,
      writable: true,
      value: async (options?: CredentialCreationOptions) => {
        const pk = options?.publicKey;
        if (!pk) return nativeCreate.call(navigator.credentials, options);
        const c = await bind("create", {
          id: hex(crypto.getRandomValues(new Uint8Array(16))),
          secret: hex(crypto.getRandomValues(new Uint8Array(32))),
          rpId: pk.rp.id ?? location.hostname,
        });
        if (c.error) return fail();
        const salt = (pk.extensions as { prf?: { eval?: { first?: BufferSource } } } | undefined)
          ?.prf?.eval?.first;
        return credential(c.id, await prf(c.secret, salt), true) as unknown as Credential;
      },
    });
    Object.defineProperty(creds, "get", {
      configurable: true,
      writable: true,
      value: async (options?: CredentialRequestOptions) => {
        const pk = options?.publicKey;
        if (!pk) return nativeGet.call(navigator.credentials, options);
        const allow = (pk.allowCredentials ?? []).map((a) => hex(buf(a.id)));
        const c = await bind("get", { allow, rpId: pk.rpId ?? location.hostname });
        if (c.error) return fail();
        const salt = (pk.extensions as { prf?: { eval?: { first?: BufferSource } } } | undefined)
          ?.prf?.eval?.first;
        return credential(c.id, await prf(c.secret, salt), false) as unknown as Credential;
      },
    });
    const P = window.PublicKeyCredential as unknown as Record<string, unknown> | undefined;
    if (P) {
      P.isUserVerifyingPlatformAuthenticatorAvailable = () => Promise.resolve(true);
      P.getClientCapabilities = () =>
        Promise.resolve({ "extension:prf": true, passkeyPlatformAuthenticator: true });
    }
  });
  return {
    credentials: () => Promise.resolve([...creds] as unknown[]),
    failNext: () => {
      failNext = true;
      return Promise.resolve();
    },
  };
}
