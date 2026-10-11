// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "./AmplopBase.t.sol";

/// @notice Regression tests for the self-audit findings in audits/2026-10-self-review.md (S04-23).
contract AuditFixesTest is AmplopBase {
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = registerRaka();
        deposit(id, usd(1000, 0)); // locked = $100
        link(id, raka, mama);
    }

    /// SA-01: an approval opens only the request it was given for, never one swapped in while it was in flight.
    function test_SA01_approvalBoundToRequest() public {
        vm.prank(raka);
        amplop.requestEmergency(usd(10, 0), keccak256("bus fare"));
        uint64 approvedSeq = amplop.emergency(id).requestSeq;

        // The student swaps the request before Mama's approval lands.
        vm.startPrank(raka);
        amplop.cancelEmergency();
        amplop.requestEmergency(usd(100, 0), keccak256("x"));
        vm.stopPrank();

        vm.prank(mama);
        vm.expectRevert(AmplopEnvelopes.RequestChanged.selector);
        amplop.approveEmergency(id, approvedSeq);
        assertEq(locked(id), usd(100, 0), "nothing opened");

        uint64 seq = amplop.emergency(id).requestSeq;
        vm.prank(mama);
        amplop.approveEmergency(id, seq); // approving what she now sees still works
        assertEq(locked(id), 0);
    }

    /// SA-02: a trusted person cannot block their own removal by re-approving a recovery after every cancel.
    function test_SA02_recoveryCannotBlockRemoval() public {
        address target = makeAddr("target");
        vm.prank(mama);
        amplop.approveRecovery(id, target);
        vm.prank(raka);
        amplop.removeTrusted(); // used to revert RecoveryPending
        (bool active,,) = amplop.pending(id, PendingKind.Recovery);
        assertFalse(active, "recovery cancelled");
        assertEq(amplop.recoveryAccountOf(target), 0);

        vm.prank(mama);
        vm.expectRevert(AmplopEnvelopes.TrustedRemovalPending.selector);
        amplop.approveRecovery(id, makeAddr("target2"));

        skip(2 days);
        amplop.finishRemoveTrusted(id);
        assertEq(amplop.accountInfo(id).trusted, address(0));
    }

    /// SA-03: a recovery that can no longer finish (its new owner registered meanwhile) can still be cancelled.
    function test_SA03_deadRecoveryCanBeCancelled() public {
        address target = makeAddr("target");
        vm.prank(mama);
        amplop.approveRecovery(id, target);
        register(target, sampleSplit); // the target registers during the wait
        skip(2 days);

        vm.prank(target);
        vm.expectRevert(AmplopEnvelopes.NewOwnerHasAccount.selector);
        amplop.finishRecovery(id);

        vm.prank(raka);
        amplop.cancelPending(PendingKind.Recovery); // used to revert WaitOver
        (bool active,,) = amplop.pending(id, PendingKind.Recovery);
        assertFalse(active);
        assertEq(amplop.recoveryAccountOf(target), 0);
    }

    /// SA-03: a live recovery past its wait is still not cancellable (R24 unchanged).
    function test_SA03_liveRecoveryStillNotCancellableAfterWait() public {
        vm.prank(mama);
        amplop.approveRecovery(id, makeAddr("target"));
        skip(2 days);
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.WaitOver.selector);
        amplop.cancelPending(PendingKind.Recovery);
    }

    /// SA-04: an account cannot be pushed onto an address that did not ask for it.
    function test_SA04_onlyNewOwnerFinishesRecovery() public {
        address target = makeAddr("target");
        vm.prank(mama);
        amplop.approveRecovery(id, target);
        skip(2 days);

        vm.prank(stranger);
        vm.expectRevert(AmplopEnvelopes.NotNewOwner.selector);
        amplop.finishRecovery(id);
        assertEq(amplop.accountOf(target), 0, "target still free to register");

        vm.prank(target);
        amplop.finishRecovery(id);
        assertEq(amplop.accountOf(target), id);
    }

    /// SA-05: a thief's invite and lock-off, started with the old key, do not survive a recovery.
    function test_SA05_recoveryDropsOldKeyInviteAndLockOff() public {
        uint256 thiefKeyPk = 0xBAD;
        vm.startPrank(raka); // the thief holds Raka's old key
        amplop.createInvite(vm.addr(thiefKeyPk));
        amplop.startLockOff();
        vm.stopPrank();

        address target = makeAddr("target");
        vm.prank(mama);
        amplop.approveRecovery(id, target);
        skip(2 days);
        vm.prank(target);
        amplop.finishRecovery(id);

        (address key,,) = amplop.inviteOf(id);
        assertEq(key, address(0), "invite dropped");
        (bool lockOffPending,,) = amplop.pending(id, PendingKind.LockOff);
        assertFalse(lockOffPending, "lock-off dropped");
        vm.expectRevert(abi.encodeWithSelector(AmplopEnvelopes.NothingPending.selector));
        amplop.finishLockOff(id);
        assertEq(locked(id), usd(100, 0), "Emergency money stays locked");
    }

    /// SA-06: reusing an invite key is refused, so a removed trusted person's old signature stays dead.
    function test_SA06_inviteKeyWorksOnce() public {
        uint256 pk = 0x5EED;
        vm.prank(raka);
        amplop.createInvite(vm.addr(pk));
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.InviteKeyReused.selector);
        amplop.createInvite(vm.addr(pk));

        uint256 other = register(dewi, sampleSplit); // and not on another account either
        vm.prank(dewi);
        vm.expectRevert(AmplopEnvelopes.InviteKeyReused.selector);
        amplop.createInvite(vm.addr(pk));
        assertTrue(amplop.inviteKeyUsed(vm.addr(pk)));
        assertGt(other, 0);
    }

    /// SA-02 follow-up: once a recovery's wait is over, the old key cannot kill it through removeTrusted.
    function test_SA02_dueRecoveryNotCancelledByRemoval() public {
        address target = makeAddr("target");
        vm.prank(mama);
        amplop.approveRecovery(id, target);
        skip(2 days);
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.RecoveryPending.selector);
        amplop.removeTrusted();
        vm.prank(target);
        amplop.finishRecovery(id);
        assertEq(amplop.accountOf(target), id);
    }
}
