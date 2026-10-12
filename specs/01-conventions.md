# 01. Shared conventions and interfaces

Status: Ready · Source: PRD sections 2, 4, 6–12, 15 · Every other spec depends on this one.

Every spec uses the names, shapes and formats on this page. If a spec needs something that is not here, add it here first, then use it. If this page and a feature spec disagree, this page wins. If this page and the PRD disagree, the PRD wins, unless this page names the PRD gap it fills (marked **Gap filled**).

## 1. Words

| Word           | Meaning                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Student        | The account owner (R1). In samples: Raka Pratama.                                                                                             |
| Trusted person | The one linked address that can approve (R2). In samples: Mama. Screens say "Mama" from the student's view and "Raka" from the parent's view. |
| Envelope       | One of five fixed buckets, in this order everywhere: `0 Food`, `1 Transport`, `2 Study`, `3 Everyday`, `4 Emergency`.                         |
| Allowance      | One deposit. It has a release schedule of four weekly shares (R5), except the Emergency share (R7).                                           |
| Account clock  | `block.timestamp + skipSeconds[accountId]`. Every wait, release and hold reads it (PRD 7, rule 6).                                            |
| Day number     | `accountClock / 86400` (integer division).                                                                                                    |
| Monday number  | `(dayNumber + 3) / 7` (integer division). A new Monday number starts at Monday 00:00 UTC.                                                     |
| Token units    | AUSD base units. AUSD is expected to have 6 decimals; read `decimals()` and never hard-code it.                                               |
| Demo mode      | A deployment where `DEMO_MODE=true` on the server and the contract was deployed with `demoMode = true`.                                       |

## 2. Repository layout

```
/                      README.md, LICENSE (MIT), SECURITY.md, .github/, specs/ (these files)
apps/web               Next.js 16 app: landing page, phone app, API route handlers
apps/docs              Astro Starlight docs site
contracts              Foundry project: src/AmplopEnvelopes.sol, test/, script/
indexer                Envio HyperIndex project
audits                 Self-audit report, tool output, accepted-findings.json
deployments            monad-testnet.json and anvil.json: chainId, contract address, deploy block (spec 04)
packages/shared        TypeScript shared by web and indexer: src/generated/amplop.ts (wagmi CLI), abi/AmplopEnvelopes.json,
                       money.ts, ids.ts, mcc.ts (code -> label, plural, category word; spec 11), schedule.ts (release maths; spec 11), constants.ts,
                       indexer queries (entry point @amplop/shared/indexer)
indexer/abis           committed copy of the ABI; CI checks it equals packages/shared
apps/web/e2e           Playwright tests, case-map.json, manual/ (spec 19)
apps/docs/src/fragments  text the PRD requires unchanged, kept once and checked in every copy (spec 18)
submission             portal texts and scripts (spec 20)
tools, scripts         pinned tool versions, skill installer, deploy helpers
```

Package manager: npm workspaces with one committed `package-lock.json`, installed with `npm ci`. Node 24 LTS (Mera, PRD 6, declares Node 24 or newer, and `engine-strict` enforces it).

Inside `apps/web/src`:

```
app/                   routes (section 6 of this page)
app/api/<job>/         route handlers, thin: parse, auth, call lib, respond
lib/server/<job>/      server logic per job: fund, profile, topup, card, invite, reason, recovery, auth, chain, db
lib/client/            passkey account (Mera), contract reads/writes, API client, formatting, i18n
components/            UI components (shadcn/ui based)
```

## 3. Contract interface: `AmplopEnvelopes`

This is the interface every other spec codes against. Spec 03 owns the behaviour; the names and types below are fixed. Solidity `0.8.x` pinned exactly (spec 03 picks the version).

### Enums and constants

```solidity
enum Envelope { Food, Transport, Study, Everyday, Emergency }          // 0..4
enum PurchaseState { None, Held, Collected, Released, Refunded }      // 0..4
enum DeclineReason { None, Blocked, NotEnough }                       // 0..2
enum PendingKind { Split, TrustedRemoval, LockOff, Recovery }         // 0..3
enum EmergencyStatus { None, Open, Opened, Cancelled }                // 0..3
enum OpenedBy { Approval, Time }                                      // 0..1

uint64 constant WAIT        = 48 hours;   // R17, R20–R23
uint64 constant HOLD_PERIOD = 7 days;     // R13
uint64 constant MOVE_PERIOD = 7 days;     // R15
uint64 constant INVITE_LIFE = 7 days;     // R22
uint8  constant MAX_SCHEDULES = 6;        // PRD 7 "up to 6 records"
uint16 constant MAX_SKIP_DAYS_PER_CALL = 14;
```

### Constructor

```solidity
constructor(IERC20 token, address settlement, address treasury, address cardService, bool demoMode)
```

**Gap filled.** PRD 7 says "three role addresses", and R3 names two contract roles. The contract has exactly two roles, Treasury and Card service. The third server key, Fee sponsor, only sends MON and has no role in the contract. `demoMode` is immutable. The settlement wallet must `approve` the contract once for refunds (spec 04).

