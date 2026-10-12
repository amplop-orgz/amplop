# End-to-end harness

Playwright drives the real app in Chromium and WebKit at 390 × 844, against a local stack: Anvil at Mon 28 Sep 2026 09:00 UTC with the real contract in demo mode, the stand-in AUSD, Postgres, a production build of the app, and local stand-ins for Midtrans (the bank), the block explorer and the RPC. Spec 19 has the full design and the case map.

```bash
npm run test:e2e              # every automated case
npm run e2e:tier1 -w apps/web # the Tier 1 cases and the security checks
npm run e2e:check-map -w apps/web  # case-map.json against the test titles
BASE_URL=https://… npm run e2e:smoke   # the preview smoke set, no transactions
BASE_URL=https://… npm run e2e:testnet # Tier 1 on Monad testnet, serial, no retries
E2E_SKIP_BUILD=1 npx playwright test …  # reuse the last build while iterating
E2E_NO_INDEXER=1 npx playwright test …  # skip the indexer (cases tagged @indexer then fail)
```

Postgres must be running (`npm run db:up`) and Docker must be up for the indexer (16's `config.e2e.yaml` under `envio dev`). Ports 3000, 8545 to 8547, 8080, 4010 and 3999 must be free: the harness starts its own Anvil, indexer, app and stand-ins, and stops them at the end.

Projects: `chromium-phone` and `webkit-phone` run every case except two groups that wait for them: `indexer-off` (F10 pauses the shared indexer, so it runs alone) and `after-run` (SEC3 reads the server log the other tests wrote).

## How the stack differs from production

- **Finality.** Anvil reports "finalized" 64 blocks behind and mines only on demand, so the RPC stand-in answers `finalized` as `latest`, which is how Monad behaves (final in about a second).
- **One IP per phone.** Every profile's API calls carry their own `x-real-ip`, so the fee top-up's per-IP limit (07 S07-27) counts people apart as it would on real phones.
- **Testnet run.** The deployed build has no test hook (chain 31337 only), so the testnet run learns each new account from the newest `AccountCreated` event; it is serial, so that is the profile's own. J4 and K1 need the hook and are tagged `@testnet-skip`, with C2, C5 and F10.

## Day-one passkey check (S19-5)

Run on Mon 12 Oct 2026 with `cases/passkey-check.spec.ts`: create a passkey through Welcome, reload, sign in again, same address.

| Engine   | Authenticator                                                                                                         | Result                  |
| -------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Chromium | DevTools virtual authenticator (`ctap2`, internal, resident keys, user verification, `hasPrf`)                        | Mera accepts it; passes |
| WebKit   | The harness's software authenticator (`support/soft-authenticator.ts`), patched onto `CredentialsContainer.prototype` | Mera accepts it; passes |

Found on the way: the Content-Security-Policy's `upgrade-insecure-requests` made WebKit upgrade the page's own scripts and styles to https on `http://localhost`, so the app never loaded there. The policy now leaves that directive out only for plain http on localhost; deployed sites are https and keep it.
