// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    AmplopEnvelopes,
    EnvelopeView,
    AccountInfo,
    PurchaseInfo,
    PurchaseState,
    PendingKind,
    EmergencyStatus,
    EmergencyInfo,
    ScheduleView
} from "../../src/AmplopEnvelopes.sol";
import {LoggingERC20} from "./LoggingERC20.sol";
import {Handler} from "./Handler.sol";

/// @notice The six PRD 7 "always true" rules plus the x-ray ones, over random call sequences (S03-56).
contract InvariantsTest is Test {
    AmplopEnvelopes internal amplop;
    LoggingERC20 internal token;
    Handler internal handler;
    address internal treasury = makeAddr("treasury");
    address internal cardService = makeAddr("cardService");
    address internal settlement = makeAddr("settlement");

    function setUp() public {
        vm.warp(1_791_936_000 + 10 hours); // Wed 14 Oct 2026 10:00 UTC
        token = new LoggingERC20(6);
        amplop = new AmplopEnvelopes(IERC20(address(token)), settlement, treasury, cardService, true);
        token.mint(treasury, 1e30);
        token.mint(settlement, 1_000_000e6);
        vm.prank(treasury);
        token.approve(address(amplop), type(uint256).max);
        vm.prank(settlement);
        token.approve(address(amplop), type(uint256).max);
        token.watch(address(amplop), settlement);

        handler = new Handler(amplop, token, treasury, cardService, settlement);
        // Three accounts with money so early calls have something to act on.
        for (uint256 i = 0; i < 3; ++i) {
            handler.register(i, 0);
            handler.deposit(i, 1000e6, 1);
        }
        targetContract(address(handler));
    }

    function invariant_1_tokenBalanceEqualsAllMoney() public view {
        uint256 sum;
        for (uint256 id = 1; id <= amplop.accountCount(); ++id) {
            (EnvelopeView[5] memory v,) = amplop.envelopes(id);
            for (uint256 e = 0; e < 5; ++e) {
                sum += v[e].available + v[e].unreleased + v[e].held + v[e].locked;
            }
        }
        assertEq(token.balanceOf(address(amplop)), sum);
    }

    function invariant_2_lockedLeavesOnlyByR17ToR20() public view {
        assertEq(handler.lockedViolations(), 0);
    }

    function invariant_3_purchaseLowersOneEnvelope() public view {
        assertEq(handler.purchaseViolations(), 0);
        for (uint256 id = 1; id <= amplop.accountCount(); ++id) {
            amplop.envelopes(id); // never reverts: no negative available
        }
    }

    function invariant_4_collectedOnlyToSettlement() public view {
        assertEq(token.badOutCount(), 0);
        assertEq(token.outTotal(), handler.ghostCollected());
        assertEq(
            token.balanceOf(settlement), handler.settlementStart() + handler.ghostCollected() - handler.ghostRefunded()
        );
    }

    function invariant_5_onlyAllowedCallersSucceed() public view {
        assertEq(handler.disallowedSuccesses(), 0);
    }

    function invariant_6_everyWaitReadsAccountClock() public view {
        assertEq(handler.clockViolations(), 0);
    }

    function invariant_XR_scheduleCountAtMostThree() public view {
        for (uint256 id = 1; id <= amplop.accountCount(); ++id) {
            assertLe(amplop.schedules(id).length, 3);
        }
    }

    function invariant_XR_paymentAndPurchaseIdsNeverReused() public view {
        assertEq(handler.idReuseSuccesses(), 0);
        for (uint256 i = 0; i < handler.paymentIdsLength(); ++i) {
            assertTrue(amplop.paymentUsed(handler.paymentIds(i)));
        }
        for (uint256 i = 0; i < handler.purchaseIdsLength(); ++i) {
            assertTrue(amplop.purchaseUsed(handler.purchaseIds(i)));
        }
        for (uint256 i = 0; i < handler.declinedIdsLength(); ++i) {
            assertTrue(amplop.purchaseUsed(handler.declinedIds(i)));
        }
        assertFalse(amplop.paymentUsed(keccak256("never used")));
    }

    // x-ray invariants.md I-1: per account and envelope, held == sum of `held` over its Held purchases.
    function invariant_XR_heldMatchesHeldPurchases() public view {
        uint256 n = amplop.accountCount();
        uint256[5][] memory sum = new uint256[5][](n + 1);
        for (uint256 i = 0; i < handler.purchaseIdsLength(); ++i) {
            PurchaseInfo memory p = amplop.purchase(handler.purchaseIds(i));
            sum[p.accountId][uint8(p.envelope)] += p.held;
        }
        for (uint256 id = 1; id <= n; ++id) {
            (EnvelopeView[5] memory v,) = amplop.envelopes(id);
            for (uint256 e = 0; e < 5; ++e) {
                assertEq(v[e].held, sum[id][e]);
            }
        }
    }

    // I-2..I-4: purchase record bounds and state shape.
    function invariant_XR_purchaseRecordConsistent() public view {
        for (uint256 i = 0; i < handler.purchaseIdsLength(); ++i) {
            PurchaseInfo memory p = amplop.purchase(handler.purchaseIds(i));
            assertTrue(p.state != PurchaseState.None);
            assertTrue(p.accountId >= 1 && p.accountId <= amplop.accountCount());
            assertLe(p.createdAt, amplop.clock(p.accountId));
            assertLe(p.refunded, p.collected);
            assertLe(p.collected, p.amount);
            if (p.state == PurchaseState.Held) {
                assertEq(p.held, p.amount);
                assertEq(p.collected, 0);
            } else {
                assertEq(p.held, 0);
            }
            if (p.state == PurchaseState.Released) assertEq(p.collected, 0);
            if (p.state == PurchaseState.Collected) assertEq(p.refunded, 0);
            if (p.state == PurchaseState.Collected || p.state == PurchaseState.Refunded) assertGt(p.collected, 0);
            if (p.state == PurchaseState.Refunded) assertGt(p.refunded, 0);
            if (p.moved) assertLt(uint8(p.envelope), 3);
        }
    }

    // I-5, I-6: an open request never asks for more than is locked, and never coexists with a lock-off.
    function invariant_XR_openEmergencyWithinLocked() public view {
        for (uint256 id = 1; id <= amplop.accountCount(); ++id) {
            EmergencyInfo memory em = amplop.emergency(id);
            assertEq(em.requestSeq, amplop.accountInfo(id).requestSeq);
            if (em.status != EmergencyStatus.Open) continue;
            (EnvelopeView[5] memory v,) = amplop.envelopes(id);
            assertGt(em.amount, 0);
            assertLe(em.amount, v[4].locked);
            (bool lockOffPending,,) = amplop.pending(id, PendingKind.LockOff);
            assertFalse(lockOffPending);
        }
    }

    // I-7: lockOn is a one-way latch; once off nothing is locked, and a pending lock-off implies lockOn.
    function invariant_XR_lockOffMeansNothingLocked() public view {
        for (uint256 id = 1; id <= amplop.accountCount(); ++id) {
            AccountInfo memory a = amplop.accountInfo(id);
            (EnvelopeView[5] memory v,) = amplop.envelopes(id);
            (bool lockOffPending,,) = amplop.pending(id, PendingKind.LockOff);
            if (!a.lockOn) assertEq(v[4].locked, 0);
            if (lockOffPending) assertTrue(a.lockOn);
        }
    }

    // I-8, I-9: owner and trusted maps are one-to-one with the accounts, and owner != trusted.
    function invariant_XR_ownerAndTrustedMapsOneToOne() public view {
        for (uint256 id = 1; id <= amplop.accountCount(); ++id) {
            AccountInfo memory a = amplop.accountInfo(id);
            assertTrue(a.owner != address(0));
            assertEq(amplop.accountOf(a.owner), id);
            assertTrue(a.owner != a.trusted);
            if (a.trusted != address(0)) assertEq(amplop.trustedAccountOf(a.trusted), id);
        }
        for (uint256 i = 0; i < 10; ++i) {
            address who = handler.people(i);
            uint256 id = amplop.accountOf(who);
            if (id != 0) assertEq(amplop.accountInfo(id).owner, who);
            id = amplop.trustedAccountOf(who);
            if (id != 0) assertEq(amplop.accountInfo(id).trusted, who);
        }
    }

    // I-10: recoveryAccountOf mirrors the pending recoveries exactly.
    function invariant_XR_recoveryMapMatchesPending() public view {
        for (uint256 id = 1; id <= amplop.accountCount(); ++id) {
            (bool active,, bytes32 data) = amplop.pending(id, PendingKind.Recovery);
            if (active) assertEq(amplop.recoveryAccountOf(address(uint160(uint256(data)))), id);
        }
        for (uint256 i = 0; i < 10; ++i) {
            address who = handler.people(i);
            uint256 id = amplop.recoveryAccountOf(who);
            if (id == 0) continue;
            (bool active,, bytes32 data) = amplop.pending(id, PendingKind.Recovery);
            assertTrue(active);
            assertEq(address(uint160(uint256(data))), who);
        }
    }

    // I-11 (restated after SA-03): a pending recovery whose target now owns an account can always be
    // cancelled by the owner, so it never blocks the account. The original "target stays free" did not hold.
    function invariant_XR_deadRecoveryCancellable() public {
        for (uint256 id = 1; id <= amplop.accountCount(); ++id) {
            (bool active,, bytes32 data) = amplop.pending(id, PendingKind.Recovery);
            if (!active || amplop.accountOf(address(uint160(uint256(data)))) == 0) continue;
            uint256 snap = vm.snapshotState();
            // startPrank, not prank: a single vm.prank fails if the last handler call left a prank unused.
            vm.startPrank(amplop.accountInfo(id).owner);
            amplop.cancelPending(PendingKind.Recovery);
            vm.stopPrank();
            vm.revertToState(snap);
        }
    }

    // I-12: the effective split and any pending split are always five multiples of 5 summing to 100.
    function invariant_XR_splitAlwaysValid() public view {
        for (uint256 id = 1; id <= amplop.accountCount(); ++id) {
            AccountInfo memory a = amplop.accountInfo(id);
            _assertSplit(a.split);
            if (a.pendingSplitStartsAt != 0) _assertSplit(a.pendingSplit);
        }
    }

    function _assertSplit(uint8[5] memory s) internal pure {
        uint256 sum;
        for (uint256 i = 0; i < 5; ++i) {
            assertEq(s[i] % 5, 0);
            sum += s[i];
        }
        assertEq(sum, 100);
    }

    // I-13, I-14: live schedule records have distinct start Mondays, are not in the future, and 4 * base <= part.
    function invariant_XR_scheduleRecordsWellFormed() public view {
        for (uint256 id = 1; id <= amplop.accountCount(); ++id) {
            ScheduleView[] memory s = amplop.schedules(id);
            uint64 monday = (amplop.clock(id) / 1 days + 3) / 7;
            for (uint256 i = 0; i < s.length; ++i) {
                assertLe(s[i].startMonday, monday);
                assertTrue(s[i].sharesOut >= 1 && s[i].sharesOut <= 4);
                for (uint256 j = i + 1; j < s.length; ++j) {
                    assertTrue(s[i].startMonday != s[j].startMonday);
                }
                for (uint256 e = 0; e < 4; ++e) {
                    assertLe(4 * s[i].base[e], s[i].part[e]);
                }
            }
        }
    }

    // I-15: the account clock is block time plus whole skipped days.
    function invariant_XR_accountClockIsBlockTimePlusSkips() public view {
        for (uint256 id = 1; id <= amplop.accountCount(); ++id) {
            uint64 skip = amplop.accountInfo(id).skipSeconds;
            assertEq(skip % 1 days, 0);
            assertEq(amplop.clock(id), uint64(block.timestamp) + skip);
        }
    }
}
