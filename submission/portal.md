# Portal fields

Spec 20 S20-7. Pasted into the portal on Tue 13 Oct. Fields marked **To fill** need a value that does not exist yet (a deployed URL or a video link); everything else is final unless a feature is cut (S20-14).

| Field        | Content                                                                 |
| ------------ | ----------------------------------------------------------------------- |
| Project name | Amplop                                                                  |
| Tagline      | Allowance that lasts the whole month.                                   |
| Track        | Track 02: Consumer Products & Payments                                  |
| Team         | One person, the builder (as registered in the portal); role: everything |

## Description

Amplop is an allowance wallet for Indonesian students studying far from home. A parent pays rupiah once by bank transfer; it arrives as AUSD on Monad testnet, splits into five envelopes, and each envelope is released one weekly share at a time. A demo card pays from the envelope that matches the kind of shop, and the contract itself decides each payment in one transaction that is final in about a second. The Emergency envelope opens when a trusted person approves with their passkey, or by itself after 48 hours: they can open it sooner but cannot block it. The parent sees totals, not shops. Our design principle is no new vocabulary: sign-in is a passkey with no recovery phrase, and nobody sees a wallet prompt or pays a network fee. Every step writes to Monad testnet and links to its transaction. Rupiah payments and the card network are simulated; the docs list exactly what is real. The contract is self-reviewed, findings published.

## Links

| Link                       | Address                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------- |
| Live app                   | **To fill:** `NEXT_PUBLIC_SITE_URL` after the first production deploy              |
| Repository                 | https://github.com/amplop-orgz/amplop                                              |
| Docs site                  | **To fill:** `NEXT_PUBLIC_DOCS_URL`                                                |
| Try-it guide               | **To fill:** the docs site's `/try-it/` page                                       |
| Demo video                 | **To fill** after recording (S20-4)                                                |
| Pitch video                | **To fill** after recording (S20-5)                                                |
| Contract (verified source) | https://testnet.monadvision.com/address/0x5596Bf1014EC25F760e8976f1DD8a40Ee250c56C |
| Self-review report         | https://github.com/amplop-orgz/amplop/blob/main/audits/2026-10-self-review.md      |

## Go-to-market answer

Our first users are Indonesian students studying abroad, reached through Indonesian student associations in their cities. Each student who joins invites one parent by WhatsApp, because the parent is the one who sends the allowance, so every new student brings their sender with them. We start with the students and parents we interviewed and the associations they belong to, then grow city by city through those associations' own channels.

Before pasting: check the last sentence against `interviews.md` (S20-7) and change it to what the interviews actually covered.

## Judge access instructions

Paste the app address first, then these steps. They are the same as the docs Try it page; `npm run check:submission` fails if the two differ.

<!-- try-it:start -->

1. Open the app and tap **Open the app**. Tap **Create a passkey** and type the name Raka.
2. Keep the five envelopes as they are (Food 40%, Transport 15%, Study 15%, Everyday 20%, Emergency 10%) and continue.
3. Invite Mama: type her name and make the invite link. Tap **Copy invite link**, paste it into the address bar of the same browser, and tap **Accept and create a passkey**. That makes Mama's own passkey and links her to Raka.
4. As Mama, tap **Send allowance**, enter Rp16.500.000, and tap **Simulate payment**. You see Allowance sent, with its transaction proof.
5. Tap **Demo only: view as Raka**. The allowance has arrived as $1.000,00, already split; this week's shares are available now.
6. Open **Card**. Pay at the Supermarket: approved from Food in about a second. Then try the Gambling site: declined. Open **Settings** and tap **Switch** next to View as Mama: her alert shows the category, never the shop.
7. As Raka, open **Settings**, tap **Skip**, then **Skip to next Monday**. The next weekly share is released.
8. Open **Emergency**, ask for $70,00 and write a reason. Switch to Mama, open the approval link from her home screen, and tap **Approve with passkey**. Back as Raka, the $70,00 is in Everyday.

<!-- try-it:end -->
