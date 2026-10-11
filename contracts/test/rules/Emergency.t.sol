// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../AmplopBase.t.sol";

/// @notice R16 to R20 and R24: Emergency requests, lock-off and cancelling pending changes.
contract EmergencyTest is AmplopBase {
    bytes32 internal constant REASON = keccak256("bus ticket home");
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = registerRaka();
        deposit(id, usd(1000, 0)); // locked = $100 (C1)
    }

    function request(uint256 amount) internal returns (uint64 t) {
        t = amplop.clock(id);
        vm.prank(raka);
        amplop.requestEmergency(amount, REASON);
    }

    // ------------------------------------------------------------ R16

    function test_R16_requestAboveLockedFails() public {
        vm.startPrank(raka);
        vm.expectRevert(AmplopEnvelopes.AmountAboveLocked.selector);
        amplop.requestEmergency(usd(100, 1), REASON);
        vm.expectRevert(AmplopEnvelopes.AmountZero.selector);
        amplop.requestEmergency(0, REASON);
        vm.expectRevert(AmplopEnvelopes.ReasonRequired.selector);
        amplop.requestEmergency(usd(70, 0), bytes32(0));
        vm.stopPrank();
        assertEq(uint8(amplop.emergency(id).status), uint8(EmergencyStatus.None));
    }

    function test_R16_secondRequestWhileOpenFails() public {
        request(usd(70, 0));
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.RequestAlreadyOpen.selector);
        amplop.requestEmergency(usd(10, 0), REASON);
    }

    function test_R16_cancelKeepsLockedBalance() public {
        request(usd(70, 0));
        vm.prank(raka);
        amplop.cancelEmergency();
        assertEq(locked(id), usd(100, 0));
        assertEq(uint8(amplop.emergency(id).status), uint8(EmergencyStatus.Cancelled));
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(AmplopEnvelopes.NoOpenRequest.selector);
        amplop.finalizeEmergency(id);
    }

    function test_R16_secondRequestAfterDone() public {
        link(id, raka, mama);
        request(usd(70, 0));
        vm.prank(mama);
        amplop.approveEmergency(id);
        request(usd(30, 0));
        assertEq(amplop.emergency(id).requestSeq, 2);
        vm.prank(mama);
        amplop.approveEmergency(id);
        assertEq(locked(id), 0);
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.AmountAboveLocked.selector);
        amplop.requestEmergency(1, REASON);
    }

    // ------------------------------------------------------------ R17

    function test_R17_approveOpensAtOnce() public {
        link(id, raka, mama);
        uint256 everyday = available(id, Envelope.Everyday);
        request(usd(70, 0));
        vm.expectEmit(address(amplop));
        emit AmplopEnvelopes.EmergencyOpened(id, 1, usd(70, 0), OpenedBy.Approval);
        vm.prank(mama);
        amplop.approveEmergency(id);
        assertEq(available(id, Envelope.Everyday), everyday + usd(70, 0));
        assertEq(locked(id), usd(30, 0));
        assertEq(uint8(amplop.emergency(id).status), uint8(EmergencyStatus.Opened));
    }

    function test_R17_opensByTimeAtExactly48Hours() public {
        uint64 t = request(usd(70, 0));
        vm.warp(block.timestamp + 172_799);
        vm.expectRevert(abi.encodeWithSelector(AmplopEnvelopes.WaitNotOver.selector, t + 172_800));
        amplop.finalizeEmergency(id);
        vm.warp(block.timestamp + 1);
        vm.expectEmit(address(amplop));
        emit AmplopEnvelopes.EmergencyOpened(id, 1, usd(70, 0), OpenedBy.Time);
        vm.prank(stranger);
        amplop.finalizeEmergency(id);
        assertEq(locked(id), usd(30, 0));
    }

    function test_R17_opensByTimeEvenWithTrustedPerson() public {
        link(id, raka, mama);
        request(usd(70, 0));
        vm.warp(block.timestamp + 2 days);
        amplop.finalizeEmergency(id);
        assertEq(uint8(amplop.emergency(id).status), uint8(EmergencyStatus.Opened));
        assertEq(locked(id), usd(30, 0));
    }

    function test_R17_approveAfterOpenedFails() public {
        link(id, raka, mama);
        request(usd(70, 0));
        vm.warp(block.timestamp + 2 days);
        amplop.finalizeEmergency(id);
        vm.prank(mama);
        vm.expectRevert(AmplopEnvelopes.NoOpenRequest.selector);
        amplop.approveEmergency(id);
    }

    function test_R17_onlyTrustedCanApprove() public {
        link(id, raka, mama);
        request(usd(70, 0));
        address[3] memory others = [raka, stranger, budi];
        for (uint256 i = 0; i < 3; ++i) {
            vm.prank(others[i]);
            vm.expectRevert(AmplopEnvelopes.NotTrusted.selector);
            amplop.approveEmergency(id);
        }
        assertEq(locked(id), usd(100, 0));
    }

    function test_R17_newTrustedCanApproveOldCannot() public {
        link(id, raka, mama);
        request(usd(70, 0));
        vm.prank(raka);
        amplop.removeTrusted();
        vm.warp(block.timestamp + 2 days);
        amplop.finishRemoveTrusted(id);
        // The request is still open after the removal (G14); new person links and approves.
        assertEq(uint8(amplop.emergency(id).status), uint8(EmergencyStatus.Open));
        link(id, raka, budi);
        vm.prank(mama);
        vm.expectRevert(AmplopEnvelopes.NotTrusted.selector);
        amplop.approveEmergency(id);
        vm.prank(budi);
        amplop.approveEmergency(id);
        assertEq(locked(id), usd(30, 0));
    }

    // ------------------------------------------------------------ R18, R19

    function test_R18_openedMoneyToEverydayRestLocked() public {
        link(id, raka, mama);
        uint256 everyday = available(id, Envelope.Everyday);
        request(usd(70, 0));
        vm.prank(mama);
        amplop.approveEmergency(id);
        assertEq(available(id, Envelope.Everyday), everyday + usd(70, 0));
        assertEq(locked(id), usd(30, 0));
        assertEq(views(id)[4].available, 0);
        // Spendable at once, from Everyday.
        bytes32 pid = buy(id, 7832, everyday + usd(70, 0));
        assertEq(uint8(amplop.purchase(pid).state), uint8(PurchaseState.Held));
        assertEq(available(id, Envelope.Everyday), 0);
    }

    function test_R19_noTrustedPersonWaits48Hours() public {
        request(usd(70, 0));
        vm.prank(mama);
        vm.expectRevert(AmplopEnvelopes.NotTrusted.selector);
        amplop.approveEmergency(id);
        vm.warp(block.timestamp + 2 days - 1);
        vm.expectRevert();
        amplop.finalizeEmergency(id);
        vm.warp(block.timestamp + 1);
        vm.expectEmit(address(amplop));
        emit AmplopEnvelopes.EmergencyOpened(id, 1, usd(70, 0), OpenedBy.Time);
        amplop.finalizeEmergency(id);
    }

    // ------------------------------------------------------------ R20

    function test_R20_lockOffAfter48HoursMovesBalance() public {
        uint256 everyday = available(id, Envelope.Everyday);
        vm.prank(raka);
        amplop.startLockOff();
        uint64 readyAt = amplop.clock(id) + 2 days;
        vm.warp(block.timestamp + 2 days - 1);
        vm.expectRevert(abi.encodeWithSelector(AmplopEnvelopes.WaitNotOver.selector, readyAt));
        amplop.finishLockOff(id);
        vm.warp(block.timestamp + 1);
        amplop.finishLockOff(id);
        assertEq(locked(id), 0);
        assertEq(available(id, Envelope.Everyday), everyday + usd(100, 0));
        assertFalse(amplop.accountInfo(id).lockOn);
    }

    function test_R20_laterEmergencySharesArriveUnlocked() public {
        vm.prank(raka);
        amplop.startLockOff();
        vm.warp(block.timestamp + 2 days);
        amplop.finishLockOff(id);
        uint256 everyday = available(id, Envelope.Everyday);
        deposit(id, usd(1000, 0));
        assertEq(locked(id), 0);
        // Emergency part $100 whole and at once, plus Everyday share 1 of $50.
        assertEq(available(id, Envelope.Everyday), everyday + usd(100, 0) + usd(50, 0));
    }

    function test_R20_lockOffAndRequestBlockEachOther() public {
        request(usd(70, 0));
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.RequestAlreadyOpen.selector);
        amplop.startLockOff();
        vm.prank(raka);
        amplop.cancelEmergency();

        vm.prank(raka);
        amplop.startLockOff();
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.LockOffPending.selector);
        amplop.requestEmergency(usd(10, 0), REASON);

        vm.warp(block.timestamp + 2 days);
        amplop.finishLockOff(id);
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.LockAlreadyOff.selector);
        amplop.startLockOff();
        // Nothing turns the lock back on: new Emergency parts stay unlocked.
        deposit(id, usd(1000, 0));
        assertFalse(amplop.accountInfo(id).lockOn);
        assertEq(locked(id), 0);
    }

    // ------------------------------------------------------------ R24

    function test_R24_cancelPendingSplit() public {
        uint8[5] memory next = [uint8(20), 20, 20, 20, 20];
        vm.prank(raka);
        amplop.saveSplit(next);
        vm.prank(raka);
        amplop.cancelPending(PendingKind.Split);
        (bool active,,) = amplop.pending(id, PendingKind.Split);
        assertFalse(active);
        vm.warp(block.timestamp + 3 days);
        uint8[5] memory split = amplop.accountInfo(id).split;
        for (uint256 i = 0; i < 5; ++i) {
            assertEq(split[i], sampleSplit[i]);
        }
    }

    function test_R24_cancelTrustedRemoval() public {
        link(id, raka, mama);
        vm.prank(raka);
        amplop.removeTrusted();
        vm.prank(raka);
        amplop.cancelPending(PendingKind.TrustedRemoval);
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(AmplopEnvelopes.NothingPending.selector);
        amplop.finishRemoveTrusted(id);
        assertEq(amplop.accountInfo(id).trusted, mama);
        assertEq(amplop.trustedAccountOf(mama), id);
    }

    function test_R24_cancelLockOff() public {
        vm.prank(raka);
        amplop.startLockOff();
        vm.prank(raka);
        amplop.cancelPending(PendingKind.LockOff);
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(AmplopEnvelopes.NothingPending.selector);
        amplop.finishLockOff(id);
        assertTrue(amplop.accountInfo(id).lockOn);
        assertEq(locked(id), usd(100, 0));
    }

    function test_R24_cancelRecovery() public {
        link(id, raka, mama);
        vm.prank(mama);
        amplop.approveRecovery(id, dewi);
        assertEq(amplop.recoveryAccountOf(dewi), id);
        vm.prank(raka);
        amplop.cancelPending(PendingKind.Recovery);
        assertEq(amplop.recoveryAccountOf(dewi), 0);
        vm.warp(block.timestamp + 3 days);
        vm.expectRevert(AmplopEnvelopes.NothingPending.selector);
        amplop.finishRecovery(id);
        assertEq(amplop.accountInfo(id).owner, raka);
        assertEq(amplop.accountOf(raka), id);
    }

    function test_R24_cancelAfterWaitFails() public {
        vm.prank(raka);
        amplop.startLockOff();
        vm.warp(block.timestamp + 2 days);
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.WaitOver.selector);
        amplop.cancelPending(PendingKind.LockOff);

        // A due split counts as in force.
        uint8[5] memory next = [uint8(20), 20, 20, 20, 20];
        vm.prank(raka);
        amplop.saveSplit(next);
        vm.warp(block.timestamp + 2 days);
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.NothingPending.selector);
        amplop.cancelPending(PendingKind.Split);

        // Nothing pending at all.
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.NothingPending.selector);
        amplop.cancelPending(PendingKind.Recovery);
    }
}