### Writes

| Function                                                                            | Caller                                                                 | Notes                                                                                                                                                                          |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `register(uint8[5] split) returns (uint256 accountId)`                              | Address that owns no account                                           | Ids start at 1. 0 means "no account".                                                                                                                                          |
| `saveSplit(uint8[5] split)`                                                         | Owner                                                                  | Immediate if no allowance ever arrived, else pending for `WAIT` (R21). A second save replaces the pending one and restarts the wait.                                           |
| `createInvite(address inviteKey)`                                                   | Owner                                                                  | **Gap filled:** expiry is set by the contract to `accountClock + INVITE_LIFE`, not passed in. A new invite replaces any unused one (PRD 14 rule 2). **Audit change (SA-06):** an address can be an invite key once per account (`inviteKeyUsed(accountId, key)`); a reused key reverts `InviteKeyReused`. |
| `acceptInvite(uint256 accountId, bytes signature)`                                  | New trusted person                                                     | EIP-712 signature by `inviteKey` over `AcceptInvite(uint256 accountId,address trusted)`. Single use.                                                                           |
| `removeTrusted()`                                                                   | Owner                                                                  | Starts `WAIT`.                                                                                                                                                                 |
| `finishRemoveTrusted(uint256 accountId)`                                            | Anyone, after `WAIT`                                                   | **Gap filled:** PRD lists no function to complete a removal. Clears the trusted address.                                                                                       |
| `deposit(uint256 accountId, uint256 amount, bytes32 paymentId)`                     | Treasury                                                               | Pulls `amount` from Treasury with `transferFrom`. Reverts on a used `paymentId`.                                                                                               |
| `authorize(uint256 accountId, bytes32 purchaseId, uint16 shopType, uint256 amount)` | Card service                                                           | Never reverts for a decline; emits `PurchaseDeclined`. Reverts on a reused `purchaseId`.                                                                                       |
| `collect(bytes32 purchaseId, uint256 amount)`                                       | Card service                                                           | `amount <= held`; the rest returns to the envelope.                                                                                                                            |
| `releaseHold(bytes32 purchaseId)`                                                   | Card service, or anyone once `HOLD_PERIOD` passed on the account clock |                                                                                                                                                                                |
| `refund(bytes32 purchaseId, uint256 amount)`                                        | Card service                                                           | Pulls from settlement into the paying envelope.                                                                                                                                |
| `movePurchase(bytes32 purchaseId, Envelope to)`                                     | Owner                                                                  | R15 and PRD 14 rule 5. Sets the account's override for that shop type.                                                                                                         |
| `requestEmergency(uint256 amount, bytes32 reasonHash)`                              | Owner                                                                  | `reasonHash = keccak256(bytes(reasonUtf8))`. Increments the account's `requestSeq`.                                                                                            |
| `approveEmergency(uint256 accountId, uint64 requestSeq)` | Trusted person                                                         | **Audit change (SA-01):** reverts `RequestChanged` unless `requestSeq` is the open request's number, so an approval never opens a request swapped in while it was in flight. |
| `finalizeEmergency(uint256 accountId)`                                              | Anyone, after `WAIT`                                                   |                                                                                                                                                                                |
| `cancelEmergency()`                                                                 | Owner                                                                  |                                                                                                                                                                                |
| `startLockOff()`                                                                    | Owner                                                                  |                                                                                                                                                                                |
| `finishLockOff(uint256 accountId)`                                                  | Anyone, after `WAIT`                                                   |                                                                                                                                                                                |
| `approveRecovery(uint256 accountId, address newOwner)`                              | Trusted person                                                         | Reverts if `newOwner` owns an account or is this account's trusted person (PRD 14 rule 8). A second approval replaces the first and restarts the wait.                         |
| `finishRecovery(uint256 accountId)`                                                 | New owner, after `WAIT`                                                   | **Audit change (SA-04):** reverts `NotNewOwner` for any other caller; the new owner's call is its consent. |
| `cancelPending(PendingKind kind)`                                                   | Owner                                                                  |                                                                                                                                                                                |
| `skipDays(uint16 numDays)`                                                          | Owner, demo mode only                                                  | `1 <= numDays <= MAX_SKIP_DAYS_PER_CALL` (`days` is a reserved word in Solidity). Always reverts when `demoMode` is false. **Gap filled:** PRD 12 names it but PRD 7 omits it. |

Address rules (PRD 14 rules 1 and 8, B5): an address owns at most one account and is the trusted person of at most one account. An owner can never be the trusted person of their own account.

### Reads

