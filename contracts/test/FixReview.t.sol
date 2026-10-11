// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AmplopBase} from "./AmplopBase.t.sol";
import {AmplopEnvelopes, PendingKind} from "../src/AmplopEnvelopes.sol";

/// @notice Review of the SA-01..SA-06 fixes. Each test asserts the safe behaviour; every test passes.
contract FixReviewTest is AmplopBase {
    uint256 private _pk = 0xB0B;

    /// Links `who` with a fresh invite key (SA-06 refuses reused keys).
    function _link(uint256 accId, address owner, address who) private {
        uint256 pk = ++_pk;
        vm.prank(owner);
        amplop.createInvite(vm.addr(pk));
        bytes memory sig = signInvite(pk, accId, who);
        vm.prank(who);
        amplop.acceptInvite(accId, sig);
    }

    function _approve(address trusted, uint256 accId, address newOwner) private {
        vm.prank(trusted);
        amplop.approveRecovery(accId, newOwner);
    }

    // ------------------------------------------------------------ issues found in the fix review (fixed in 3ae9e0f, 84c4a2b)

    /// SA-06: anyone who sees createInvite(key) in the mempool can burn that key first.
    function test_FR_inviteKeyFrontRun() public {
        registerRaka();
        register(stranger, sampleSplit);
        vm.prank(stranger); // front-runs raka with raka's key
        amplop.createInvite(inviteKey);
        vm.prank(raka);
        amplop.createInvite(inviteKey); // safe behaviour: raka's invite still goes through
    }

    /// SA-02: after the wait is over the old key can still kill a due recovery (removeTrusted), until the new owner acts.
    function test_FR_oldKeyKillsDueRecovery() public {
        uint256 id = registerRaka();
        _link(id, raka, mama);
        address x = makeAddr("newPhone");
        _approve(mama, id, x);
        vm.warp(block.timestamp + 2 days);

        vm.prank(raka); // whoever holds the lost key
        vm.expectRevert(AmplopEnvelopes.RecoveryPending.selector);
        amplop.removeTrusted();
        (bool active,,) = amplop.pending(id, PendingKind.Recovery);
        assertTrue(active, "due recovery should survive, like cancelPending's WaitOver");
    }

    // ------------------------------------------------------------ checked properties

    /// SA-03 then the blocker goes away: index stays consistent and the address is usable again.
    function test_FR_deadRecoveryCancelledThenAddressFreed() public {
        uint256 a = registerRaka();
        _link(a, raka, mama);
        address x = makeAddr("x");
        address y = makeAddr("y");
        _approve(mama, a, x);
        uint256 c = register(x, sampleSplit); // recovery to x is now dead
        vm.warp(block.timestamp + 3 days);

        vm.prank(raka);
        amplop.cancelPending(PendingKind.Recovery);
        assertEq(amplop.recoveryAccountOf(x), 0);

        _link(c, x, budi); // x's own account moves to y
        _approve(budi, c, y);
        vm.warp(block.timestamp + 2 days);
        vm.prank(y);
        amplop.finishRecovery(c);
        assertEq(amplop.accountOf(x), 0);

        _approve(mama, a, x); // x is a fresh target again
        vm.warp(block.timestamp + 2 days);
        vm.prank(x);
        amplop.finishRecovery(a);
        assertEq(amplop.accountOf(x), a);
        assertEq(amplop.recoveryAccountOf(x), 0);
    }

    /// A dead recovery left alone revives when the blocker's account moves away; finish then works.
    function test_FR_deadRecoveryRevives() public {
        uint256 a = registerRaka();
        _link(a, raka, mama);
        address x = makeAddr("x");
        _approve(mama, a, x);
        uint256 c = register(x, sampleSplit);
        _link(c, x, budi);
        _approve(budi, c, makeAddr("y"));
        vm.warp(block.timestamp + 2 days);
        vm.prank(makeAddr("y"));
        amplop.finishRecovery(c);

        vm.prank(raka); // no longer dead and due, so not cancellable
        vm.expectRevert(AmplopEnvelopes.WaitOver.selector);
        amplop.cancelPending(PendingKind.Recovery);
        vm.prank(x);
        amplop.finishRecovery(a);
        assertEq(amplop.accountOf(x), a);
    }

    /// SA-05: a dropped lock-off leaves the lock on and the new owner can start it again.
    function test_FR_lockOffDroppedIsRestartable() public {
        uint256 id = registerRaka();
        deposit(id, usd(1000, 0));
        _link(id, raka, mama);
        vm.prank(raka);
        amplop.startLockOff();
        address x = makeAddr("x");
        _approve(mama, id, x);
        vm.warp(block.timestamp + 2 days);
        vm.prank(x);
        amplop.finishRecovery(id);

        vm.expectRevert(AmplopEnvelopes.NothingPending.selector);
        amplop.finishLockOff(id);
        assertTrue(amplop.accountInfo(id).lockOn);
        vm.prank(x);
        amplop.requestEmergency(usd(10, 0), keccak256("r")); // no longer blocked by a stale lock-off
        vm.prank(x);
        amplop.cancelEmergency();
        vm.prank(x);
        amplop.startLockOff();
        vm.warp(block.timestamp + 2 days);
        amplop.finishLockOff(id);
        assertEq(locked(id), 0);
    }

    /// SA-02 + SA-03: removal clears the index, so the target is free for another account at once.
    function test_FR_removeTrustedFreesTarget() public {
        uint256 a = registerRaka();
        _link(a, raka, mama);
        uint256 b = register(dewi, sampleSplit);
        _link(b, dewi, budi);
        address x = makeAddr("x");
        _approve(mama, a, x);
        vm.prank(raka);
        amplop.removeTrusted();
        assertEq(amplop.recoveryAccountOf(x), 0);
        _approve(budi, b, x);
        vm.prank(mama); // removal pending: mama cannot re-approve
        vm.expectRevert(AmplopEnvelopes.TrustedRemovalPending.selector);
        amplop.approveRecovery(a, makeAddr("z"));
    }
}
