# End-to-end harness

Playwright drives the real app in Chromium and WebKit at 390 × 844, against a local stack: Anvil at Mon 28 Sep 2026 09:00 UTC with the real contract in demo mode, the stand-in AUSD, Postgres, a production build of the app, and local stand-ins for Midtrans (the bank), the block explorer and the RPC. Spec 19 has the full design and the case map.

```bash
npm run test:e2e              # every automated case
npm run e2e:tier1 -w apps/web # the Tier 1 cases and the security checks
E2E_SKIP_BUILD=1 npx playwright test …  # reuse the last build while iterating
```

Postgres must be running (`npm run db:up`). Port 8545 must be free: the harness starts its own Anvil.

## Day-one passkey check (S19-5)

Run on Mon 12 Oct 2026 with `cases/passkey-check.spec.ts`: create a passkey through Welcome, reload, sign in again, same address.

| Engine   | Authenticator                                                                                                         | Result                  |
| -------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Chromium | DevTools virtual authenticator (`ctap2`, internal, resident keys, user verification, `hasPrf`)                        | Mera accepts it; passes |
| WebKit   | The harness's software authenticator (`support/soft-authenticator.ts`), patched onto `CredentialsContainer.prototype` | Mera accepts it; passes |

Found on the way: the Content-Security-Policy's `upgrade-insecure-requests` made WebKit upgrade the page's own scripts and styles to https on `http://localhost`, so the app never loaded there. The policy now leaves that directive out only for plain http on localhost; deployed sites are https and keep it.