```solidity
struct EnvelopeView { uint256 available; uint256 unreleased; uint256 held; uint256 locked; }
function envelopes(uint256 accountId) external view returns (EnvelopeView[5] memory list, uint64 nextReleaseDay);
function totals(uint256 accountId) external view returns (uint256[5] memory);   // available + unreleased per envelope; Emergency = locked + available (R25)
function accountOf(address owner) external view returns (uint256);              // 0 = none
function trustedAccountOf(address trusted) external view returns (uint256);     // 0 = none
function accountInfo(uint256 accountId) external view returns (AccountInfo memory);
function purchase(bytes32 purchaseId) external view returns (PurchaseInfo memory);
function emergency(uint256 accountId) external view returns (EmergencyInfo memory);
function pending(uint256 accountId, PendingKind kind) external view returns (bool active, uint64 readyAt, bytes32 data);
function shopEnvelope(uint256 accountId, uint16 shopType) external view returns (Envelope envelope, bool blocked);
function clock(uint256 accountId) external view returns (uint64);
function inviteOf(uint256 accountId) external view returns (address inviteKey, uint64 expiresAt, bool used);
function paymentUsed(bytes32 paymentId) external view returns (bool);
function purchaseUsed(bytes32 purchaseId) external view returns (bool);         // true for approved and declined ids
function recoveryAccountOf(address newOwner) external view returns (uint256);   // account with a pending recovery to newOwner, 0 = none
function schedules(uint256 accountId) external view returns (ScheduleView[] memory);
// public getters: token(), settlement(), treasury(), cardService(), demoMode(), tokenDecimals(), accountCount()
```

`AccountInfo`: `owner`, `trusted`, `split uint8[5]`, `pendingSplit uint8[5]`, `pendingSplitStartsAt uint64`, `lockOn bool`, `everDeposited bool`, `requestSeq uint64`, `skipSeconds uint64`.
`PurchaseInfo`: `accountId`, `envelope`, `amount`, `held`, `collected`, `refunded`, `shopType uint16`, `createdAt uint64` (account clock), `state PurchaseState`, `moved bool`, `everydayStepIn bool`.
`ScheduleView`: `startMonday uint64`, `sharesOut uint8`, `base uint256[4]`, `part uint256[4]` for Food, Transport, Study, Everyday. Allowances that start in the same week share one record (spec 03, S03-10). Share 1 to 3 of envelope `e` = `base[e]`; share 4 = `part[e] − 3 × base[e]`. Release day of share `k ≥ 2` = day `7 × (startMonday + k − 1) − 3`. Finished records stay readable until the next deposit folds them.
`nextReleaseDay` is a day number on the account clock; 0 means no share is due. Every read returns zeros for an unknown account id and never reverts.
`EmergencyInfo`: `status`, `requestSeq`, `amount`, `reasonHash`, `requestedAt uint64`, `opensAt uint64`.
`pending` `data`: for `Recovery` the new owner as `bytes32(uint256(uint160(newOwner)))`; for `Split` the packed split, where byte `i` counted from the low end is `split[i]`; otherwise zero.

### Events (exact)

Every write emits exactly one event (PRD 7). `accountId` is indexed in every event that has it.

```solidity
event AccountCreated(uint256 indexed accountId, address indexed owner, uint8[5] split);
event SplitSaved(uint256 indexed accountId, uint8[5] split, uint64 startsAt, bool immediate);
event InviteCreated(uint256 indexed accountId, address inviteKey, uint64 expiresAt);
event TrustedLinked(uint256 indexed accountId, address indexed trusted);
event TrustedRemovalStarted(uint256 indexed accountId, address indexed trusted, uint64 readyAt);
event TrustedRemoved(uint256 indexed accountId, address indexed trusted);                       // gap filled
event Deposited(uint256 indexed accountId, bytes32 indexed paymentId, uint256 amount, uint256[5] parts, uint64 startDay);
event PurchaseApproved(uint256 indexed accountId, bytes32 indexed purchaseId, Envelope envelope, uint256 amount, uint16 shopType, bool everydayStepIn);
event PurchaseDeclined(uint256 indexed accountId, bytes32 indexed purchaseId, uint256 amount, uint16 shopType, DeclineReason reason);
event PurchaseCollected(uint256 indexed accountId, bytes32 indexed purchaseId, uint256 amount, uint256 returned);
event HoldReleased(uint256 indexed accountId, bytes32 indexed purchaseId, uint256 amount);
event PurchaseRefunded(uint256 indexed accountId, bytes32 indexed purchaseId, uint256 amount);
event PurchaseMoved(uint256 indexed accountId, bytes32 indexed purchaseId, Envelope from, Envelope to, uint16 shopType);
event EmergencyRequested(uint256 indexed accountId, uint64 requestSeq, uint256 amount, bytes32 reasonHash, uint64 opensAt);
event EmergencyOpened(uint256 indexed accountId, uint64 requestSeq, uint256 amount, OpenedBy openedBy);
event EmergencyCancelled(uint256 indexed accountId, uint64 requestSeq);
event LockOffStarted(uint256 indexed accountId, uint64 readyAt);
event LockOffDone(uint256 indexed accountId, uint256 moved);
event RecoveryApproved(uint256 indexed accountId, address indexed newOwner, uint64 readyAt);
event RecoveryDone(uint256 indexed accountId, address indexed oldOwner, address indexed newOwner);
event PendingCancelled(uint256 indexed accountId, PendingKind kind);
event DaysSkipped(uint256 indexed accountId, uint16 numDays, uint64 skipSeconds);                   // gap filled
```

