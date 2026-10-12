# Agora bounty entry

Spec 20 S20-8. Submitted on Tue 13 Oct with the links pointing at the submission tag.

## How AUSD is used

1. **Cross-border allowance.** A parent in Indonesia pays rupiah once by bank transfer; it arrives as AUSD for a student studying abroad.
2. **Held and released by rule.** The contract holds the AUSD, splits it into five envelopes and releases one weekly share at a time. The Emergency envelope stays locked until a trusted person approves or 48 hours pass.
3. **Paid out at purchase.** Each card payment holds AUSD in one envelope, and the shop's collection sends it to the settlement address.

## Addresses (Monad testnet)

| What              | Address                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| AUSD              | [`0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC`](https://testnet.monadvision.com/address/0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC) |
| `AmplopEnvelopes` | [`0x5596Bf1014EC25F760e8976f1DD8a40Ee250c56C`](https://testnet.monadvision.com/address/0x5596Bf1014EC25F760e8976f1DD8a40Ee250c56C) |

The contract takes its token address at deployment, so it works with any token of this kind; on Monad testnet it uses AUSD.

## The code that moves AUSD

All in [`contracts/src/AmplopEnvelopes.sol`](https://github.com/amplop-orgz/amplop/blob/main/contracts/src/AmplopEnvelopes.sol):

- [`deposit`](https://github.com/amplop-orgz/amplop/blob/main/contracts/src/AmplopEnvelopes.sol#L821): AUSD comes in from the treasury and is split into the envelopes.
- [`authorize`](https://github.com/amplop-orgz/amplop/blob/main/contracts/src/AmplopEnvelopes.sol#L871): a card payment is decided and its amount held in one envelope.
- [`collect`](https://github.com/amplop-orgz/amplop/blob/main/contracts/src/AmplopEnvelopes.sol#L917): the shop collects and the AUSD goes to settlement.
- [`refund`](https://github.com/amplop-orgz/amplop/blob/main/contracts/src/AmplopEnvelopes.sol#L957): a collected purchase is refunded to the student.

## Video

**To fill:** the Agora video link (S20-6), 2 minutes or less.

## Native mobile app

**To fill** with what the event Discord said. If a native app is required: Amplop is an installable web app (PWA) used on phones, not a native app.
