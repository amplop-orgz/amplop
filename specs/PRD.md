# Amplop PRD

Oct 5, 2026 · @Wachid

## 1. Summary

Amplop is an allowance wallet for Indonesian students studying far from home. A parent pays rupiah once; the money arrives as digital dollars (AUSD on Monad), splits into five envelopes, and is released one weekly share at a time. A card pays from the envelope that matches the kind of shop. The Emergency envelope opens when a trusted person approves, or by itself after 48 hours.

| Item | Value |
| --- | --- |
| Event | Monad Metropolis, Track 02 (Consumer Products & Payments) |
| Submission deadline | Wed 14 Oct 2026, 10:59 WIB (13 Oct, 11:59 PM ET) |
| Portal team and project created by | Tue 6 Oct 2026 |
| Bounties targeted | Agora (AUSD), Envio (indexer) |
| Builder | One person |
| Mock-ups | [Amplop app mock-ups](https://claude.ai/artifact/2i6WtKNTrohJj8rRxFjEGM), 30 phone screens, landing page, connection map |

**Done means** a judge can open the landing page on a phone, create a passkey, set envelopes, play the parent, send a test allowance, pay at a simulated shop, see one approved and one declined payment, and open Emergency with a second passkey. Every one of those steps writes to Monad testnet and links to its transaction.

**Scoring** is five criteria at 20% each: product quality and completeness, technical excellence, Monad integration, track fit and problem relevance, innovation and impact.

**Sample people used everywhere:** Raka Pratama, a student in Amsterdam, and Mama, his parent and trusted person. The sample allowance is Rp16.500.000 = $1.000,00 at a fixed sample rate of $1 = Rp16.500.

## 2. Decisions already made

These are settled. Changing one means changing the mock-ups too.

| Area | Decision |
| --- | --- |
| App type | Mobile-first web app, installable (PWA). Landing page at `/`, app under `/app`. |
| Language | English by default, Bahasa Indonesia as the second language. |
| Who sets up | The student creates the account and the split, then invites the parent by WhatsApp link. The parent creates their own passkey on their own phone. |
| Envelopes | Food 40%, Transport 15%, Study 15%, Everyday 20%, Emergency 10% by default. The student can change the percentages. |
| Money shown | Dollars first on student screens, with a rupiah reference. Rupiah first on the parent's payment screens. |
| Digital dollar | AUSD on Monad testnet. The contract works with any token address. |
| Rupiah top-up | Midtrans Snap sandbox, bank virtual account. A Simulate payment button is always available in test mode. |
| Card | Demo card only. The authorisation message follows the shape a real card issuer sends. |
| Emergency | The trusted person can open it sooner but cannot block it. It always opens after 48 hours. Opened money moves to Everyday. |
| Parent's view | Totals per envelope and alerts. Never the shop. |
| Blocked purchases | Gambling is blocked. The parent sees the category, never the shop. |
| Network fee | The server sends each new account a little test MON at sign-up and tops it up when low. |
| Indexer | Envio HyperIndex for activity and alerts. The app still works when it is down. |
| Docs | A separate docs site in the same repository. |
| Landing page | No mention of crypto or the hackathon. One footer line says it is a preview in test mode. |
| Look | Theme A, "Rupiah notes": envelope colours taken from banknotes, Plus Jakarta Sans, Archivo for landing headlines. |

## 3. What is real, simulated, and not built

This table goes into the README and the docs site unchanged. It is the honest answer to "does it work?".

| Piece | State | Detail |
| --- | --- | --- |
| Envelope rules (split, weekly release, locks, limits) | Real | A contract on Monad testnet holds the AUSD and enforces every rule. |
| Card decision (approve, decline, which envelope) | Real | Decided by the contract in one transaction. The server cannot spend locked or unreleased money. |
| Trusted-person approval | Real | A second passkey account signs a transaction. |
| Passkey accounts | Real | Mera derives a normal account from the passkey. No password, no seed phrase. |
| AUSD | Real testnet token | From the Agora faucet: 10.000 AUSD per request, once a minute. |
| Rupiah payment | Simulated | Midtrans sandbox. No real rupiah moves. |
| Rupiah to dollar conversion | Simulated | A treasury wallet holds test AUSD and pays out at a fixed sample rate. |
| Card and shop | Simulated | A checkout screen stands in for the shop's card machine. No card network. |
| Alerts to the parent | In-app only | Shown when the parent opens the app. No push notification. |
| Time | Skippable in the demo | See section 12. Real values are 7 days and 48 hours. |
| Real card issuer, real rupiah, identity checks, cash-out | Not built | Listed in section 18. |

## 4. Product rules

The contract and the app must both follow these rules. Each has a number so tests and code comments can point to it.

### People and roles

| # | Rule |
| --- | --- |
| R1 | The **student** owns the account, sets the split, and holds the card. |
| R2 | Each account has at most one **trusted person**. In this version the trusted person is also the only one who sends the allowance. |
| R3 | The server holds two limited keys. **Treasury** can only add money to an account. **Card service** can only ask the contract to approve, collect, release, or refund a purchase. Neither can touch locked or unreleased money, and collected money can only go to one fixed settlement address. |

### Money in

| # | Rule |
| --- | --- |
| R4 | An allowance is split by the percentages in force when it arrives. Percentages are whole numbers in steps of 5 and add up to 100. Leftover cents from rounding go to Everyday. |
| R5 | Food, Transport, Study and Everyday are each released in four equal shares: the first on arrival, the next three on the following three Mondays at 00:00 UTC. Leftover cents go into the last share. |
| R6 | Unspent money stays in its envelope and carries over. |
| R7 | The Emergency share arrives whole and locked. |
| R8 | A second allowance gets its own four shares. Each envelope shows the sum of everything released so far. |

### Paying by card

| # | Rule |
| --- | --- |
| R9 | The kind of shop picks the envelope. Groceries, restaurants and canteens use Food. Public transport, ride-hailing and fuel use Transport. Stationery, printing and course fees use Study. Everything else uses Everyday, including bookshops, because not every book is for study; one move (R15) switches them to Study, which is the state the card screen shows. |
| R10 | If the matching envelope has enough available, it pays. If not, and Everyday has enough for the whole amount, Everyday pays. Otherwise the purchase is declined. A purchase is never split across two envelopes. |
| R11 | Emergency never pays a shop directly. |
| R12 | Gambling is always declined. No money moves. The decline is recorded with its category only. |
| R13 | An approved amount is put on hold in its envelope. The shop collects up to the held amount within 7 days. If it does not, the hold is released back to the same envelope. A refund returns to the envelope that paid. |
| R14 | Shop prices in another currency are turned into dollars by the server at a fixed sample rate at approval time. The sample rate is 1 euro = $1,1511. |
| R15 | A purchase paid from Everyday can be moved to Food, Transport or Study, once, within 7 days, if the target has enough available. Everyday gets the amount back. That kind of shop then uses the target envelope. Purchases paid from other envelopes cannot be moved. |

### Emergency

| # | Rule |
| --- | --- |
| R16 | The student asks for an amount up to the locked balance and writes a reason. One request can be open at a time. The student can cancel it. |
| R17 | The trusted person can approve, which opens it at once. They cannot refuse. If nobody approves, it opens 48 hours after the request. |
| R18 | Opened money moves to Everyday and can be spent immediately. The rest stays locked. |
| R19 | With no trusted person, a request simply waits 48 hours. |
| R20 | Switching the Emergency lock off takes 48 hours. After that the whole Emergency balance moves to Everyday and later Emergency shares arrive unlocked. |

### Changes, invites and recovery

| # | Rule |
| --- | --- |
| R21 | A new split takes effect 48 hours after the student saves it, and only for allowances that arrive after that. Money already in envelopes is not re-divided. |
| R22 | An invite link works once and expires after 7 days. Accepting it creates the trusted person's own passkey. The first trusted person is linked at once. Replacing or removing one takes 48 hours. |
| R23 | If the student loses their passkey, they create a new one and send a recovery link to the trusted person. After the trusted person approves there is a 48-hour wait, then the account moves to the new passkey. The old passkey can cancel during the wait. With no trusted person there is no recovery. |
| R24 | The student can cancel any pending change (R20 to R23) before its wait ends. |

### What the trusted person sees

| # | Rule |
| --- | --- |
| R25 | Per envelope: the total left, which is available plus not yet released. Never a shop, and never a list of purchases. |
| R26 | Alerts in the app: Emergency requested, blocked purchase declined (category only), an envelope under 20% of this week's share, a purchase moved (envelope names only), a rule change saved, a recovery asked. |
| R27 | Shop names are kept on the server and shown only to the student. The chain records the envelope, the amount, the time and the kind of shop. Anyone who looks up the contract can see those, and the docs say so. |

## 5. Screens

Every board in the mock-ups maps to one route. "Reads" and "writes" say what the screen needs from the contract (C), the server (S) or the indexer (I).

| Board | Route | Who | Reads | Writes |
| --- | --- | --- | --- | --- |
| 0.0 Landing | `/` | Anyone | Nothing | Nothing |
| 0.1 Open in browser | shown by `/app` when inside a chat app's browser | Anyone | Browser check | Nothing |
| 0.2 Welcome | `/app` | Anyone | Passkey support check | Create passkey, S: fee top-up |
| 0.2b Your name | /app/name | Student | Nothing | S: save name |
| 0.3 Set up envelopes | `/app/setup` | Student | C: split | C: register or save split |
| 0.4 Invite | `/app/invite` | Student | Nothing | C: create invite, S: save invite name |
| 0.5 Invite accepted | `/invite/[code]` | Trusted person | S: invite details | Create passkey, C: accept invite |
| 0.6 Home, waiting | `/app` | Student | C: account, envelopes | Nothing |
| 0.7 Home, nobody invited | `/app` | Student | C: account | Nothing |
| 1.1 Parent home | `/app/parent` | Trusted person | C: totals, I: alerts | Nothing |
| 1.2 Send allowance | `/app/parent/send` | Trusted person | C: split | S: create payment |
| 1.3 Waiting for payment | `/app/parent/send/[order]` | Trusted person | S: payment status | S: simulate payment (test mode) |
| 1.4 Allowance sent | same route, paid state | Trusted person | S: payment, C: deposit | Nothing |
| 2.1 Allowance arrived | `/app/arrived/[deposit]` | Student | C: deposit | Nothing |
| 2.2 Student home | `/app` | Student | C: envelopes | Nothing |
| 2.3 Envelope detail | `/app/envelope/[id]` | Student | C: schedule, I: purchases | Nothing |
| 2.4 Card | `/app/card` | Student | C: shop-type table | Nothing |
| 2.5 Simulated checkout | `/app/card/pay` | Student | Nothing | S: authorise purchase |
| 2.6 Approved | `/app/card/result/[id]` | Student | S: result | Nothing |
| 2.7 Declined, blocked | same route | Student | S: result | Nothing |
| 2.8 Declined, empty | same route | Student | S: result, C: envelope | Nothing |
| 2.9 Activity | `/app/activity` | Student | I: activity, S: shop names | Nothing |
| 2.10 Move a purchase | `/app/activity/[id]` | Student | I: purchase, S: shop name | C: move purchase |
| 3.1 Ask to open Emergency | `/app/emergency` | Student | C: locked balance | C: request, S: save reason |
| 3.2 Waiting | `/app/emergency` (open request) | Student | C: request | C: cancel or finalise |
| 3.3 Approval | `/approve/[request]` | Trusted person | C: request, S: reason | C: approve |
| 3.4 Emergency opened | same route, done state | Trusted person | C: request | Nothing |
| 3.5 Emergency, no trusted person | `/app/emergency` | Student | C: locked balance | C: request |
| 4.1 Settings | `/app/settings` | Student | C: account | C: lock off, change trusted person |
| 4.2 Recover | `/recover` | Student, new phone | C: recovery | Create passkey, S: save recovery link |
| 4.3 Approve recovery | `/recover/[code]` | Trusted person | C: recovery | C: approve recovery |

States the mock-ups do not draw but the app must handle, each as a line of text on the existing screen: loading, no connection, transaction failed with a Try again button, "payment received, sending" on 1.3, and "history is catching up" on 2.9 when the indexer is behind.

## 6. System design

One contract holds the money and the rules. Everything else is a way to reach it or to read from it.

&#91;embedded content: system design · 5 pieces, 7 connections\]

People sign their own actions straight to the contract. The server reaches it only through three keys that can deposit, ask for a card decision, or send fee money, and nothing else.

| Piece | Built with | Job |
| --- | --- | --- |
| Web app | Next.js 16, Tailwind v4, shadcn/ui, viem, `@category-labs/mera` | Landing page and the phone app. Signs the user's own transactions with their passkey account. |
| Server | Next.js route handlers on Vercel, a small Postgres database | Fee top-up, rupiah payments, the card service, private text (shop names, reasons, invite names). |
| Contract | Solidity, Foundry, deployed on Monad testnet (chain 10143) | Holds AUSD. Splits, releases, approves or declines purchases, runs every 48-hour wait. |
| Indexer | Envio HyperIndex | Turns contract events into the activity list and the parent's alerts. |
| Docs site | Astro Starlight | Architecture, contract and API reference, trust and security, try-it guide. |

**Repository layout:** `apps/web`, `apps/docs`, `contracts`, `indexer`, with one README at the root. Licence: MIT.

**Three server keys,** each in its own environment variable: Treasury, Card service, and Fee sponsor. They can be the same wallet during the first days and must be three wallets by submission. Each wallet stays above 10 MON plus its daily budget, so the Fee sponsor needs at least 60 MON. Below 10 MON, Monad's [reserve balance rule](https://docs.monad.xyz/developer-essentials/reserve-balance) makes transfers of MON out of the wallet revert, except one every 3 blocks.

**Monad points worth showing in the demo:** a card decision is one transaction that is final in about a second, so the Approved screen can wait for the chain instead of guessing; and each screen with money links to its transaction.

**Monad skills.** Every spec is built with the MONSKILLS skill set ([skills.devnads.com](https://skills.devnads.com/)) wherever it covers the task. Start with its `monskill` skill, which picks the right one; the ones that fit Amplop are `concepts`, `gas`, `addresses`, `indexer` and `tooling-and-infra`, plus the setup gotchas in `scaffold`. Where a skill disagrees with this PRD, the PRD wins:

- Skip `wallet-integration`: it uses Para, and Amplop uses Mera passkeys.
- Skip `wallet`: it signs through a hosted agent wallet. Deploy with Foundry and the deployer key instead.
- Skip `scaffold`'s project creation: the repository already exists.
- Check any address from `addresses`, AUSD included, against the issuer's own docs before using it.

Install it pinned to plugin version 0.7.2 (commit `3f8efd2` of `therealharpaljadeja/monskills`) and do not update it during the freeze.

## 7. Contract design

One contract, `AmplopEnvelopes`, holds all AUSD and enforces rules R1 to R24. It is set up once with the token address, the settlement address, the three role addresses, and a demo switch (section 12).

### What it stores

| Thing | Stored as | Why |
| --- | --- | --- |
| Account | A number (`accountId`) with an owner address and a trusted-person address | Recovery (R23) swaps the owner address without moving any money. |
| Split | Five whole-number percentages, plus a pending split and the day it starts | R4, R21 |
| Allowances still releasing | Up to 6 records: start day and the four weekly amounts | R5, R8. A record is folded into the balances once its four shares are out. |
| Envelope balances | Per envelope: money released in, money taken out (held, collected, moved) | Available = in minus out. Computed on read, so no weekly transaction is needed. |
| Emergency | Locked balance, lock on or off, one open request (amount, reason fingerprint, time) | R16 to R20 |
| Purchases | Id, account, envelope, amount, kind of shop, time, state (held, collected, released, refunded), moved or not | R13, R15 |
| Shop-type table | Kind of shop to envelope, plus per-account overrides | R9, R15 |
| Used payment ids | A set | The same rupiah payment can never be deposited twice. |

### Functions

| Function | Who can call | What it does |
| --- | --- | --- |
| `register(split)` | Anyone without an account | Creates the account. |
| `saveSplit(split)` | Student | Starts the 48-hour wait (R21). Immediate if no allowance has ever arrived. |
| `createInvite(inviteKey, expiry)` | Student | Stores the one-time invite key's address (R22). |
| `acceptInvite(accountId, signature)` | New trusted person | Checks the invite key signed this caller's address, then links them. |
| `removeTrusted()` | Student | Starts the 48-hour wait. |
| `deposit(accountId, amount, paymentId)` | Treasury | Pulls AUSD from the treasury, splits it, records the schedule (R4 to R8). |
| `authorize(accountId, purchaseId, shopType, amount)` | Card service | Picks the envelope (R9, R10), holds the amount, or records a decline with a reason code. Never reverts for a decline, so declines are on the chain too. |
| `collect(purchaseId, amount)` | Card service | Sends up to the held amount to the settlement address; returns any difference to the envelope. |
| `releaseHold(purchaseId)` | Card service, or anyone after 7 days | Returns the hold to its envelope. |
| `refund(purchaseId, amount)` | Card service | Pulls AUSD back from settlement into the envelope that paid. |
| `movePurchase(purchaseId, toEnvelope)` | Student | R15. |
| `requestEmergency(amount, reasonHash)` | Student | R16. |
| `approveEmergency(accountId, requestSeq)` | Trusted person | Opens at once (R17). |
| `finalizeEmergency(accountId)` | Anyone, after 48 hours | Opens (R17, R19). The app calls it when the student next opens the app. |
| `cancelEmergency()` | Student | R16. |
| `startLockOff()` / `finishLockOff(accountId)` | Student / anyone after 48 hours | R20. |
| `approveRecovery(accountId, newOwner)` | Trusted person | Starts the 48-hour wait (R23). |
| `finishRecovery(accountId)` | Anyone, after 48 hours | Swaps the owner address. |
| `cancelPending(kind)` | Student (current owner) | Cancels a pending split, removal, lock-off or recovery (R24). |
| `envelopes(accountId)` | Anyone (read) | Returns available, not yet released, held and locked for all five envelopes, plus the next release day. |
| `totals(accountId)` | Anyone (read) | The five totals the trusted person sees (R25). |

### Events

Every write emits one event; the indexer builds everything from them. `AccountCreated`, `SplitSaved`, `InviteCreated`, `TrustedLinked`, `TrustedRemovalStarted`, `Deposited`, `PurchaseApproved` (with the envelope and whether Everyday stepped in), `PurchaseDeclined` (with the reason: blocked or not enough), `PurchaseCollected`, `HoldReleased`, `PurchaseRefunded`, `PurchaseMoved`, `EmergencyRequested`, `EmergencyOpened` (by approval or by time), `EmergencyCancelled`, `LockOffStarted`, `LockOffDone`, `RecoveryApproved`, `RecoveryDone`, `PendingCancelled`.

### Things that must always be true

1. The AUSD the contract holds equals the sum, over all accounts, of not yet released, available, held and locked money.
2. Locked money leaves the Emergency envelope only through R17 to R20.
3. A purchase lowers the available amount of exactly one envelope, never below zero.
4. Collected money goes only to the settlement address.
5. Only the owner address acts as the student; only the trusted address approves; the server keys can do only what R3 allows.
6. Every wait reads the same account clock.

### Details to get right

- **Weeks:** day number = the account's clock divided by 86.400 seconds. The account's clock is the block time plus any days skipped in demo mode. Monday number = (day number + 3) divided by 7, rounded down. Shares out = the smaller of 4 and 1 + Mondays passed since the start.
- **Invite binding:** the link carries a one-time private key. The contract stores only its address. Accepting needs that key's signature over the caller's own address, so someone watching the network cannot copy it.
- **Decimals:** AUSD is expected to use 6 decimals. Read `decimals()` at deploy time and in tests instead of assuming.
- **Fee limits on Monad:** the fee is charged on the limit a transaction sets, not on what it uses. Set limits from an estimate plus a small margin. Confirm against the Monad docs on day one.

## 8. Server endpoints and stored data

The server does four jobs: sponsor fees, take rupiah, stand in for the card network, and keep the few pieces of text that must not go on a public chain.

| Endpoint | Called by | What it does |
| --- | --- | --- |
| `POST /api/fund` | App, at sign-up and when the balance is low | Sends test MON to the caller's address (section 9). |
| POST /api/profile and GET /api/profile/\[account\] | Student's app / both apps | Stores and returns the student's name. It is the only personal detail asked at sign-up, and it never goes on the chain. |
| `POST /api/topup` | Parent's app | Creates a Midtrans Snap payment for an account and amount; returns the virtual account number and expiry. |
| `GET /api/topup/[order]` | Parent's app | Payment status: waiting, received and sending, sent, expired, failed. |
| `POST /api/midtrans/webhook` | Midtrans | Checks the signature, then calls `deposit` once per order id. |
| `POST /api/topup/[order]/simulate` | Parent's app, test mode only | Marks the order paid and runs the same deposit path as the webhook. |
| `POST /api/card/authorize` | Checkout screen, signed by the account owner | Turns the shop amount into dollars, calls `authorize`, stores the shop name, returns approved or declined with the envelope and the transaction. |
| `POST /api/card/collect` | A timer on the server, or a Collect now button in demo mode | Calls `collect` for a held purchase. |
| `POST /api/invite` and `GET /api/invite/[code]` | Student's app / invite page | Stores and returns the names shown on the invite screen. |
| `POST /api/reason` and `GET /api/reason/[request]` | Student's app / approval page | Stores and returns the Emergency reason text. The contract holds its fingerprint so it cannot be changed later. |
| `GET /api/purchases` | Student's app | Returns shop names for the student's own purchases. |

**Proving who is asking.** Any endpoint that returns private text asks the caller to sign a short message with their account key. Shop names go only to the account owner. Reasons go to the owner and the trusted person. The message format and replay rules are in section 15.

**Database tables:** `orders` (Midtrans order, account, rupiah, dollars, status, deposit transaction), `purchases` (purchase id, shop name, city, shop currency and amount), `invites` (code, trusted-person name), profiles (account, student name), `reasons` (request, text), `funding` (address, times funded, last time).

**Card authorisation message.** The request body follows the fields a real issuer sends: card token, amount, currency, merchant name, merchant city, merchant category code. That is what makes swapping in a real issuer later a server change only.

**Kind-of-shop codes used in the demo:**

| Shop on the Card screen | Category code | Envelope |
| --- | --- | --- |
| Supermarket | 5411 | Food |
| Tram and train | 4111 | Transport |
| Bookshop | 5942 | Everyday by default, Study after one move |
| Cinema | 7832 | Everyday |
| Gambling site | 7995 | Blocked |

## 9. Passkey accounts and the network fee

Mera turns a passkey into a normal account, so the account pays its own network fee. The server covers that by sending each account a little test MON.

**Accounts**

- A passkey creates the account. There is no password and no recovery phrase. The only thing a new student types is their name (board 0.2b); a new trusted person types nothing. No email, phone number or ID is asked, because the demo card has no issuer that requires them. A real card would add an identity check at the moment the card is ordered.
- A passkey synced by the phone's password manager gives the same account on a new phone. Recovery (R23) is only for a passkey that is truly lost.
- The app checks passkey support when it loads. If the browser cannot do it, the Welcome screen says which browser to use instead of failing at the button.
- Links opened inside a chat app's browser go to board 0.1 first.

**Fee top-up**

1. Right after the passkey is created, the app calls `POST /api/fund` with the new address.
2. The server sends enough test MON for about 20 actions and records it.
3. Before each user transaction, the app checks the balance. Under about 3 actions' worth, it asks for another top-up and waits for it.
4. Limits: 5 top-ups per address per day and 20 new addresses per device per day. Section 15 adds a signature from the address, a per-IP limit and a daily cap.
5. The first top-up goes out while the user is on the envelope set-up screen, so it has landed before their first action.

The user never sees MON, a fee, or a wallet prompt. The docs say that fees are sponsored in this version and that a relayer replaces the top-up for a real launch.

**Which transactions the user signs:** save the split, create an invite, accept an invite, ask for Emergency, approve Emergency, cancel, move a purchase, lock off, approve a recovery. Deposits and card payments are sent by the server keys.

## 10. Rupiah top-up

The parent pays by bank transfer through Midtrans Snap in sandbox mode; when the payment is confirmed, the treasury deposits the matching dollars into the student's account.

1. The parent enters a rupiah amount. The app shows the dollar amount at the sample rate and the split.
2. `POST /api/topup` creates the order and locks the rate for that order.
3. The waiting screen shows the virtual account number, the bank, and the expiry time.
4. Midtrans calls the webhook when the transfer is made. In test mode the Simulate payment button does the same thing.
5. The server checks the signature: SHA-512 of order id + status code + gross amount + server key.
6. The server calls `deposit` once for that order id. The contract also refuses a repeated payment id.
7. The parent sees Allowance sent with the transaction link. The student sees Allowance arrived.

| State | What the parent sees | What happens next |
| --- | --- | --- |
| Waiting | "Not received yet" and the time of the last check | The app checks again every few seconds. |
| Received, sending | "Payment received, sending to Raka" | The server retries the deposit until it succeeds. |
| Sent | Allowance sent | Done. |
| Expired | "This number has expired" with a Start again button | A new order is needed. |
| Failed | "The payment did not go through" with a Start again button | Nothing was deposited. |

**Limits in test mode:** Rp100.000 minimum and Rp50.000.000 maximum per allowance. The treasury keeps at least 20.000 test AUSD and refills from the faucet (10.000 per request, once a minute) when it drops below that.

**Sample rate:** $1 = Rp16.500, fixed in configuration and labelled "sample rate" on screen. Fee: Rp0.

## 11. Indexer

Envio HyperIndex listens to the contract's events and serves the activity list and the parent's alerts through one GraphQL address.

| Entity | Built from | Used by |
| --- | --- | --- |
| `Account` | `AccountCreated`, `TrustedLinked`, `RecoveryDone` | Finding the account for a signed-in address; the parent's linked student. |
| `Deposit` | `Deposited` | Activity ("Allowance from Mama"), Allowance arrived. |
| `Purchase` | `PurchaseApproved`, `PurchaseDeclined`, `PurchaseCollected`, `HoldReleased`, `PurchaseRefunded`, `PurchaseMoved` | Activity, envelope detail, move a purchase. |
| `EmergencyRequest` | `EmergencyRequested`, `EmergencyOpened`, `EmergencyCancelled` | Waiting screen history, approval page. |
| `Alert` | Declined-blocked purchases, Emergency requests, moves, saved rule changes, recoveries | Parent home notifications (R26). |

**What does not depend on the indexer:** balances, totals, the release schedule, the open Emergency request, and the result of a card payment. Those are read straight from the contract, so the three core flows work when the indexer is down. Activity then shows "History is catching up".

**Low-envelope alert:** worked out in the parent's app from the contract's totals, not stored.

**For the Envio bounty entry:** the config, the schema, the handlers, and one screenshot of the parent's alerts next to the query that feeds them.

## 12. Demo controls

A weekly release and a 48-hour wait cannot be shown in a 3-minute video or tried by a judge in one sitting, so the demo deployment adds four clearly labelled controls. None of them exist in a real deployment.

| Control | Where | What it does |
| --- | --- | --- |
| Simulate payment | Waiting for payment (1.3) | Stands in for the parent's banking app. |
| View as Mama / View as Raka | Settings (4.1) and Parent home (1.1) | Switches between two passkey profiles on one phone, so one person can play both roles. Each profile is a real, separate account. |
| Skip time | Settings (4.1), demo section | "Skip to next Monday" and "Skip 48 hours". Moves that one account's clock forward. |
| Collect now | Purchase detail, for a held purchase | Stands in for the shop collecting its money. |

**How Skip time works.** The contract is deployed with a demo switch. When it is on, an account owner can add whole days to their own account's clock by calling skipDays. Every rule reads that clock, so releases, the 48-hour waits and the 7-day hold all behave exactly as they would in real time. Skipping affects only that account. With the switch off, the function always fails.

**How it is shown.** While any demo control is available, a thin banner at the top of the app reads "Demo mode: payments are simulated and time can be skipped". Dates on screen follow the account's clock.

**What the README says:** real values are 7 days between shares, 48 hours for every wait, 7 days for a hold; the demo deployment keeps those values and adds a skip.

## 13. Deliverables beyond the app

The submission is judged on more than the app, so each item below has an owner day in the schedule.

| Deliverable | Must contain | Required by |
| --- | --- | --- |
| Public repository | MIT licence, commits inside the event window, the four folders from section 6 | Event rules |
| README | What it is in three sentences, live links, contract addresses, set-up steps, architecture and tech stack, the real / simulated table (section 3), attribution, AI-tool disclosure | Event rules |
| Deployed contract | Address on Monad testnet, verified source | Event rules |
| Live app | Landing page and app on one public address, working on a phone | Product quality |
| Demo video | 3 minutes or less; script below | Event rules |
| Portal submission | Project description, track, links, team | Event rules |
| Docs site | Architecture, contracts, API, issuer integration, trust and security, how Amplop differs from other cards, try-it guide, user guide, roadmap | Technical excellence |
| Landing page | As in the mock-up (board 0.0) | Product quality |
| Agora bounty entry | How AUSD is used: cross-border allowance, held and released by rule, paid out at purchase | Agora |
| Envio bounty entry | Section 11's list | Envio |
| Interview summary | What 10 students and parents said, in one page | Track fit |
| Tests | Section 14, with the command to run them in the README | Technical excellence |
| Pitch video | 2 minutes or less: who you are, the problem, why you are building it. Separate from the demo video. | Portal form (required field) |
| Agora bounty video | 2 minutes or less: passkey sign-up, an AUSD balance, and one completed send and receive that settles at once (the parent's allowance arriving in the student's envelopes). | Agora bounty form (required field) |
| Go-to-market answer | First users and how to reach them: Indonesian student associations abroad, with each student inviting one parent. | Portal form (required field) |
| Judge access instructions | The try-it guide's eight steps, pasted into the portal. | Portal form (optional field) |

**Video script, 3 minutes**

1. 0:00 to 0:20. The problem: allowance sent once a month is gone by week two, and parents abroad cannot see or help.
2. 0:20 to 0:50. Raka creates a passkey, sets five envelopes, invites Mama.
3. 0:50 to 1:20. Mama accepts on her phone, sends Rp16.500.000, and it arrives as $1.000 already split.
4. 1:20 to 2:00. Raka pays at a supermarket: approved from Food in about a second. A gambling site: declined. Mama's app shows the category, not the shop.
5. 2:00 to 2:25. Skip to next Monday: the next share is released.
6. 2:25 to 2:50. Raka asks for $70 from Emergency. Mama approves with her passkey. It moves to Everyday.
7. 2:50 to 3:00. What is real, what is simulated, and what comes next.

**Try-it guide for judges:** one page, phone first, eight numbered steps that match the video, using View as Mama so one person can finish it alone in under 5 minutes.

**Wording rules for the README, docs site, video and portal text**

| Topic | Rule |
| --- | --- |
| The crypto-free experience | State it once, as a design principle, with facts a judge can see: sign-in is a passkey with no recovery phrase; the user never sees or pays a network fee; there is no wallet prompt; the token name appears only in the small detail panel beside a transaction proof. Give the reason in our own words: parents and students should not need new vocabulary to send or spend an allowance. |
| What not to say about it | Never call it an innovation, and never compare it with another company. |
| What is new | Lead with these five: money split into envelopes on arrival; weekly release; the contract itself deciding each card payment; a trusted person who can open Emergency but cannot block it; a parent who sees totals, not shops. |
| The "what is new" claim | On the docs site only, in this form: "We reviewed eight stablecoin cards launched or announced by October 2026. On their public pages, none offered purpose envelopes, timed release, or a second person who can approve." The eight names and links go in a footnote. Keep the words "on their public pages", because the apps themselves were not opened. |
| Other products | Named nowhere else in writing: not in the video, the portal text, or the README. |
| Privacy | Say "the parent sees totals, not shops". Never say "private"; purchase amounts are public on the chain (R27). |

The eight cards and the evidence behind the claim are in the research report "Crypto cards tweet vs Amplop 2".

## 14. Test plan

Four layers: contract tests that prove the rules, server tests for the two places money could be created twice, 140 end-to-end cases that drive the real app, and a two-phone script run by hand before recording.

**Contract tests (Foundry).** One test per rule number, named after it.

| Area | Cases |
| --- | --- |
| Split and deposit | Percentages must total 100; rounding cents land in Everyday; the same payment id cannot deposit twice; only Treasury can deposit. |
| Release | Share 1 on arrival; shares 2 to 4 on the next three Mondays; arrival on a Sunday and on a Monday; nothing after share 4; two overlapping allowances add up. |
| Card | Matching envelope pays; Everyday steps in when the match is short; decline when both are short; never split; Emergency never pays; gambling always declined with no balance change; only Card service can authorise. |
| Holds | Collect less than held returns the difference; collect more than held fails; release after 7 days by anyone; refund returns to the paying envelope. |
| Move | Only from Everyday; only once; only within 7 days; fails if the target is short; the override then applies to the next purchase. |
| Emergency | Request above the locked balance fails; approve opens at once; opens by time at exactly 48 hours and not one second before; cancel; second request while one is open fails; no trusted person. |
| Changes | New split applies only to later allowances; lock-off after 48 hours moves the balance; cancel each pending change. |
| Invite | Works once; expires after 7 days; a signature made for another address fails. |
| Recovery | Only the trusted person can approve; the old owner can cancel; after 48 hours the new owner controls the account and the old one does not. |
| Demo switch | Skipping days fails when the switch is off; skipping affects only the caller's account. |
| Whole-contract check | A fuzz test runs random sequences of all actions and checks the six always-true statements from section 7 after each step. |

**Server tests**

- A webhook with a wrong signature is refused.
- The same webhook delivered three times produces one deposit.
- A deposit that fails on the chain is retried and still produces one deposit.
- Fee top-up limits hold.
- Private text is refused without a valid signature from the right account.

**Two-phone script, by hand.** Run on one Android phone with Chrome and one iPhone with Safari, then swap roles.

- [ ] Open the invite link from WhatsApp on each phone; board 0.1 appears when it should.
- [ ] Create both passkeys; close and reopen the browser; sign in again.
- [ ] Send an allowance with Midtrans sandbox, and once more with Simulate payment.
- [ ] One approved purchase per envelope, one Everyday step-in, one blocked, one not enough.
- [ ] Skip to next Monday; the amounts match section 4.
- [ ] Emergency: approve path, and the 48-hour path with Skip time.
- [ ] Turn the indexer off; the three core flows still work.
- [ ] Every transaction link opens the right transaction.

### End-to-end tests

An end-to-end test drives the real app in a real browser, from a tap on the screen to a transaction and back, with nothing faked in between except the bank and the clock. There are 140 cases below: 35 normal paths and 105 edge cases.

**How they run**

| Part | Choice | Why |
| --- | --- | --- |
| Runner | Playwright, phone-sized window (390 by 844), Chromium and WebKit | Same two engines as the Android and iPhone browsers. |
| Two people | Two separate browser profiles in one test, named Raka and Mama | Every flow that crosses phones is tested as it really happens. |
| Passkeys | The browser's built-in test authenticator, with the passkey extension Mera needs switched on | No fingerprint is needed, and each profile gets its own real key. Confirm on day one that Mera accepts it. |
| Chain | A local chain (Anvil) with the real contract in demo mode and a stand-in AUSD token | Fast, free and repeatable. Tier 1 also runs once against Monad testnet before recording. |
| Time | The demo Skip time control | Weeks and 48-hour waits pass in one call. |
| Bank | Simulate payment, plus webhooks the test signs itself with the sandbox key | Covers both paths without waiting on Midtrans. |
| Indexer | On for the Activity and alert cases, deliberately off for one group | Proves the core flows do not depend on it. |

**Tiers.** One person cannot automate 140 cases in nine days, so each case has a tier.

| Tier | Meaning | Count |
| --- | --- | --- |
| 1 | Automated. Must pass before the video is recorded. | 40 |
| 2 | Automated if the day allows; otherwise run by hand once on Monday 12 Oct. | 65 |
| 3 | Run by hand once. Mostly device and wording checks. | 35 |

Tier 1 cases are written on the same day as the feature they cover (section 16), not saved for the end.

**What every money case checks at the end,** so it is not repeated in each row: the five envelope amounts on the student's home, the five totals on the parent's home, and the contract's own figures all agree; and any transaction link on screen opens a transaction that exists.

**A. Sign-up and set-up**

| ID | Kind | Case | Expected | Tier |
| --- | --- | --- | --- | --- |
| A1 | Normal | New student: create passkey, type name, keep the default split, skip the invite | Account exists on the chain, fee top-up has arrived, home 0.7 shows five envelopes at $0,00 | 1 |
| A2 | Normal | Sign out, then Sign in with passkey | Same account and the same home | 1 |
| A3 | Normal | Change the split to 50 / 10 / 10 / 20 / 10 and continue | The saved split matches; total shows 100% | 1 |
| A4 | Edge | Passkey prompt is cancelled | Stays on Welcome with a plain message; a second try works | 2 |
| A5 | Edge | Browser without passkey support | Welcome names a browser to use; the button is off | 3 |
| A6 | Edge | Link opened inside a chat app's browser | Board 0.1 appears; Copy link copies the address | 2 |
| A7 | Edge | Sign in with a passkey that has no account | "No account for this passkey" with a way to create one | 2 |
| A8 | Edge | Name left empty, or only spaces | Continue stays off | 1 |
| A9 | Edge | Name of 60 letters; name with non-Latin letters | Saved in full; shortened with an ellipsis on the card; nothing overflows | 3 |
| A10 | Edge | Split totals 95% or 105% | Continue stays off and the total is marked | 1 |
| A11 | Edge | Minus at 0% and plus when the total is 100% | Both buttons are off; no envelope goes below 0 | 2 |
| A12 | Edge | Emergency set to 0%; one envelope set to 100% | Both are accepted | 2 |
| A13 | Edge | Page reloaded after the passkey but before the name | Returns to the name step, not to Welcome | 2 |
| A14 | Edge | Back through the set-up steps | Typed values are kept | 3 |
| A15 | Edge | Fee top-up is slow or fails once | The first action waits, shows "Getting ready", then goes through | 2 |
| A16 | Edge | Fee top-up limit reached | A clear message; no silent failure | 3 |
| A17 | Edge | Language switched to Bahasa Indonesia | Text changes; money keeps the same format | 3 |

**B. Invite and linking**

| ID | Kind | Case | Expected | Tier |
| --- | --- | --- | --- | --- |
| B1 | Normal | Raka shares the invite; Mama opens it in her own profile, accepts, creates a passkey | Mama lands on Parent home showing Raka's envelopes; Raka's home says Mama is linked | 1 |
| B2 | Normal | Mama taps Not now | Nothing changes; the link still works later | 3 |
| B3 | Edge | The same link opened a second time by someone else | "This invite has already been used" | 1 |
| B4 | Edge | Link opened after 8 days | "This invite has expired" | 2 |
| B5 | Edge | Raka opens his own invite link | Refused: a student cannot be their own trusted person | 2 |
| B6 | Edge | Link with a changed code | "This invite is not valid" | 2 |
| B7 | Edge | Raka makes a second invite while the first is unused | The first stops working; only the newest works | 2 |
| B8 | Edge | Someone who is already a trusted person opens another student's invite | Refused in this version, with a message | 3 |
| B9 | Edge | Mama cancels her passkey prompt | Stays on the invite; a second try works | 3 |
| B10 | Normal | Raka replaces the trusted person | 48-hour wait starts; Mama sees an alert; after Skip 48 hours the new invite links and the old person sees nothing | 2 |
| B11 | Edge | Raka cancels the replacement during the wait | Mama stays linked | 2 |

**C. Sending an allowance**

| ID | Kind | Case | Expected | Tier |
| --- | --- | --- | --- | --- |
| C1 | Normal | Mama sends Rp16.500.000 with Simulate payment | $1.000,00 arrives split 400 / 150 / 150 / 200 / 100; first shares 100 / 37,50 / 37,50 / 50 are available; Raka sees Allowance arrived | 1 |
| C2 | Normal | Same amount through a signed sandbox webhook | Same result as C1 | 1 |
| C3 | Normal | Mama closes the app while waiting, then reopens | Returns to the same order in its current state | 2 |
| C4 | Edge | Webhook with a wrong signature | Refused; no deposit | 1 |
| C5 | Edge | The same webhook delivered three times | One deposit | 1 |
| C6 | Edge | Simulate payment tapped twice quickly | One deposit | 1 |
| C7 | Edge | Webhook says pending, expired or cancelled | Status updates; no deposit | 2 |
| C8 | Edge | Order left past its expiry | "This number has expired" with Start again | 2 |
| C9 | Edge | Treasury has too little AUSD when the payment lands | "Payment received, sending"; after a refill it completes once | 2 |
| C10 | Edge | Amount below Rp100.000 or above Rp50.000.000 | Continue is off, with the limit shown | 2 |
| C11 | Edge | Letters or an empty amount | Continue is off | 3 |
| C12 | Edge | Rp1.234.567, which does not divide evenly | The five parts add up to the dollar total exactly; spare cents are in Everyday | 1 |
| C13 | Edge | Change amount after an order exists, then the old order is paid | The old payment is still deposited and shown; nothing is lost | 3 |
| C14 | Normal | A second allowance in week 2 of the first | Each envelope shows the sum; both schedules keep their own Mondays | 1 |
| C15 | Edge | A deposit lands while a new split is still waiting | The old split is used | 2 |
| C16 | Edge | A deposit lands after the Emergency lock is off | The Emergency share goes to Everyday | 2 |
| C17 | Edge | Raka opens a parent address; an unlinked person opens Send allowance | Both are sent away; nothing is created | 2 |

**D. Weekly release**

| ID | Kind | Case | Expected | Tier |
| --- | --- | --- | --- | --- |
| D1 | Normal | After C1, Skip to next Monday three times | Available grows by 225 each time; after the fourth share nothing more is added | 1 |
| D2 | Normal | Nothing is spent in week 1 | Week 2 shows both shares; unspent money carries over | 1 |
| D3 | Edge | Allowance arrives on a Sunday | Share 2 is released the next day | 2 |
| D4 | Edge | An envelope amount that does not divide by 4 | Three equal shares; the last one carries the spare cents | 2 |
| D5 | Edge | Skip 3 days, which is not a Monday | Nothing is released; the next-release date is unchanged | 2 |
| D6 | Edge | After the fourth share | Home says no more shares are due; the week counter does not read "week 5 of 4" | 3 |
| D7 | Edge | Skip tapped twice quickly | Time moves once per tap; no double release | 3 |

**E. Paying by card**

| ID | Kind | Case | Expected | Tier |
| --- | --- | --- | --- | --- |
| E1 | Normal | Supermarket, 12,50 euro | Approved, $14,39 from Food, on hold; Food shows $14,39 less | 1 |
| E2 | Normal | Tram and train; cinema with enough in Everyday | Approved from Transport; approved from Everyday | 1 |
| E3 | Normal | Food is short, Everyday has enough | Approved from Everyday; the result says Food was short | 1 |
| E4 | Normal | Collect now on a held purchase | Status becomes Collected; the amount leaves for the settlement address | 1 |
| E5 | Edge | Matching envelope and Everyday are both short | Declined, "not enough"; no balance changes | 1 |
| E6 | Edge | Cinema when Everyday itself is short | Declined; Food, Transport and Study are untouched | 1 |
| E7 | Edge | Gambling site | Declined; no balance changes; Mama's alert shows the category and never the shop | 1 |
| E8 | Edge | Gambling site with no trusted person | Declined; no alert is created and nothing fails | 2 |
| E9 | Edge | Amount exactly equal to what is available | Approved; the envelope shows $0,00 | 2 |
| E10 | Edge | Every weekly envelope is empty, Emergency holds money | Declined; Emergency is untouched | 1 |
| E11 | Edge | Purchase before any allowance has arrived | Declined, "not enough" | 2 |
| E12 | Edge | Amount of 0, empty, negative, or with three decimals | Pay stays off | 2 |
| E13 | Edge | Pay tapped twice quickly | One purchase | 1 |
| E14 | Edge | Two purchases at the same moment for the last dollars | One approved, one declined; the envelope never goes below zero | 2 |
| E15 | Edge | Shop collects less than was held | The difference returns to the envelope | 2 |
| E16 | Edge | Hold not collected; Skip 7 days | The hold is released back to the same envelope | 2 |
| E17 | Edge | Collect after the hold was released | Refused; nothing moves | 3 |
| E18 | Edge | Refund of a collected purchase | The money returns to the envelope that paid | 2 |
| E19 | Edge | A kind of shop the table does not know | Everyday pays | 2 |
| E20 | Edge | Shop priced in dollars | No conversion; the dollar amount is charged as is | 3 |
| E21 | Edge | Card service cannot reach the chain | "Nothing was charged"; no hold exists; a retry is safe | 2 |
| E22 | Edge | Checkout from a session whose passkey no longer owns the account | Refused | 2 |

**F. Activity and moving a purchase**

| ID | Kind | Case | Expected | Tier |
| --- | --- | --- | --- | --- |
| F1 | Normal | Open Activity after E1, E7 and D1 | Newest first; each row has the right envelope, status and amount; shop names show | 1 |
| F2 | Normal | Move a bookshop purchase from Everyday to Study | Everyday gets the amount back; Study pays; Mama's alert names the two envelopes only | 1 |
| F3 | Normal | Buy at a bookshop again after F2 | Study pays without asking | 2 |
| F4 | Edge | Move when the target envelope is short | Refused, with the reason | 2 |
| F5 | Edge | Move the same purchase a second time | No move option is offered | 2 |
| F6 | Edge | Purchase paid from Food, Transport or Study | No move option is offered | 2 |
| F7 | Edge | Purchase older than 7 days | No move option is offered | 3 |
| F8 | Edge | Declined purchase | No move option is offered | 3 |
| F9 | Edge | Purchase that Everyday paid because Food was short (E3) | It can be moved to Food once Food has enough | 3 |
| F10 | Edge | Indexer switched off | Activity says "History is catching up"; home, card and Emergency still work | 1 |
| F11 | Edge | Indexer switched back on | Activity fills in, including what happened while it was off | 2 |

**G. Emergency**

| ID | Kind | Case | Expected | Tier |
| --- | --- | --- | --- | --- |
| G1 | Normal | Raka asks for $70 with a reason; Mama approves | $70,00 moves to Everyday at once; $30,00 stays locked; both phones show it | 1 |
| G2 | Normal | Raka asks; nobody answers; Skip 48 hours; Raka opens the app | It opens by itself and the money is in Everyday | 1 |
| G3 | Normal | Opened money is spent at the cinema straight away | Approved from Everyday | 2 |
| G4 | Normal | A second request for the remaining $30 after the first is done | Works the same way; Emergency shows $0,00 | 2 |
| G5 | Normal | No trusted person: start the 48-hour wait, then skip | Opens after 48 hours; no approval step is shown | 1 |
| G6 | Edge | Amount above the locked balance, or 0 | Send stays off | 1 |
| G7 | Edge | Reason left empty, or longer than 280 characters | Send stays off; the counter shows the limit | 3 |
| G8 | Edge | A second request while one is open | The waiting screen is shown instead of the form | 2 |
| G9 | Edge | Raka cancels the request | Locked balance is unchanged; Mama's link says it was cancelled | 2 |
| G10 | Edge | Mama opens the link after it opened by itself | "Already opened"; no second transfer | 2 |
| G11 | Edge | Approve tapped twice quickly | One approval | 2 |
| G12 | Edge | Someone who is not the trusted person opens the approval link | The reason is not shown and approving is refused | 1 |
| G13 | Edge | Skip 47 hours only | Still locked | 2 |
| G14 | Edge | The trusted person is replaced while a request is open | The new one can approve; the old one cannot | 3 |
| G15 | Edge | Emergency share is 0% | The home shows nothing to open | 3 |
| G16 | Normal | Switch the Emergency lock off, Skip 48 hours | The whole balance moves to Everyday; the next allowance's Emergency share arrives unlocked | 2 |
| G17 | Edge | Lock-off cancelled during the wait | Emergency stays locked | 3 |
| G18 | Edge | Mama taps Message Raka first | WhatsApp opens; the request is unchanged | 3 |

**H. Rule changes**

| ID | Kind | Case | Expected | Tier |
| --- | --- | --- | --- | --- |
| H1 | Normal | Change the split before any allowance has arrived | Takes effect at once | 2 |
| H2 | Normal | Change the split after an allowance; Skip 48 hours; send another | The first allowance keeps its old split; the second uses the new one | 1 |
| H3 | Edge | Money already in envelopes after a split change | Not re-divided | 2 |
| H4 | Edge | A second change while one is waiting | Replaces the first and restarts the 48 hours | 3 |
| H5 | Edge | Change cancelled during the wait | The old split stays | 3 |
| H6 | Edge | Mama's app during the wait | An alert says a new split was saved and when it starts | 2 |

**I. Account recovery**

| ID | Kind | Case | Expected | Tier |
| --- | --- | --- | --- | --- |
| I1 | Normal | New profile, new passkey, recovery link to Mama, she approves, Skip 48 hours | The new passkey controls the account; every balance, hold and open request is unchanged | 1 |
| I2 | Normal | The same passkey used from a new profile, as a synced passkey would be | Signs straight in; no recovery is needed | 3 |
| I3 | Edge | The old passkey cancels during the wait | The old passkey keeps the account; the new one gets nothing | 1 |
| I4 | Edge | The old passkey after the move | Refused everywhere, including checkout | 2 |
| I5 | Edge | Mama never approves | Nothing happens, however much time is skipped | 2 |
| I6 | Edge | Someone other than the trusted person opens the recovery link | Refused | 2 |
| I7 | Edge | Mama taps This was not Raka | The request is dropped | 3 |
| I8 | Edge | No trusted person | The recover screen says recovery is not possible and why | 3 |
| I9 | Edge | The new passkey already owns another account | Refused | 3 |

**J. Parent view and privacy**

| ID | Kind | Case | Expected | Tier |
| --- | --- | --- | --- | --- |
| J1 | Normal | Parent home after C1, E1 and G1 | Each total equals available plus not yet released | 1 |
| J2 | Normal | Alerts after E7, F2, G1, H2 and I1 | One alert for each, newest first, with the right wording | 2 |
| J3 | Edge | An envelope falls under 20% of this week's share | A low-envelope alert appears; it goes away after the next release | 2 |
| J4 | Edge | Mama's profile asks the server for Raka's shop names | Refused | 1 |
| J5 | Edge | Mama's app | No screen or address shows a shop name or a list of purchases | 2 |
| J6 | Edge | A replaced trusted person signs in | Sees nothing of Raka's account | 2 |
| J7 | Edge | Mama opens before any allowance | Totals are $0,00 with a prompt to send the first one | 3 |

**K. Demo controls**

| ID | Kind | Case | Expected | Tier |
| --- | --- | --- | --- | --- |
| K1 | Normal | View as Mama, then View as Raka, on one profile | Each switch signs in as the other real account | 1 |
| K2 | Normal | The demo banner | Shown on every app screen while demo controls exist | 3 |
| K3 | Edge | Skip time by one account | Another account's dates and releases do not move | 2 |
| K4 | Edge | A build with demo mode off | No Simulate, Skip, Collect now or View as buttons; their addresses answer "not found"; skipping fails on the contract | 2 |

**L. Landing page, devices and failures**

| ID | Kind | Case | Expected | Tier |
| --- | --- | --- | --- | --- |
| L1 | Normal | Landing page: Open the app | Goes to Welcome; the menu links scroll to their sections | 2 |
| L2 | Normal | Every "View transaction proof" link in the app | Opens a transaction that exists and matches the amount | 1 |
| L3 | Edge | The words "crypto", "blockchain", "hackathon" and "Monad" on the landing page | None appear | 2 |
| L4 | Edge | Connection lost at the moment of an action | A message with Try again; nothing is half-saved | 2 |
| L5 | Edge | The chain connection is rate-limited | The app switches to the second provider without the user noticing | 3 |
| L6 | Edge | A transaction fails on the chain | A plain message with Try again; the screen does not hang | 2 |
| L7 | Edge | Reload on every screen, and open each address directly | The right screen and state come back | 2 |
| L8 | Edge | The same account open in two tabs | Both show the same balances after a refresh; no double action | 3 |
| L9 | Edge | A 360 by 640 screen and the phone's largest text size | No text is cut off on the home, card, checkout or approval screens | 3 |
| L10 | Edge | Screen reader labels and tap sizes on the six main screens | Every button has a name and is at least 44 pixels tall | 3 |
| L11 | Edge | Money formats in English and Bahasa Indonesia | $1.000,00 and Rp16.500.000 everywhere | 3 |

**Behaviour these tests pin down.** Writing the edge cases settled eight points the earlier sections left open. They now count as rules.

1. A person can be the trusted person for one student only (B8).
2. A new invite cancels any unused earlier invite (B7).
3. A payment on an order the parent has replaced is still deposited (C13).
4. A checkout request must be signed by the passkey that currently owns the account (E22, I4).
5. A purchase still on hold can be moved; a declined one cannot (F8).
6. The Emergency reason is required, up to 280 characters (G7).
7. A second pending change of the same kind replaces the first and restarts its wait (H4).
8. A recovery cannot move an account to a passkey that already owns one (I9).

**What this list cannot promise.** These are the edge cases I could find by walking every screen, rule and failure point. No list can be proved complete. The contract's fuzz test (above) is the safety net for combinations nobody thought of, and any bug found by hand becomes a new case here.

## 15. Code quality and security

Every deploy, and the code freeze at 18:00 on 13 Oct, must pass every gate in this section. No one can prove that software has zero vulnerabilities. So "done" means three things: zero known high or medium findings, every check green, and every remaining risk written down in `SECURITY.md`.

Amplop runs on testnet with sandbox payments, so a break-in costs only test money. It still matters: judges read the code, and the security story is part of the pitch.

### Code quality rules

| Area | Rule |
| --- | --- |
| TypeScript | `strict` plus `noUncheckedIndexedAccess`. No `any`. No `@ts-ignore`; a `@ts-expect-error` needs its reason on the same line. |
| Lint and format | ESLint with typescript-eslint `strict-type-checked`, React Hooks and Next.js rules, plus Prettier. Solidity: `forge fmt` and solhint. Zero errors and zero warnings. |
| Money | Amounts are `bigint` in token units (6 decimals) everywhere, never JavaScript numbers. Rupiah to dollars happens in one pure function that rounds down to the unit, with unit tests. |
| Inputs | Every request body, query and webhook is parsed with a zod schema at the edge. Unknown fields are rejected. |
| Contract types | ABI types are generated from the Foundry build (wagmi CLI), never copied by hand. |
| Structure | One folder per job: fund, topup, card, invite, reason, profile. Route handlers stay thin; the logic lives in pure functions that unit tests cover. |
| Errors | No empty `catch`. Users see a short, plain message; full detail goes only to server logs. |
| Logs | Structured JSON. Never log keys, signatures, invite keys, names, reasons or shop names. |
| Solidity | Exact compiler version pinned (0.8.x). Custom errors. NatSpec on every external function. An event on every state change (section 7). |
| Coverage | Contract: at least 95% of lines and 90% of branches (`forge coverage`). Server logic: at least 85% of lines (Vitest). Plus the 140 end-to-end cases. |
| Commits | Never one big commit. Commit after each finished piece (a feature plus its tests), about every 30–90 minutes, and push at least once a day. Never squash the history or force-push `main`. Messages follow `type(area): what changed`, for example `feat(card): decline gambling purchases`. Self-audit fixes name their finding: `fix(contract): cap skipDays (SA-03)`. Every commit passes the pre-commit hook, so `main` is always deployable. The same rule applies when an AI agent makes the commits. |

### Threats and the required fix

Each row is a requirement, not a suggestion. The first five rows close gaps in the design as written in sections 8, 9 and 12.

| What an attacker tries | Where | Required fix |
| --- | --- | --- |
| Spend a student's money by calling the card endpoint with their card | `POST /api/card/authorize` | The request carries the account owner's signature (demo), or the issuer's HMAC (later). The card token is a random 128-bit value, never the address. Rate limit per card. |
| Drain the fee sponsor by asking for top-ups for many addresses | `POST /api/fund` | The address being funded must sign the request. Skip addresses already above 3 actions' worth. Limit per address and per IP; the device id comes from the client, so it is never the only limit. A daily cap of 50 MON in total; past it, top-ups stop and an alert fires. |
| Replay a signed request seen once | Private text, profile, card | The signed message names the site, chain id 10143, the action, the account, a single-use server nonce and the time. A nonce expires after 5 minutes; used nonces are stored. |
| Fake or replay a payment notification | `POST /api/midtrans/webhook` | Check `signature_key` = SHA-512(order id + status code + gross amount + server key) with a constant-time compare. Then fetch the status from the Midtrans API. Deposit only on `settlement`, only when the amount equals the order's, once per order id (unique key in the database). |
| Use test-only tools on a real deployment | Simulate payment, Collect now, Skip time, View as Mama | A server flag `DEMO_MODE`. When it is off, those routes return 404, and the contract is deployed with its demo switch off, which cannot be changed later. Hiding a button is never the control. |
| Read another parent's order by guessing its id | `GET /api/topup/[order]`, invites, reasons | Every id is a random 128-bit value; nothing is numbered in order. The order endpoint returns status only. |
| Steal the passkey-derived key with injected script | Web app | A strict Content-Security-Policy with nonces: no inline script, no `unsafe-eval`. No `dangerouslySetInnerHTML`. Names, reasons and shop names render as plain text. The derived key lives in memory. Its only stored copy is encrypted under a key that page script cannot read, kept for one tab, and dropped on sign-out, when the tab closes, or after 30 minutes away (06 S06-16a). Never in logs. |
| Read the invite's one-time key from logs | Invite link | The key goes after `#` in the link, which browsers never send to a server. `Referrer-Policy: no-referrer`. The server only ever sees the invite's address. |
| Reuse an invite or recovery signature elsewhere | Contract | EIP-712 signatures that name chain id 10143 and the contract address, each usable once. |
| Re-enter the contract during a transfer, or break the money total | Contract | Checks before effects before transfers, `ReentrancyGuard` on every function that moves AUSD, `SafeERC20`. Invariant tests for the six rules in section 7. |
| Use a stolen server key | Server keys | Three wallets, each allowed only what R3 gives it, each holding only a few days' budget. Keys sit in Vercel's encrypted settings, never in a `NEXT_PUBLIC_` variable. A build step searches the browser bundle for key patterns. |
| Inject SQL | Database | Queries only through the ORM with parameters, never built from strings. The production database user cannot change tables. |
| Flood the server to run up cost | Every `POST` | Rate limits per IP and per account. A 10 KB body limit. The 280-character reason limit is checked on the server too. |
| Frame the app, or downgrade the connection | Web app | Headers: HSTS, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, a Permissions-Policy that allows only what passkeys need. CORS: same origin only. |
| Ship a malicious or vulnerable package | Dependencies | Lockfile committed and installed with `npm ci`, exact versions. Next.js and React on their newest patch release. Check downloads, maintainers and install scripts before adding any package. |

### Gates on every push

GitHub Actions runs these on every push. Production deploys only from a commit where all of them are green.

| Check | Tool | Passes when |
| --- | --- | --- |
| Types, lint, format | `tsc --noEmit`, ESLint, Prettier, solhint, `forge fmt --check` | Zero errors and zero warnings |
| Tests | Vitest, `forge test` (fuzz at 10,000 runs, invariant tests) | All pass and the coverage floors above hold |
| Contract analysis | Slither and Aderyn | No high or medium finding. Each low one is fixed or listed in `SECURITY.md`. |
| Code scanning | CodeQL (free for public repositories) and Semgrep | No open high or medium finding |
| Secrets | gitleaks, as a pre-commit hook and in CI over the whole history | Zero findings |
| Dependencies | `npm audit --omit=dev`, OSV-Scanner, Dependabot alerts | Zero high or critical |
| Build | `next build`, then a search of the browser bundle for key patterns and server variable names | Build passes and the search finds nothing |
| End to end | Tier 1 cases on the preview deploy | All pass |

### Security tests

These join the server and contract tests in section 14. Each one proves that an attack fails.

- A card authorisation with a valid card but no signature, or another account's signature, is refused before any chain call.
- A signed request sent twice is refused the second time. One sent after 5 minutes is refused.
- A top-up for an address that did not sign is refused. Once the daily cap is reached, top-ups stop and the alert fires.
- A webhook with a correct signature but a different amount is refused. A `pending` status deposits nothing.
- With `DEMO_MODE` off, Simulate payment and Collect now return 404, and `skipDays` reverts.
- A name or reason containing `<script>` or `"><img src=x onerror=alert(1)>` shows as plain text, and the page logs no policy violation.
- During the invite end-to-end case, the one-time key appears in no request the browser sends.
- Contract: invariant tests run the six rules of section 7 over random call sequences (1,000 runs, 50 calls each). A signature made for another chain or contract is rejected.

### Contract self-audit

The contract gets its own review on Sat 10 Oct, before the app work that depends on its address. Any fix means a redeploy, and a new address costs least while little is wired to it. This is a self-audit, not a professional one: the README and pitch say "self-reviewed, findings published", never "audited".

1. **Freeze the scope.** `AmplopEnvelopes` at a named commit. No contract changes during the review.
2. **Run the tools.** First the `x-ray` skill from [pashov/skills](https://github.com/pashov/skills): it writes a threat model and a list of invariants. Any invariant it finds that is not among the six in section 7 becomes a new test. Then Slither, Aderyn, `forge test` with fuzz and invariant tests, `forge coverage`.
3. **Walk every external function against this checklist.**
   - Access control: who may call it matches R3, and nothing else can.
   - Signatures: EIP-712 domain with chain id and contract address, single use, OpenZeppelin `ECDSA` (blocks malleable signatures).
   - Rounding: the split and the four weekly shares add up exactly; leftover units go to Everyday.
   - Time: every wait reads the account clock; `skipDays` has an upper bound; the demo switch is fixed at deploy.
   - Token: `decimals()` read, not assumed; the balance check matches the money invariant.
   - Reentrancy, loops that can grow without limit, events on every change.
4. **Fresh eyes.** The `solidity-auditor` skill from [pashov/skills](https://github.com/pashov/skills) on `AmplopEnvelopes.sol`, in loop mode (3 passes), plus a second person or Claude Code's `/security-review`. Install the skills pinned to commit `92b0ea6` and do not run their update command during the freeze. A finding counts only after it is checked by hand: a failing test proves it, or it is marked a false positive with the reason. Copy its `full-report.md` into `audits/`; add `.solidity-auditor/` and `.audit-*` to `.gitignore`.
5. **Write the report** at `audits/2026-10-self-review.md`: scope and commit, tools and versions, each finding with severity (high, medium, low, info) and status (fixed with the commit, or accepted with the reason).
6. **Redeploy and re-verify** if anything changed. Update the address in the README, the environment settings and the indexer config, with the new start block.

Done when the report is in the repository and no high or medium finding is open.

### Before submission

1. **Mon 12 Oct: a security review pass.** A fresh-eyes review of the server and the app (the contract had its own on Sat 10), by a second person or Claude Code's `/security-review` command. Every finding is fixed, or written into `SECURITY.md` with the reason it is accepted.
2. **`SECURITY.md` in the repository:** the threat table above, a link to the self-audit report, the accepted risks below, and how to report a problem. The docs site's "Trust and security" page summarises it.
3. **Tue 13 Oct, before the 18:00 freeze:** one last full run of every gate on the final commit.

**Accepted risks**, stated plainly in `SECURITY.md`:

- Testnet only; no real money moves.
- Purchase amounts are public on the chain (R27).
- Someone with many addresses can still get some test MON, within the caps.
- One deployer address sets the contract up.
- No external audit; the contract has a self-audit only. A launch with real money needs an external audit first.

## 16. Schedule

Nine working days, then a half-day buffer. Code stops on Tuesday 13 Oct at 18:00 WIB; the submission goes in that night, 12 hours before the deadline.

| Day (WIB) | Build | Done when |
| --- | --- | --- |
| Mon 5 Oct | Day-one checks (section 17). Repository with four folders, licence, first commit. Create the portal team and project. Sign up for Midtrans sandbox. | A passkey account made on a real phone sends one transaction on Monad testnet with a sponsored fee. The portal project exists. |
| Tue 6 Oct | Contract: accounts, split, deposit, weekly release, card authorise, holds. Tests for R4 to R14. | `forge test` is green for those rules. **Portal deadline today.** |
| Wed 7 Oct | Contract: invite, Emergency, changes, move, recovery, demo switch. Fuzz test. Deploy and verify on testnet. | All contract tests green. Address in the README. |
| Thu 8 Oct | App: welcome, passkey, fee top-up, set-up, invite and accept, both home screens. | Two phones are linked as student and trusted person, reading live balances. |
| Fri 9 Oct | Card service and screens: card, checkout, approved, both declines. Skip time and View as Mama. CI gates and pre-commit hook (section 15). | A purchase is approved from the right envelope in about a second, on the phone. CI is green on main. |
| Sat 10 Oct | Morning: contract self-audit (section 15), then fix, redeploy and update addresses. Rupiah top-up: Midtrans Snap, webhook, Simulate payment, parent home, allowance arrived. Emergency flow end to end. | The self-audit report is in the repository with no open high or medium finding. The whole video script works without the indexer. |
| Sun 11 Oct | Envio indexer. Activity, envelope detail, alerts, move a purchase. Settings. Recovery screens if time allows. | Activity and alerts fill from the indexer; core flows still work with it off. |
| Mon 12 Oct | Landing page, docs site, README, real / simulated table. Two-phone script (section 14). Security review pass (section 15). Fix what they find. | Every box in the two-phone script is ticked. No high or medium finding is open. |
| Tue 13 Oct | Record three videos: demo (3 min), pitch (2 min), Agora (2 min). Portal text. Agora and Envio entries. Interview summary. Last run of every gate, then code stops at 18:00. Submit by 23:00. | Submission confirmed in the portal. |
| Wed 14 Oct | Buffer only, until 10:59. No new features. | Nothing left to do. |

**Cut order, if a day slips.** Cut from the top; stop as soon as the schedule fits.

1. Account recovery screens (keep the contract functions and their tests).
2. Lock-off and replacing a trusted person in Settings.
3. Move a purchase.
4. Midtrans Snap (keep the Simulate payment button).
5. Alerts on the parent home.
6. Activity from the indexer. This gives up the Envio bounty, so it goes last.

**Never cut:** passkey sign-up, split and weekly release, the card decision, the trusted-person approval, Simulate payment, Skip time, the README's real / simulated table, and the gates in section 15.

## 17. Risks and day-one checks

Five facts are still unconfirmed. Each is checked on Monday 5 Oct before any feature work, because each can change the design.

| Check | How | If it fails |
| --- | --- | --- |
| Mera works on the phones you have: create, sign in again, sign a transaction | The Mera demo and a ten-line test page on Chrome for Android and Safari for iPhone | Use a different embedded-wallet kit that Monad lists (Privy, Para or Turnkey). Screens do not change. |
| Two passkeys for one site on one phone can be told apart | Create two on the test page and sign in with each | View as Mama needs two browsers or two phones. The try-it guide says so. |
| The fee top-up arrives before the first action | Time it on testnet | Send the top-up earlier, on the Welcome screen. |
| AUSD decimals and faucet behaviour | Call `decimals()` and `requestFunds` once | Adjust the amount maths. The faucet figure (10.000 per request, once a minute) comes from other teams' notes, not from Agora. |
| Fee is charged on the limit, not on use | Monad docs, then one test transaction | Only the limit margin changes. |

| Risk | Likelihood | What reduces it |
| --- | --- | --- |
| One person, nine days, a wide scope | High | The cut order in section 16, decided in advance. |
| Public testnet connection is rate-limited during judging | Medium | A second connection provider as fallback; reads go through the indexer where possible. |
| A judge opens the link inside a chat app | Medium | Board 0.1. |
| Midtrans sandbox is slow or down on recording day | Medium | Simulate payment runs the same deposit path. |
| A judge finds per-purchase amounts on the public chain | Low | Said plainly in the docs and in R27. |
| The Agora bounty requires a native mobile app | Unknown | Ask in the event Discord on day one. The fallback is to present the installable web app and say so. |
| Server keys leak from the repository | Low | Keys only in environment variables; a pre-commit check for private keys. |

## 18. Later list

None of this is built for the hackathon. It appears, undated, on the docs site's roadmap page.

- An external audit or audit contest of the contract before any real money.
- A real card through a licensed issuer, using the same authorisation message.
- Real rupiah in and a licensed conversion partner; IDRX if it reaches Monad.
- A relayer in place of the fee top-up, so accounts never hold MON.
- Push notifications for the trusted person.
- More than one trusted person, and a separate role for someone who only sends money.
- A parent with several children.
- Envelopes the student names, and more or fewer than five.
- A release rhythm other than four weekly shares.
- Identity checks and spending limits required by regulation.
- Sending leftover money back, and cash-out.
- Purchase amounts hidden on the chain.

## Sources

- [Embedded Wallets, Monad documentation](https://docs.monad.xyz/tooling-and-infra/wallet-infra/embedded-wallets): how Mera accounts work.
- [Introducing Mera, Monad blog](https://monad.xyz/blog/introducing-mera)
- [Mera documentation](https://mera.category.xyz/)
- [matocard issue 59](https://github.com/matocard/matocard/issues/59) and [fanout pull request 7](https://github.com/fanout-xyz/fanout/pull/7): AUSD faucet amount and rate.
- [kaskad pull request 4](https://github.com/mryavascann/kaskad/pull/4): another team's fee top-up for Mera accounts.