### Custom errors

Spec 03 defines the full list. Every revert uses a custom error, and the web app maps each one to a plain sentence (spec 06).

### EIP-712 domain

`name = "AmplopEnvelopes"`, `version = "1"`, `chainId = 10143` (31337 on Anvil), `verifyingContract = contract address`. Type: `AcceptInvite(uint256 accountId,address trusted)`. Verify with OpenZeppelin `ECDSA` and `EIP712`.

### Shop types (merchant category codes)

Default table set in the constructor (R9). Every code not listed maps to Everyday.

| Envelope  | Codes                                                                  |
| --------- | ---------------------------------------------------------------------- |
| Food      | 5411 groceries, 5812 restaurants, 5814 fast food and canteens          |
| Transport | 4111 public transport, 4121 taxis and ride-hailing, 5541 and 5542 fuel |
| Study     | 5943 stationery, 7338 printing and copying, 8299 schools and courses   |
| Blocked   | 7995 gambling                                                          |
| Everyday  | 5942 bookshops, 7832 cinemas, and every other code                     |

## 4. Server API

Base path `/api`. JSON in and out, UTF-8, 10 KB body limit. Every body and query is parsed with a strict zod schema; unknown fields return 400.

### Error shape

```json
{ "error": { "code": "invite_used", "message": "This invite has already been used." } }
```

`code` is snake_case and stable; `message` is the plain sentence the screen may show. HTTP status: 400 bad input, 401 bad or missing signature, 403 wrong role, 404 not found (also every demo route when `DEMO_MODE` is off), 409 conflict or replay, 429 rate limited, 502 chain or Midtrans unavailable, 500 anything else (message is generic).

### Auth kinds

