// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AmplopEnvelopes, EnvelopeView} from "../../src/AmplopEnvelopes.sol";
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
}
