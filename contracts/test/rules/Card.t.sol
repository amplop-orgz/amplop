// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../AmplopBase.t.sol";

/// @notice R9 to R13, R15 and card-side R1/R3 tests (S03-55, S03-57).
contract CardTest is AmplopBase {
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = registerRaka();
    }

    /// @dev €12,50 at the sample rate: 14_388_750 units at 6 decimals.
    function euroSample() internal view returns (uint256) {
        return 14_388_750 * 10 ** dec / 1e6;
    }

    /// @dev C1: Food 100, Transport 37,50, Study 37,50, Everyday 50, locked 100.
    function fund() internal {
        deposit(id, usd(1000, 0));
    }

    function expectDecline(uint16 shopType, uint256 amount, DeclineReason reason) internal returns (bytes32 pid) {
        pid = nextPurchaseId();
        vm.expectEmit(address(amplop));
        emit AmplopEnvelopes.PurchaseDeclined(id, pid, amount, shopType, reason);
        vm.prank(cardService);
        amplop.authorize(id, pid, shopType, amount);
        assertEq(uint8(amplop.purchase(pid).state), uint8(PurchaseState.None));
        assertTrue(amplop.purchaseUsed(pid));
    }

    function move(bytes32 pid, Envelope to) internal {
        vm.prank(raka);
        amplop.movePurchase(pid, to);
    }

    // ------------------------------------------------------------ R9

    function test_R9_matchingEnvelopePays() public {
        fund();
        uint16[3] memory food = [uint16(5411), 5812, 5814];
        uint16[4] memory transport = [uint16(4111), 4121, 5541, 5542];
        uint16[3] memory study = [uint16(5943), 7338, 8299];
        uint16[3] memory everyday = [uint16(5942), 7832, 1234];
        for (uint256 i = 0; i < 3; ++i) {
            _assertPaidFrom(buy(id, food[i], usd(1, 0)), Envelope.Food);
            _assertPaidFrom(buy(id, study[i], usd(1, 0)), Envelope.Study);
            _assertPaidFrom(buy(id, everyday[i], usd(1, 0)), Envelope.Everyday);
        }
        for (uint256 i = 0; i < 4; ++i) {
            _assertPaidFrom(buy(id, transport[i], usd(1, 0)), Envelope.Transport);
        }
    }

    function _assertPaidFrom(bytes32 pid, Envelope e) internal view {
        PurchaseInfo memory p = amplop.purchase(pid);
        assertEq(uint8(p.state), uint8(PurchaseState.Held));
        assertEq(uint8(p.envelope), uint8(e));
        assertFalse(p.everydayStepIn);
    }

    function test_R9_defaultShopTable() public view {
        uint16[11] memory codes = [uint16(5411), 5812, 5814, 4111, 4121, 5541, 5542, 5943, 7338, 8299, 7995];
        uint8[11] memory want = [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3];
        for (uint256 a = 0; a < 2; ++a) {
            uint256 acct = a == 0 ? 0 : id;
            for (uint256 i = 0; i < codes.length; ++i) {
                (Envelope e, bool blocked) = amplop.shopEnvelope(acct, codes[i]);
                assertEq(uint8(e), want[i]);
                assertEq(blocked, codes[i] == 7995);
            }
            uint16[4] memory everyday = [uint16(5942), 7832, 1234, 0];
            for (uint256 i = 0; i < 4; ++i) {
                (Envelope e, bool blocked) = amplop.shopEnvelope(acct, everyday[i]);
                assertEq(uint8(e), uint8(Envelope.Everyday));
                assertFalse(blocked);
            }
        }
    }

    // ------------------------------------------------------------ R10

    function test_R10_everydayStepsInWhenMatchShort() public {
        fund();
        buy(id, 5411, usd(90, 0)); // Food 10, Everyday 50 (E3)
        uint256 amt = euroSample();
        bytes32 pid = nextPurchaseId();
        vm.expectEmit(address(amplop));
        emit AmplopEnvelopes.PurchaseApproved(id, pid, Envelope.Everyday, amt, 5411, true);
        vm.prank(cardService);
        amplop.authorize(id, pid, 5411, amt);
        PurchaseInfo memory p = amplop.purchase(pid);
        assertEq(uint8(p.envelope), uint8(Envelope.Everyday));
        assertTrue(p.everydayStepIn);
        assertEq(available(id, Envelope.Food), usd(10, 0));
        assertEq(available(id, Envelope.Everyday), usd(50, 0) - amt);
    }

    function test_R10_declineWhenBothShort() public {
        fund();
        buy(id, 5411, usd(90, 0));
        buy(id, 5942, usd(40, 0)); // Food 10, Everyday 10 (E5)
        EnvelopeView[5] memory before = views(id);
        expectDecline(5411, euroSample(), DeclineReason.NotEnough);
        assertViewsEq(before, views(id));
    }

    function test_R10_neverSplitAcrossEnvelopes() public {
        fund();
        buy(id, 5411, usd(90, 0));
        buy(id, 5942, usd(40, 0));
        // Food 10 + Everyday 10 would cover 14,39 together, but a purchase is never split.
        assertGe(available(id, Envelope.Food) + available(id, Envelope.Everyday), euroSample());
        expectDecline(5411, euroSample(), DeclineReason.NotEnough);
        assertEq(available(id, Envelope.Food), usd(10, 0));
        assertEq(available(id, Envelope.Everyday), usd(10, 0));
    }

    function test_R10_everydayShopNoStepInFromOthers() public {
        fund();
        buy(id, 5942, usd(45, 0)); // Food 100, Everyday 5 (E6)
        expectDecline(7832, usd(10, 0), DeclineReason.NotEnough);
        assertEq(available(id, Envelope.Food), usd(100, 0));
        assertEq(available(id, Envelope.Everyday), usd(5, 0));
    }

    function test_R10_exactAmountApproved() public {
        fund();
        bytes32 pid = buy(id, 5411, usd(100, 0));
        _assertPaidFrom(pid, Envelope.Food);
        assertEq(available(id, Envelope.Food), 0);
    }

    function test_R10_secondPurchaseForLastDollarsDeclined() public {
        fund();
        bytes32 first = buy(id, 5942, usd(30, 0)); // same block as the second
        _assertPaidFrom(first, Envelope.Everyday);
        expectDecline(5942, usd(30, 0), DeclineReason.NotEnough);
        assertEq(available(id, Envelope.Everyday), usd(20, 0));
    }

    function test_R10_purchaseBeforeAllowanceDeclined() public {
        expectDecline(5411, usd(1, 0), DeclineReason.NotEnough);
    }

    // ------------------------------------------------------------ R11, R12

    function test_R11_emergencyNeverPays() public {
        fund();
        buy(id, 5411, usd(100, 0));
        buy(id, 4111, usd(37, 50));
        buy(id, 5943, usd(37, 50));
        buy(id, 5942, usd(50, 0)); // every weekly envelope 0, locked 100 (E10)
        expectDecline(5411, usd(10, 0), DeclineReason.NotEnough);
        assertEq(locked(id), usd(100, 0));
    }

    function test_R12_gamblingAlwaysDeclinedNoBalanceChange() public {
        fund();
        EnvelopeView[5] memory before = views(id);
        bytes32 pid = expectDecline(7995, usd(1, 0), DeclineReason.Blocked);
        assertViewsEq(before, views(id));
        vm.prank(cardService);
        vm.expectRevert(abi.encodeWithSelector(AmplopEnvelopes.PurchaseIdUsed.selector, pid));
        amplop.authorize(id, pid, 7995, usd(1, 0));
    }

    // ------------------------------------------------------------ R3 card service

    function test_R3_onlyCardServiceCanAuthorize() public {
        fund();
        address[4] memory callers = [stranger, raka, treasury, settlement];
        for (uint256 i = 0; i < callers.length; ++i) {
            bytes32 pid = nextPurchaseId();
            vm.prank(callers[i]);
            vm.expectRevert(AmplopEnvelopes.NotCardService.selector);
            amplop.authorize(id, pid, 5411, usd(1, 0));
        }
    }

    function test_R3_purchaseIdCannotBeReused() public {
        fund();
        bytes32 approved = buy(id, 5411, usd(1, 0));
        bytes32 declined = buy(id, 7995, usd(1, 0));
        assertTrue(amplop.purchaseUsed(approved));
        assertTrue(amplop.purchaseUsed(declined));
        assertFalse(amplop.purchaseUsed(keccak256("unused")));
        bytes32[2] memory ids = [approved, declined];
        for (uint256 i = 0; i < 2; ++i) {
            vm.prank(cardService);
            vm.expectRevert(abi.encodeWithSelector(AmplopEnvelopes.PurchaseIdUsed.selector, ids[i]));
            amplop.authorize(id, ids[i], 5411, usd(1, 0));
        }
    }

    function test_R3_onlyCardServiceCollectsAndRefunds() public {
        fund();
        bytes32 pid = buy(id, 5411, usd(10, 0));
        address[3] memory callers = [stranger, raka, treasury];
        for (uint256 i = 0; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(AmplopEnvelopes.NotCardService.selector);
            amplop.collect(pid, usd(1, 0));
        }
        vm.prank(cardService);
        amplop.collect(pid, usd(10, 0));
        for (uint256 i = 0; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(AmplopEnvelopes.NotCardService.selector);
            amplop.refund(pid, usd(1, 0));
        }
    }

    // ------------------------------------------------------------ R13

    function test_R13_collectLessReturnsDifference() public {
        fund();
        bytes32 pid = buy(id, 5411, usd(20, 0));
        uint256 settleBefore = token.balanceOf(settlement);
        vm.expectEmit(address(amplop));
        emit AmplopEnvelopes.PurchaseCollected(id, pid, usd(15, 0), usd(5, 0));
        vm.prank(cardService);
        amplop.collect(pid, usd(15, 0));
        assertEq(token.balanceOf(settlement) - settleBefore, usd(15, 0));
        assertEq(available(id, Envelope.Food), usd(85, 0));
        assertEq(views(id)[0].held, 0);
        PurchaseInfo memory p = amplop.purchase(pid);
        assertEq(uint8(p.state), uint8(PurchaseState.Collected));
        assertEq(p.collected, usd(15, 0));
        assertEq(p.held, 0);
    }

    function test_R13_collectMoreThanHeldFails() public {
        fund();
        bytes32 pid = buy(id, 5411, usd(20, 0));
        vm.prank(cardService);
        vm.expectRevert(AmplopEnvelopes.AmountAboveHeld.selector);
        amplop.collect(pid, usd(20, 0) + 1);
    }

    function test_R13_collectAfterHoldPeriodFails() public {
        fund();
        bytes32 early = buy(id, 5411, usd(10, 0));
        bytes32 late = buy(id, 5411, usd(10, 0));
        vm.warp(block.timestamp + 7 days - 1);
        vm.prank(cardService);
        amplop.collect(early, usd(10, 0));
        vm.warp(block.timestamp + 1);
        vm.prank(cardService);
        vm.expectRevert(AmplopEnvelopes.HoldExpired.selector);
        amplop.collect(late, usd(10, 0));
    }

    function test_R13_releaseAfterSevenDaysByAnyone() public {
        fund();
        bytes32 pid = buy(id, 5411, usd(10, 0));
        vm.warp(block.timestamp + 7 days - 1);
        vm.prank(stranger);
        vm.expectRevert(AmplopEnvelopes.HoldNotExpired.selector);
        amplop.releaseHold(pid);
        vm.warp(block.timestamp + 1);
        uint256 foodBefore = available(id, Envelope.Food);
        vm.expectEmit(address(amplop));
        emit AmplopEnvelopes.HoldReleased(id, pid, usd(10, 0));
        vm.prank(stranger);
        amplop.releaseHold(pid);
        assertEq(available(id, Envelope.Food), foodBefore + usd(10, 0));
        assertEq(views(id)[0].held, 0);
        assertEq(uint8(amplop.purchase(pid).state), uint8(PurchaseState.Released));
    }

    function test_R13_collectAfterReleaseFails() public {
        fund();
        bytes32 pid = buy(id, 5411, usd(10, 0));
        vm.prank(cardService); // card service may release at any time
        amplop.releaseHold(pid);
        vm.prank(cardService);
        vm.expectRevert(AmplopEnvelopes.NotHeld.selector);
        amplop.collect(pid, usd(10, 0));
    }

    function test_R13_refundReturnsToPayingEnvelope() public {
        fund();
        buy(id, 5411, usd(90, 0)); // Food 10
        uint256 amt = euroSample();
        bytes32 pid = buy(id, 5411, amt); // step-in from Everyday (E3)
        assertTrue(amplop.purchase(pid).everydayStepIn);
        vm.prank(cardService);
        amplop.collect(pid, amt);
        uint256 everydayAfterCollect = available(id, Envelope.Everyday);

        uint256 half = amt / 2;
        vm.prank(cardService);
        amplop.refund(pid, half);
        assertEq(available(id, Envelope.Everyday), everydayAfterCollect + half);
        assertEq(available(id, Envelope.Food), usd(10, 0));
        assertEq(uint8(amplop.purchase(pid).state), uint8(PurchaseState.Refunded));

        vm.prank(cardService);
        amplop.refund(pid, amt - half);
        assertEq(available(id, Envelope.Everyday), everydayAfterCollect + amt);
        assertEq(amplop.purchase(pid).refunded, amt);

        vm.prank(cardService);
        vm.expectRevert(AmplopEnvelopes.RefundTooLarge.selector);
        amplop.refund(pid, 1);
    }

    // ------------------------------------------------------------ R15

    function test_R15_onlyFromEveryday() public {
        fund();
        bytes32 pid = buy(id, 5411, usd(10, 0));
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.NotFromEveryday.selector);
        amplop.movePurchase(pid, Envelope.Study);
    }

    function test_R15_onlyOnce() public {
        fund();
        bytes32 pid = buy(id, 5942, usd(10, 0));
        move(pid, Envelope.Study);
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.AlreadyMoved.selector);
        amplop.movePurchase(pid, Envelope.Food);
    }

    function test_R15_onlyWithinSevenDays() public {
        fund();
        bytes32 pid = buy(id, 5942, usd(10, 0));
        vm.warp(block.timestamp + 7 days);
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.MovePeriodOver.selector);
        amplop.movePurchase(pid, Envelope.Study);
    }

    function test_R15_failsIfTargetShort() public {
        fund();
        bytes32 pid = buy(id, 5942, usd(45, 0)); // Study has 37,50
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.TargetShort.selector);
        amplop.movePurchase(pid, Envelope.Study);
    }

    function test_R15_overrideAppliesToNextPurchase() public {
        fund();
        bytes32 pid = buy(id, 5942, usd(10, 0)); // bookshop pays from Everyday
        vm.expectEmit(address(amplop));
        emit AmplopEnvelopes.PurchaseMoved(id, pid, Envelope.Everyday, Envelope.Study, 5942);
        move(pid, Envelope.Study);
        (Envelope e, bool blocked) = amplop.shopEnvelope(id, 5942);
        assertEq(uint8(e), uint8(Envelope.Study));
        assertFalse(blocked);
        _assertPaidFrom(buy(id, 5942, usd(5, 0)), Envelope.Study);
        // Other accounts keep the default table.
        (e,) = amplop.shopEnvelope(0, 5942);
        assertEq(uint8(e), uint8(Envelope.Everyday));
    }

    function test_R15_heldPurchaseCanBeMoved() public {
        fund();
        bytes32 pid = buy(id, 5942, usd(10, 0));
        move(pid, Envelope.Study);
        EnvelopeView[5] memory v = views(id);
        assertEq(v[3].held, 0);
        assertEq(v[2].held, usd(10, 0));
        assertEq(v[3].available, usd(50, 0));
        assertEq(v[2].available, usd(27, 50));
        vm.prank(cardService);
        amplop.releaseHold(pid);
        assertEq(available(id, Envelope.Study), usd(37, 50));
        assertEq(available(id, Envelope.Everyday), usd(50, 0));
    }

    function test_R15_declinedPurchaseCannotBeMoved() public {
        bytes32 pid = buy(id, 5942, usd(10, 0)); // no allowance yet: declined
        vm.prank(raka);
        vm.expectRevert(abi.encodeWithSelector(AmplopEnvelopes.PurchaseNotFound.selector, pid));
        amplop.movePurchase(pid, Envelope.Study);
    }

    function test_R15_stepInPurchaseCanMoveToFood() public {
        fund();
        buy(id, 5411, usd(90, 0)); // Food 10
        uint256 amt = euroSample();
        bytes32 pid = buy(id, 5411, amt); // E3 step-in
        skipToNextMonday(id); // Food gets share 2, still within seven days
        move(pid, Envelope.Food);
        PurchaseInfo memory p = amplop.purchase(pid);
        assertEq(uint8(p.envelope), uint8(Envelope.Food));
        assertTrue(p.moved);
        assertEq(available(id, Envelope.Food), usd(110, 0) - amt);
        assertEq(available(id, Envelope.Everyday), usd(100, 0));
    }

    function test_R1_onlyOwnerCanMove() public {
        fund();
        bytes32 pid = buy(id, 5942, usd(10, 0));
        register(dewi, sampleSplit);
        vm.prank(dewi);
        vm.expectRevert(AmplopEnvelopes.NotOwner.selector);
        amplop.movePurchase(pid, Envelope.Study);
        vm.prank(stranger);
        vm.expectRevert(AmplopEnvelopes.NoAccount.selector);
        amplop.movePurchase(pid, Envelope.Study);
    }

    // ------------------------------------------------------------ fuzz

    function testFuzz_R10_choiceMatchesRule(uint256 shopSeed, uint256 foodSpend, uint256 everydaySpend, uint256 amt)
        public
    {
        fund();
        foodSpend = bound(foodSpend, 0, usd(100, 0));
        everydaySpend = bound(everydaySpend, 0, usd(50, 0));
        amt = bound(amt, 1, usd(150, 0));
        if (foodSpend > 0) buy(id, 5411, foodSpend);
        if (everydaySpend > 0) buy(id, 5942, everydaySpend);
        uint16[6] memory shops = [uint16(5411), 4111, 5943, 5942, 7995, 1234];
        uint16 shop = shops[shopSeed % shops.length];

        // Reference model of R10/R12.
        EnvelopeView[5] memory before = views(id);
        bool approve;
        uint8 pay;
        bool stepIn;
        if (shop != 7995) {
            (Envelope e,) = amplop.shopEnvelope(0, shop);
            pay = uint8(e);
            if (before[pay].available >= amt) {
                approve = true;
            } else if (pay != 3 && before[3].available >= amt) {
                (approve, pay, stepIn) = (true, 3, true);
            }
        }

        bytes32 pid = buy(id, shop, amt);
        PurchaseInfo memory p = amplop.purchase(pid);
        EnvelopeView[5] memory afterV = views(id);
        if (!approve) {
            assertEq(uint8(p.state), uint8(PurchaseState.None));
            assertViewsEq(before, afterV);
            return;
        }
        assertEq(uint8(p.state), uint8(PurchaseState.Held));
        assertEq(uint8(p.envelope), pay);
        assertEq(p.everydayStepIn, stepIn);
        for (uint256 e = 0; e < 5; ++e) {
            assertEq(afterV[e].available, before[e].available - (e == pay ? amt : 0));
        }
    }
}