| Kind                                                                   | How                                                                                                                                                                                                            |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public`                                                               | None. Only for ids that are random 128-bit values.                                                                                                                                                             |
| `signed:owner` / `signed:trusted` / `signed:either` / `signed:address` | Signed request (below). The server reads the contract to check that the signer is the owner or trusted person of `Account`. `signed:address` only proves control of `Address` (used before an account exists). |
| `midtrans`                                                             | Midtrans notification signature (spec 08).                                                                                                                                                                     |
| `cron`                                                                 | `Authorization: Bearer <CRON_SECRET>` as sent by Vercel Cron.                                                                                                                                                  |
| `demo`                                                                 | Same as its signed kind, and 404 unless `DEMO_MODE=true`.                                                                                                                                                      |

### Signed request format

1. The app calls `GET /api/auth/nonce` and gets `{ "nonce": "<32 hex>", "expiresAt": "<ISO>" }`. Nonces live 5 minutes and are single use.
2. The app builds this message and signs it with EIP-191 `personal_sign` using the passkey account:

```
Amplop request
Site: <host, e.g. amplop.app>
Chain: 10143
Action: <action name from the table below>
Account: <accountId, or 0 before registration>
Address: <0x signer address, lowercase>
Nonce: <nonce>
Issued: <ISO 8601 UTC>
Body: <sha256 hex of the exact request body bytes, or of the empty string for GET>
```

3. It sends two headers: `Amplop-Auth-Message` (base64url of the message) and `Amplop-Auth-Signature` (0x hex).
4. The server rejects with 401 if: the signature does not recover `Address`; `Site`, `Chain` or `Action` do not match; `Issued` is more than 5 minutes old or in the future by more than 30 s; the body hash differs. It rejects with 409 if the nonce is unknown, expired or already used, and marks the nonce used before doing any work. Then it checks the role on the contract (403 if wrong).

Mera accounts are normal externally owned accounts, so `ecrecover` is enough. If day-one checks show Mera returns a smart account, switch to ERC-1271 checks here and nowhere else.

### Endpoints

| Method and path                       | Auth                         | Action name        | Request                                                                          | Response                                                                                                | Spec |
| ------------------------------------- | ---------------------------- | ------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---- |
| `GET /api/auth/nonce`                 | public                       | none               | none                                                                             | `{nonce, expiresAt}`                                                                                    | 05   |
| `POST /api/fund`                      | signed:address               | `fund`             | `{address}`                                                                      | `{status: "sent"\|"not_needed", txHash?}`                                                               | 07   |
| `POST /api/profile`                   | signed:owner                 | `profile.save`     | `{accountId, name}`                                                              | `{ok: true}`                                                                                            | 07   |
| `GET /api/profile/[accountId]`        | signed:either                | `profile.read`     | none                                                                             | `{name}`                                                                                                | 07   |
| `POST /api/invite`                    | signed:owner                 | `invite.create`    | `{accountId, inviteKey, trustedName}`                                            | `{inviteId}`                                                                                            | 10   |
| `GET /api/invite/latest`              | signed:either                | `invite.latest`    | none                                                                             | `{inviteId, trustedName, state}` for the account in the auth header                                     | 10   |
| `GET /api/invite/[inviteId]`          | public                       | none               | none                                                                             | `{accountId, studentName, trustedName, inviteKey, state: "open"\|"used"\|"expired"\|"replaced"}`        | 10   |
| `POST /api/topup`                     | signed:trusted               | `topup.create`     | `{accountId, rupiah}`                                                            | `{orderId, vaNumber, bank, expiresAt, rupiah, dollars, rate}`                                           | 08   |
| `GET /api/topup/[orderId]`            | signed:trusted               | `topup.read`       | none                                                                             | `{orderId, status, rupiah, dollars, vaNumber, bank, expiresAt, depositTx?, lastCheckedAt}`              | 08   |
| `POST /api/topup/[orderId]/simulate`  | demo (signed:trusted)        | `topup.simulate`   | `{}`                                                                             | same as GET                                                                                             | 08   |
| `POST /api/midtrans/webhook`          | midtrans                     | none               | Midtrans notification                                                            | `{ok: true}`                                                                                            | 08   |
| `POST /api/card/issue`                | signed:owner                 | `card.issue`       | `{accountId}`                                                                    | `{cardToken, last4}`                                                                                    | 09   |
| `POST /api/card/authorize`            | signed:owner                 | `card.authorize`   | `{cardToken, amount, currency, merchantName, merchantCity, mcc, idempotencyKey}` | `{purchaseId, result: "approved"\|"declined", envelope?, everydayStepIn, reason?, amountUnits, txHash}` | 09   |
| `POST /api/card/collect`              | demo (signed:owner) or cron  | `card.collect`     | `{purchaseId, amountUnits?}`                                                     | `{state, txHash}`                                                                                       | 09   |
| `GET /api/purchases`                  | signed:owner                 | `purchases.read`   | none (account from auth)                                                         | `{items: [{purchaseId, merchantName, merchantCity, currency, amount, result}]}`, approved and declined  | 11   |
| `POST /api/reason`                    | signed:owner                 | `reason.save`      | `{accountId, requestSeq, reason}`                                                | `{linkId}`                                                                                              | 12   |
| `GET /api/reason/current`             | signed:either                | `reason.current`   | none                                                                             | `{linkId, requestSeq, reason}` for the open request, 404 if none                                        | 12   |
| `GET /api/reason/[linkId]`            | signed:either                | `reason.read`      | none                                                                             | `{accountId, requestSeq, reason}`                                                                       | 12   |
| `POST /api/recovery`                  | signed:address               | `recovery.create`  | `{newOwner}`                                                                     | `{linkId}`                                                                                              | 13   |
| `GET /api/recovery/[linkId]`          | signed:trusted (any account) | `recovery.read`    | none                                                                             | `{newOwner, createdAt, dismissed}`                                                                      | 13   |
| `POST /api/recovery/[linkId]/dismiss` | signed:trusted               | `recovery.dismiss` | `{}`                                                                             | `{ok: true}`                                                                                            | 13   |
| `GET /api/cron/deposits`              | cron                         | none               | none                                                                             | `{retried}`                                                                                             | 08   |
| `GET /api/cron/collect`               | cron                         | none               | none                                                                             | `{collected}`                                                                                           | 09   |

**Gap filled:** the PRD lists no endpoints for the nonce, issuing a card, recovery links, the latest invite, the current reason, or cron jobs; screens 4.2 and 4.3, the parent's alerts and the threat table need them.

`amount` in `card/authorize` is a decimal string in the shop currency's minor units ("1250" = €12,50). `currency` is one of `EUR`, `USD`, `IDR`. `amountUnits`, `dollars` and every token amount in responses are decimal strings of token units (bigint as string).

### Rate limits

Stored in Postgres (no extra service). Per IP: 60 a minute on all `POST` and 120 a minute on all `GET`. Per account: 30 signed `POST`s a minute (polling does not count). `card/authorize`: 10 a minute per card. `fund`: 5 per address, 20 new addresses per device and 30 per IP, all per UTC day, plus a 50 MON daily total (spec 07). A 429 carries `Retry-After`.

## 5. Database (Postgres, Drizzle ORM)

All ids that appear in links are `crypto.randomBytes(16)` as 32 lowercase hex characters. Token amounts are stored as `bigint` (token units). Times are `timestamptz`.

| Table           | Columns (key first)                                                                                                                                                                                                                                                                                                                                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nonces`        | `nonce` pk, `expires_at`, `used_at`                                                                                                                                                                                                                                                                                                                               |
| `rate_limits`   | (`bucket`, `window_start`) pk, `count`                                                                                                                                                                                                                                                                                                                            |
| `profiles`      | `account_id` pk, `name`, `updated_at`                                                                                                                                                                                                                                                                                                                             |
| `cards`         | `card_token` pk, `account_id` unique, `last4`, `created_at`                                                                                                                                                                                                                                                                                                       |
| `orders`        | `order_id` pk, `account_id`, `rupiah` bigint, `dollars_units` bigint, `rate_idr_per_usd` int, `status`, `va_number`, `bank`, `expires_at`, `payment_id` (0x hex, unique), `deposit_tx`, `attempts`, `next_attempt_at`, `last_error`, `last_checked_at`, `sent_hashes` text[], `confirm_ms`, `created_at`, `updated_at`                                            |
| `purchases`     | `purchase_id` pk, `account_id`, `idempotency_key` unique, `merchant_name`, `merchant_city`, `currency`, `amount_minor` bigint, `mcc`, `amount_units` bigint, `result`, `envelope`, `everyday_step_in`, `decline_reason`, `hold_state`, `tx_hash`, `settle_tx`, `sent_hashes` text[], `confirm_ms`, `created_at`, `updated_at`; index (`hold_state`, `created_at`) |
| `invites`       | `invite_id` pk, `account_id`, `invite_key` (address), `trusted_name`, `created_at`                                                                                                                                                                                                                                                                                |
| `reasons`       | `link_id` pk, (`account_id`, `request_seq`) unique, `text`, `created_at`                                                                                                                                                                                                                                                                                          |
| `recoveries`    | `link_id` pk, `new_owner`, `dismissed_at`, `created_at`                                                                                                                                                                                                                                                                                                           |
| `funding`       | `address` pk, `day`, `count_today`, `last_funded_at`, `total_wei` numeric                                                                                                                                                                                                                                                                                         |
| `funding_daily` | `day` pk, `wei_sent` numeric                                                                                                                                                                                                                                                                                                                                      |
| `signer_nonces` | `address` pk, `next_nonce` bigint, `updated_at` (spec 05: one send at a time per server key)                                                                                                                                                                                                                                                                      |

