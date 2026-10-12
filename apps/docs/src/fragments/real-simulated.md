| Piece                                                    | State                 | Detail                                                                                          |
| -------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| Envelope rules (split, weekly release, locks, limits)    | Real                  | A contract on Monad testnet holds the AUSD and enforces every rule.                             |
| Card decision (approve, decline, which envelope)         | Real                  | Decided by the contract in one transaction. The server cannot spend locked or unreleased money. |
| Trusted-person approval                                  | Real                  | A second passkey account signs a transaction.                                                   |
| Passkey accounts                                         | Real                  | Mera derives a normal account from the passkey. No password, no seed phrase.                    |
| AUSD                                                     | Real testnet token    | From the Agora faucet: 10.000 AUSD per request, once a minute.                                  |
| Rupiah payment                                           | Simulated             | Midtrans sandbox. No real rupiah moves.                                                         |
| Rupiah to dollar conversion                              | Simulated             | A treasury wallet holds test AUSD and pays out at a fixed sample rate.                          |
| Card and shop                                            | Simulated             | A checkout screen stands in for the shop's card machine. No card network.                       |
| Alerts to the parent                                     | In-app only           | Shown when the parent opens the app. No push notification.                                      |
| Time                                                     | Skippable in the demo | See section 12. Real values are 7 days and 48 hours.                                            |
| Real card issuer, real rupiah, identity checks, cash-out | Not built             | Listed in section 18.                                                                           |