`orders.status`: `waiting`, `received`, `sent`, `expired`, `failed`. `purchases.result`: `pending`, `approved`, `declined`, `error`. `purchases.hold_state`: `held`, `collected`, `released`, `refunded`, or null for a decline.

Id derivations: `purchaseId` on chain = `bytes32` of the 16 random bytes left-padded with zeros. `paymentId` on chain = `keccak256("midtrans:" + orderId)`.

The production database role can read and write rows but cannot create, alter or drop tables. Migrations run with a separate role.

## 6. Routes

Exactly the routes in PRD 5, plus: invite link `https://<host>/invite/<inviteId>#k=<inviteKeyPrivateKeyHex>`; approval link `/approve/<linkId>`; recovery link `/recover/<linkId>`. The invite key never appears before the `#`.

## 7. Environment variables

| Name                                                                                                                                           | Where               | Notes                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                                                                 | server              | runtime role                                                              |
| `DATABASE_MIGRATION_URL`                                                                                                                       | CI only             | migration role                                                            |
| `MONAD_RPC_URL`, `MONAD_RPC_URL_FALLBACK`                                                                                                      | server              | two providers (PRD 17)                                                    |
| `NEXT_PUBLIC_MONAD_RPC_URL`, `NEXT_PUBLIC_MONAD_RPC_URL_FALLBACK`                                                                              | browser             | read and send for user transactions                                       |
| `NEXT_PUBLIC_CHAIN_ID`                                                                                                                         | browser             | 10143 (31337 in tests)                                                    |
| `NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_AUSD_ADDRESS`                                                                                     | browser and server  |                                                                           |
| `NEXT_PUBLIC_EXPLORER_TX_URL`                                                                                                                  | browser             | prefix for "View transaction proof" links                                 |
| `NEXT_PUBLIC_INDEXER_URL`                                                                                                                      | browser             | Envio GraphQL                                                             |
| `NEXT_PUBLIC_DEMO_MODE`                                                                                                                        | browser             | shows demo controls only; the server and contract still decide            |
| `DEMO_MODE`                                                                                                                                    | server              | `true` only on the demo deployment                                        |
| `SETTLEMENT_ADDRESS`                                                                                                                           | server              |                                                                           |
| `TREASURY_PRIVATE_KEY`, `CARD_SERVICE_PRIVATE_KEY`, `FEE_SPONSOR_PRIVATE_KEY`                                                                  | server              | never `NEXT_PUBLIC_`; three different wallets by submission               |
| `MIDTRANS_SERVER_KEY`, `MIDTRANS_IS_PRODUCTION=false`                                                                                          | server              |                                                                           |
| `SAMPLE_RATE_IDR_PER_USD=16500`, `SAMPLE_RATE_USD_PER_EUR=1.1511`                                                                              | server              | shown on screen as "sample rate"                                          |
| `CRON_SECRET`                                                                                                                                  | server              |                                                                           |
| `ALERT_WEBHOOK_URL`                                                                                                                            | server, optional    | fee-sponsor cap and treasury alerts; payload `{text}`                     |
| `AUSD_FAUCET_ADDRESS` | server, optional | testnet AUSD faucet with `requestFunds(address)`; unset means the treasury is refilled by hand (08 S08-33) |
| `SITE_HOSTS`                                                                                                                                   | server              | hosts accepted in the signed message's `Site` line and in `Origin`        |
| `NEXT_PUBLIC_SAMPLE_RATE_IDR_PER_USD`, `NEXT_PUBLIC_SAMPLE_RATE_USD_PER_EUR`                                                                   | browser             | must equal the server values; the server refuses to start otherwise       |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_DOCS_URL`, `NEXT_PUBLIC_REPO_URL`, `NEXT_PUBLIC_DEMO_VIDEO_URL`                                           | browser             | links on the landing page and docs; a link whose value is unset is hidden |
| `MIDTRANS_API_BASE_URL`                                                                                                                        | server, tests only  | accepted only for localhost, 127.0.0.1 or `*.midtrans.com`                |
| `AUSD_ADDRESS`, `TREASURY_ADDRESS`, `CARD_SERVICE_ADDRESS`, `DEPLOYER_ACCOUNT`, `SETTLEMENT_PRIVATE_KEY`, `OLD_CONTRACT_ADDRESS`               | deploy machine only | never in Vercel (spec 04)                                                 |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_WEB`, `VERCEL_PROJECT_ID_DOCS`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `DEPENDABOT_READ_TOKEN` | CI secrets only     | spec 02; not read by the app and not in `.env.example`                    |

`.env.example` lists every name with a fake value. No real value is ever committed.

## 8. Money and number formats

- Token amounts are `bigint` in code, decimal strings in JSON, never JavaScript `number`.
- Display in both languages: dot for thousands, comma for decimals: `$1.000,00`, `$14,39`, `Rp16.500.000`, `€12,50`. One formatter in `packages/shared` (spec 06), unit tested.
- Rupiah to token units: `units = floor(rupiah × 10^decimals / 16500)`. Euro minor units to token units: `units = floor(euroMinor × 1.1511 × 10^decimals / 100)` computed with integers (rate as 11511 / 10000). One pure function each, rounding down (PRD 15).
- Sample check: Rp16.500.000 → 1.000.000.000 units ($1.000,00). €12,50 → 14.388.750 units, shown as $14,39 (display rounds half up to cents; the contract amount is the exact unit value).

## 9. Decisions settled across specs

These came out of writing the specs. They bind every spec.

**JSON.** `accountId`, `requestSeq`, `rupiah` and every token amount are decimal strings. Ids are lowercase hex. Enum values in JSON are lowercase words: envelope `food`, `transport`, `study`, `everyday`, `emergency`; decline reason `blocked`, `not_enough`; hold state `held`, `collected`, `released`, `refunded`. Card and top-up responses add `confirmMs` (time from send to receipt).

**Error codes.** Each spec lists the codes it returns. A code has one meaning everywhere: a spec that needs a meaning another spec already has reuses that code (for example `name_invalid` from 07 in 10, `address_mismatch` from 07 in 13), and never gives an existing code a new meaning. Spec 05 keeps the platform ones: `auth_missing`, `auth_malformed`, `auth_wrong_site`, `auth_wrong_chain`, `auth_wrong_action`, `auth_expired`, `auth_future`, `auth_body_mismatch`, `auth_bad_signature`, `bad_json`, `bad_input`, `bad_content_type`, `body_too_large`, `bad_origin`, `not_owner`, `not_trusted`, `not_allowed`, `wrong_account` (a body or resource account differs from the signed `Account`), `nonce_invalid`, `rate_limited`, `not_found`, `cron_unauthorized`, `chain_unavailable`, `chain_busy`, `internal`.

**Auth details.** `signed:address` does not check `Account`. "signed:trusted (any account)" means `Account` must equal `trustedAccountOf(Address)`. `POST /api/fund` also requires the header `Amplop-Device: <32 hex>` (400 `bad_device` if missing).

**Contract behaviour other specs rely on** (spec 03 owns it):

- `authorize` reverts on any reused purchase id, approved or declined; `purchaseUsed` tells the server whether an id reached the chain after a timeout.
- Collect works only before `HOLD_PERIOD` ends on the account clock; after that only release works.
- Lock-off cannot start while an Emergency request is open, and a request cannot start while lock-off is waiting.
- A trusted-person removal and a recovery cannot be pending at the same time. `removeTrusted` cancels a pending recovery the student could still cancel (inside its wait, or one that can never finish), so a trusted person cannot block their own removal by re-approving (audit change SA-02); a recovery past its wait reverts it with `RecoveryPending`, because it is the new owner's to finish. `approveRecovery` reverts while a removal is pending.
- `recoveryAccountOf(newOwner)` is set by `approveRecovery` and cleared by `finishRecovery`, `cancelPending(Recovery)` and a second approval to another address. `approveRecovery` reverts when another account already has a pending recovery to the same `newOwner`.
- `acceptInvite` reverts while the account still has a trusted person. In a replacement the app calls `finishRemoveTrusted` first (spec 10).
- Once the lock is off, later Emergency parts go to Everyday whole and available at once.
- Lock-off cannot be switched back on in this version.

**Gas.** Every transaction, from the browser or the server, sets its gas limit to the larger of the estimate plus 20% and a per-function floor taken from the contract's gas report (spec 03). Monad charges the limit, so no wider margin. The app never signs an EIP-7702 delegation.

**Shared constants** (`packages/shared/src/constants.ts`): `FUND_THRESHOLD_ACTIONS = 3n`, `FUND_TARGET_ACTIONS = 20n`, `TYPICAL_ACTION_GAS` (from spec 03's gas report), `GAS_FLOOR` (per write function, spec 03 S03-51), `INDEXER_MAX_LAG_BLOCKS = 30`, `INDEXER_TIMEOUT_MS = 4000`.

**Indexer.** Entity and field names are spec 16's (S16-7 to S16-9): every row has `blockNumber`, `logIndex`, `sortKey`, `timestamp`, `accountClock` and `txHash`; lists sort by `sortKey` descending and show dates from `accountClock`. Alert kinds are 16's `AlertKind`; their wording is spec 14's. Alerts end with `status` `Active`, `Done`, `Cancelled` or `Replaced`.

**Routes and parameters.** `/app/arrived/[deposit]`: the deposit's `paymentId` (lowercase hex), which is also the indexer's Deposit id, with `?tx=` (the deposit transaction hash) when known; without the indexer the screen reads the `Deposited` log with that indexed `paymentId` from the `tx` receipt. `/app/card/result/[id]`: the purchase id, with `?tx=`. `/app/card/pay?shop=<key>`. `/app/envelope/[id]`: `0` to `3`; `4` redirects to `/app/emergency`. `/app/activity/[id]`: the purchase id. `/app/setup?edit=1`: split editing. Offline page: `/offline.html`.

**Browser storage.** `localStorage`: `amplop.profiles.v1` (at most 5 records of credential id, label and Mera's optional hint), `amplop.lastProfile`, `amplop.lang`, `amplop.device`, `amplop.openOrders` (08: at most 5 `{accountId, orderId, rupiah, createdAt}`), `amplop.seenDeposit` (08: `{ "<accountId>": "<paymentId>" }`), `amplop.emergency.v1` (12: `{ "<accountId>": { sharedSeq, seenSeq } }`), `amplop.recovery` (13: `{ linkId, newOwner, createdAt, approvedAccountId? }`, the new phone's own address only). `sessionStorage`: `amplop.lastTx`, `amplop.gateSkip`, `amplop.onboarding.<credentialId>`. Nothing else, and never a key, address book or personal text beyond the profile label. Signing in as a known profile passes `allowCredentials` with its credential id (K1 depends on it).

**Local wallets (Anvil).** Account 0 deployer, 1 Treasury, 2 Card service, 3 Settlement, 4 Fee sponsor. Anvil starts at 1790586000 (Mon 28 Sep 2026 09:00 UTC).

**Test hooks.** Screens render these `data-testid`s: `envelope-available-<i>`, `envelope-later-<i>`, `envelope-locked`, `parent-total-<i>`, `tx-proof`, `demo-banner`, `history-catching-up`, `alert-item`. On chain 31337 only, the app exposes the signed-in address and account id read-only on `window.__amplopTest`.

**Root scripts** the README cites: `db:up`, `db:migrate` (05), `chain:up`, `deploy:local` (04), `test`, `test:e2e` (19), `check:wording`, `check:fragments` (18). `scan:bundle` (02) runs 05's `apps/web/scripts/bundle-scan.mjs` with the patterns in `apps/web/scripts/bundle-scan.patterns.json`.

## 10. Spec file template

Every spec has these parts, in this order: header line (status, PRD sources, depends on); Goal; In scope / Out of scope; Requirements (numbered `S<spec>-<n>`, each testable, citing PRD rules); Interfaces used; Screens (if any); Errors and edge cases; Security; Tests (unit, contract, server, end-to-end case IDs from PRD 14 with their expected result); Acceptance checklist; Skills to use; Decisions made here; Additions to 01 (status), where each item a spec needed from this page is marked "Merged into 01" or "Not merged" with the reason.

## 11. Rules for whoever implements a spec

- Read `00-index.md`, this file, and the spec. Read the PRD section the spec cites when a detail is unclear.
- Build the spec's tests in the same commit series as the feature (PRD 14: Tier 1 cases on the same day).
- Follow the commit rule in PRD 15: one finished piece per commit, `type(area): what changed`.
- Use the MONSKILLS skills listed in the spec (PRD 6), pinned to commit `3f8efd2`. Where a skill disagrees with a spec, the spec wins.
- Never change a name on this page without updating every spec that uses it in the same commit.
