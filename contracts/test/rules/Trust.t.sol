// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../AmplopBase.t.sol";
import {Vm} from "forge-std/Vm.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {NoDecimalsERC20} from "../mocks/NoDecimalsERC20.sol";

/// @notice Invites, trusted person, recovery, owner checks, demo skip, events and constructor (S03-55).
contract TrustTest is AmplopBase {
    address internal rakaNew = makeAddr("rakaNew");
    uint256 internal key2Pk = 0xB0B;

    // ------------------------------------------------------------ R22 invites

    function test_R22_inviteWorksOnce() public {
        uint256 id = registerRaka();
        link(id, raka, mama);
        assertEq(amplop.accountInfo(id).trusted, mama);
        (,, bool used) = amplop.inviteOf(id);
        assertTrue(used);
        bytes memory sig = signInvite(inviteKeyPk, id, budi);
        vm.prank(budi);
        vm.expectRevert(AmplopEnvelopes.InviteUsed.selector);
        amplop.acceptInvite(id, sig);
    }

    function test_R22_inviteExpiresAfterSevenDays() public {
        uint256 id = registerRaka();
        vm.prank(raka);
        amplop.createInvite(inviteKey);
        (, uint64 exp,) = amplop.inviteOf(id);
        assertEq(exp, amplop.clock(id) + 7 days);
        bytes memory sig = signInvite(inviteKeyPk, id, mama);

        uint256 snap = vm.snapshotState();
        vm.warp(block.timestamp + 7 days - 1);
        vm.prank(mama);
        amplop.acceptInvite(id, sig);
        vm.revertToState(snap);

        vm.warp(block.timestamp + 7 days);
        vm.prank(mama);
        vm.expectRevert(AmplopEnvelopes.InviteExpired.selector);
        amplop.acceptInvite(id, sig);
    }

    function test_R22_signatureForAnotherAddressFails() public {
        uint256 id = registerRaka();
        vm.prank(raka);
        amplop.createInvite(inviteKey);
        bytes memory sig = signInvite(inviteKeyPk, id, mama);
        vm.prank(budi);
        vm.expectRevert(AmplopEnvelopes.BadSignature.selector);
        amplop.acceptInvite(id, sig);
    }

    function test_R22_newInviteReplacesOld() public {
        uint256 id = registerRaka();
        vm.prank(raka);
        amplop.createInvite(inviteKey);
        vm.prank(raka);
        amplop.createInvite(vm.addr(key2Pk));
        bytes memory oldSig = signInvite(inviteKeyPk, id, mama);
        vm.prank(mama);
        vm.expectRevert(AmplopEnvelopes.BadSignature.selector);
        amplop.acceptInvite(id, oldSig);
        bytes memory newSig = signInvite(key2Pk, id, mama);
        vm.prank(mama);
        amplop.acceptInvite(id, newSig);
        assertEq(amplop.accountInfo(id).trusted, mama);
    }

    function test_R22_ownerCannotAcceptOwnInvite() public {
        uint256 id = registerRaka();
        vm.prank(raka);
        amplop.createInvite(inviteKey);
        bytes memory sig = signInvite(inviteKeyPk, id, raka);
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.CannotTrustSelf.selector);
        amplop.acceptInvite(id, sig);
    }

    function test_R22_trustedOfAnotherCannotAccept() public {
        uint256 a = registerRaka();
        uint256 b = register(dewi, sampleSplit);
        link(a, raka, mama);
        vm.prank(dewi);
        amplop.createInvite(inviteKey);
        bytes memory sig = signInvite(inviteKeyPk, b, mama);
        vm.prank(mama);
        vm.expectRevert(AmplopEnvelopes.AlreadyTrusted.selector);
        amplop.acceptInvite(b, sig);
    }

    function test_R22_cannotLinkWhileTrustedLinked() public {
        uint256 id = registerRaka();
        link(id, raka, mama);
        vm.prank(raka);
        amplop.createInvite(inviteKey);
        bytes memory sig = signInvite(inviteKeyPk, id, budi);
        vm.prank(budi);
        vm.expectRevert(AmplopEnvelopes.TrustedAlreadyLinked.selector);
        amplop.acceptInvite(id, sig);
    }

    function test_R22_replaceTrustedAfter48Hours() public {
        uint256 id = registerRaka();
        link(id, raka, mama);
        vm.prank(raka);
        amplop.removeTrusted();
        vm.prank(raka);
        amplop.createInvite(inviteKey);
        bytes memory sig = signInvite(inviteKeyPk, id, budi);
        // During the wait mama keeps her role.
        vm.warp(block.timestamp + 48 hours - 1);
        vm.expectRevert(abi.encodeWithSelector(AmplopEnvelopes.WaitNotOver.selector, uint64(START + 48 hours)));
        amplop.finishRemoveTrusted(id);
        assertEq(amplop.accountInfo(id).trusted, mama);
        vm.warp(block.timestamp + 1);
        vm.prank(stranger);
        amplop.finishRemoveTrusted(id);
        assertEq(amplop.trustedAccountOf(mama), 0);
        vm.prank(budi);
        amplop.acceptInvite(id, sig);
        assertEq(amplop.accountInfo(id).trusted, budi);
        // Old trusted has no role.
        vm.prank(mama);
        vm.expectRevert(AmplopEnvelopes.NotTrusted.selector);
        amplop.approveRecovery(id, rakaNew);
    }

    // ------------------------------------------------------------ R2

    function test_R2_atMostOneTrustedPerson() public {
        uint256 a = registerRaka();
        uint256 b = register(dewi, sampleSplit);
        link(a, raka, mama);
        assertEq(amplop.trustedAccountOf(mama), a);
        // Mama cannot also trust Dewi.
        vm.prank(dewi);
        amplop.createInvite(inviteKey);
        bytes memory sig = signInvite(inviteKeyPk, b, mama);
        vm.prank(mama);
        vm.expectRevert(AmplopEnvelopes.AlreadyTrusted.selector);
        amplop.acceptInvite(b, sig);
        // Owning one account and being the trusted person of another is allowed.
        sig = signInvite(inviteKeyPk, b, raka);
        vm.prank(raka);
        amplop.acceptInvite(b, sig);
        assertEq(amplop.trustedAccountOf(raka), b);
        assertEq(amplop.accountOf(raka), a);
    }

    // ------------------------------------------------------------ R23 recovery

    function _linked() internal returns (uint256 id) {
        id = registerRaka();
        link(id, raka, mama);
    }

    function test_R23_onlyTrustedCanApprove() public {
        uint256 id = _linked();
        vm.prank(stranger);
        vm.expectRevert(AmplopEnvelopes.NotTrusted.selector);
        amplop.approveRecovery(id, rakaNew);
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.NotTrusted.selector);
        amplop.approveRecovery(id, rakaNew);
    }

    function test_R23_oldOwnerCanCancel() public {
        uint256 id = _linked();
        vm.prank(mama);
        amplop.approveRecovery(id, rakaNew);
        vm.prank(raka);
        amplop.cancelPending(PendingKind.Recovery);
        (bool active,,) = amplop.pending(id, PendingKind.Recovery);
        assertFalse(active);
        vm.warp(block.timestamp + 48 hours);
        vm.expectRevert(AmplopEnvelopes.NothingPending.selector);
        amplop.finishRecovery(id);
        assertEq(amplop.accountOf(raka), id);
    }

    function test_R23_newOwnerControlsAfter48Hours() public {
        uint256 id = _linked();
        deposit(id, usd(1000, 0));
        bytes32 pid = buy(id, 5411, usd(10, 0));
        vm.prank(raka);
        amplop.requestEmergency(usd(50, 0), keccak256("bus"));
        EnvelopeView[5] memory before = views(id);

        vm.prank(mama);
        amplop.approveRecovery(id, rakaNew);
        vm.warp(block.timestamp + 48 hours);
        vm.prank(rakaNew);
        amplop.finishRecovery(id);

        assertEq(amplop.accountOf(rakaNew), id);
        assertEq(amplop.accountOf(raka), 0);
        assertEq(amplop.accountInfo(id).owner, rakaNew);
        assertEq(amplop.recoveryAccountOf(rakaNew), 0);
        assertViewsEq(views(id), before);
        assertEq(uint8(amplop.purchase(pid).state), uint8(PurchaseState.Held));
        assertEq(uint8(amplop.emergency(id).status), uint8(EmergencyStatus.Open));

        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.NoAccount.selector);
        amplop.cancelEmergency();
        vm.prank(rakaNew);
        amplop.cancelEmergency();
    }

    function test_R23_nothingHappensWithoutApproval() public {
        uint256 id = _linked();
        vm.warp(block.timestamp + 30 days);
        vm.expectRevert(AmplopEnvelopes.NothingPending.selector);
        amplop.finishRecovery(id);
        assertEq(amplop.accountInfo(id).owner, raka);
    }

    function test_R23_newOwnerWithAccountRejected() public {
        uint256 id = _linked();
        register(dewi, sampleSplit);
        vm.prank(mama);
        vm.expectRevert(AmplopEnvelopes.NewOwnerHasAccount.selector);
        amplop.approveRecovery(id, dewi);
        vm.prank(mama);
        vm.expectRevert(AmplopEnvelopes.NewOwnerHasAccount.selector);
        amplop.approveRecovery(id, raka);

        vm.prank(mama);
        amplop.approveRecovery(id, rakaNew);
        register(rakaNew, sampleSplit);
        vm.warp(block.timestamp + 48 hours);
        vm.prank(rakaNew);
        vm.expectRevert(AmplopEnvelopes.NewOwnerHasAccount.selector);
        amplop.finishRecovery(id);
    }

    function test_R23_noTrustedPersonNoRecovery() public {
        uint256 id = registerRaka();
        vm.prank(stranger);
        vm.expectRevert(AmplopEnvelopes.NotTrusted.selector);
        amplop.approveRecovery(id, rakaNew);
        vm.prank(address(0));
        vm.expectRevert(AmplopEnvelopes.NotTrusted.selector);
        amplop.approveRecovery(id, rakaNew);
    }

    function test_R23_secondApprovalRestartsWait() public {
        uint256 id = _linked();
        address other = makeAddr("other");
        vm.prank(mama);
        amplop.approveRecovery(id, rakaNew);
        vm.warp(block.timestamp + 1 days);
        vm.prank(mama);
        amplop.approveRecovery(id, other);
        (bool active, uint64 readyAt, bytes32 data) = amplop.pending(id, PendingKind.Recovery);
        assertTrue(active);
        assertEq(readyAt, amplop.clock(id) + 48 hours);
        assertEq(data, bytes32(uint256(uint160(other))));
        assertEq(amplop.recoveryAccountOf(rakaNew), 0);
        assertEq(amplop.recoveryAccountOf(other), id);
    }

    function test_R23_recoveryAccountOfTracksPending() public {
        uint256 id = _linked();
        vm.prank(mama);
        amplop.approveRecovery(id, rakaNew);
        assertEq(amplop.recoveryAccountOf(rakaNew), id);
        vm.prank(raka);
        amplop.cancelPending(PendingKind.Recovery);
        assertEq(amplop.recoveryAccountOf(rakaNew), 0);

        // Another account cannot target the same new owner while one waits.
        uint256 b = register(dewi, sampleSplit);
        vm.prank(dewi);
        amplop.createInvite(inviteKey);
        bytes memory sig = signInvite(inviteKeyPk, b, budi);
        vm.prank(budi);
        amplop.acceptInvite(b, sig);
        vm.prank(mama);
        amplop.approveRecovery(id, rakaNew);
        vm.prank(budi);
        vm.expectRevert(AmplopEnvelopes.RecoveryTargetBusy.selector);
        amplop.approveRecovery(b, rakaNew);

        vm.warp(block.timestamp + 48 hours);
        vm.prank(rakaNew);
        amplop.finishRecovery(id);
        assertEq(amplop.recoveryAccountOf(rakaNew), 0);
    }

    function test_R23_removalAndRecoveryBlockEachOther() public {
        uint256 id = _linked();
        vm.prank(mama);
        amplop.approveRecovery(id, rakaNew);
        // SA-02: starting a removal cancels the recovery the trusted person approved.
        vm.prank(raka);
        amplop.removeTrusted();
        (bool active,,) = amplop.pending(id, PendingKind.Recovery);
        assertFalse(active);
        assertEq(amplop.recoveryAccountOf(rakaNew), 0);
        vm.prank(mama);
        vm.expectRevert(AmplopEnvelopes.TrustedRemovalPending.selector);
        amplop.approveRecovery(id, rakaNew);
    }

    // ------------------------------------------------------------ R1 owner functions

    function test_R1_onlyOwnerActsAsStudent() public {
        registerRaka();
        uint8[5] memory s = sampleSplit;
        vm.startPrank(stranger);
        vm.expectRevert(AmplopEnvelopes.NoAccount.selector);
        amplop.saveSplit(s);
        vm.expectRevert(AmplopEnvelopes.NoAccount.selector);
        amplop.createInvite(inviteKey);
        vm.expectRevert(AmplopEnvelopes.NoAccount.selector);
        amplop.removeTrusted();
        vm.expectRevert(AmplopEnvelopes.NoAccount.selector);
        amplop.movePurchase(bytes32(uint256(1)), Envelope.Food);
        vm.expectRevert(AmplopEnvelopes.NoAccount.selector);
        amplop.requestEmergency(1, keccak256("x"));
        vm.expectRevert(AmplopEnvelopes.NoAccount.selector);
        amplop.cancelEmergency();
        vm.expectRevert(AmplopEnvelopes.NoAccount.selector);
        amplop.startLockOff();
        vm.expectRevert(AmplopEnvelopes.NoAccount.selector);
        amplop.cancelPending(PendingKind.Split);
        vm.expectRevert(AmplopEnvelopes.NoAccount.selector);
        amplop.skipDays(1);
        vm.stopPrank();
    }

    // ------------------------------------------------------------ demo

    function test_DEMO_skipDaysRevertsWhenDemoOff() public {
        amplop = _deploy(false);
        registerRaka();
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.DemoOff.selector);
        amplop.skipDays(1);
        vm.prank(stranger);
        vm.expectRevert(AmplopEnvelopes.DemoOff.selector);
        amplop.skipDays(0);
    }

    function test_DEMO_skipAffectsOnlyCallersAccount() public {
        uint256 a = registerRaka();
        uint256 b = register(dewi, sampleSplit);
        deposit(a, usd(1000, 0));
        deposit(b, usd(1000, 0));
        vm.prank(dewi);
        amplop.requestEmergency(usd(10, 0), keccak256("r"));
        EnvelopeView[5] memory bBefore = views(b);
        uint64 bClock = amplop.clock(b);

        vm.prank(raka);
        amplop.skipDays(7);
        assertEq(amplop.clock(a), block.timestamp + 7 days);
        assertEq(amplop.accountInfo(a).skipSeconds, 7 days);
        assertEq(available(a, Envelope.Food), usd(200, 0));

        assertEq(amplop.clock(b), bClock);
        assertViewsEq(views(b), bBefore);
        vm.expectRevert(abi.encodeWithSelector(AmplopEnvelopes.WaitNotOver.selector, bClock + 48 hours));
        amplop.finalizeEmergency(b);
    }

    function test_DEMO_skipDaysBounds() public {
        uint256 id = registerRaka();
        vm.startPrank(raka);
        vm.expectRevert(AmplopEnvelopes.InvalidDays.selector);
        amplop.skipDays(0);
        vm.expectRevert(AmplopEnvelopes.InvalidDays.selector);
        amplop.skipDays(15);
        amplop.skipDays(14);
        vm.stopPrank();
        assertEq(amplop.clock(id), block.timestamp + 14 days);
    }

    // ------------------------------------------------------------ events

    function _expectOneLog() internal {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 n;
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].emitter == address(amplop)) ++n;
        }
        assertEq(n, 1, "one event per write");
        vm.recordLogs();
    }

    function test_EVENTS_everyWriteEmitsExactlyOne() public {
        vm.recordLogs();
        uint256 id = registerRaka();
        _expectOneLog();
        vm.prank(raka);
        amplop.saveSplit(sampleSplit); // immediate
        _expectOneLog();
        deposit(id, usd(1000, 0));
        _expectOneLog();
        vm.prank(raka);
        amplop.saveSplit(sampleSplit); // pending
        _expectOneLog();
        vm.prank(raka);
        amplop.cancelPending(PendingKind.Split);
        _expectOneLog();

        vm.prank(raka);
        amplop.createInvite(inviteKey);
        _expectOneLog();
        bytes memory sig = signInvite(inviteKeyPk, id, mama);
        vm.prank(mama);
        amplop.acceptInvite(id, sig);
        _expectOneLog();

        bytes32 p1 = buy(id, 5942, usd(10, 0)); // approved, Everyday
        _expectOneLog();
        buy(id, 7995, usd(1, 0)); // declined
        _expectOneLog();
        vm.prank(raka);
        amplop.movePurchase(p1, Envelope.Study);
        _expectOneLog();
        vm.prank(cardService);
        amplop.collect(p1, usd(5, 0));
        _expectOneLog();
        vm.prank(cardService);
        amplop.refund(p1, usd(1, 0));
        _expectOneLog();
        bytes32 p2 = buy(id, 5411, usd(1, 0));
        _expectOneLog();
        vm.prank(cardService);
        amplop.releaseHold(p2);
        _expectOneLog();

        vm.prank(raka);
        amplop.requestEmergency(usd(10, 0), keccak256("r"));
        _expectOneLog();
        uint64 seq10 = amplop.emergency(id).requestSeq;
        vm.prank(mama);
        amplop.approveEmergency(id, seq10);
        _expectOneLog();
        vm.prank(raka);
        amplop.requestEmergency(usd(10, 0), keccak256("r"));
        _expectOneLog();
        vm.prank(raka);
        amplop.cancelEmergency();
        _expectOneLog();
        vm.prank(raka);
        amplop.requestEmergency(usd(10, 0), keccak256("r"));
        _expectOneLog();
        vm.warp(block.timestamp + 48 hours);
        amplop.finalizeEmergency(id);
        _expectOneLog();

        vm.prank(raka);
        amplop.skipDays(1);
        _expectOneLog();

        vm.prank(raka);
        amplop.startLockOff();
        _expectOneLog();
        vm.warp(block.timestamp + 48 hours);
        amplop.finishLockOff(id);
        _expectOneLog();

        vm.prank(mama);
        amplop.approveRecovery(id, rakaNew);
        _expectOneLog();
        vm.warp(block.timestamp + 48 hours);
        vm.prank(rakaNew);
        amplop.finishRecovery(id);
        _expectOneLog();

        vm.prank(rakaNew);
        amplop.removeTrusted();
        _expectOneLog();
        vm.warp(block.timestamp + 48 hours);
        amplop.finishRemoveTrusted(id);
        _expectOneLog();
    }

    // ------------------------------------------------------------ constructor

    function test_CTOR_zeroAddressesAndDecimals() public {
        IERC20 t = IERC20(address(token));
        vm.expectRevert(AmplopEnvelopes.ZeroAddress.selector);
        new AmplopEnvelopes(IERC20(address(0)), settlement, treasury, cardService, true);
        vm.expectRevert(AmplopEnvelopes.ZeroAddress.selector);
        new AmplopEnvelopes(t, address(0), treasury, cardService, true);
        vm.expectRevert(AmplopEnvelopes.ZeroAddress.selector);
        new AmplopEnvelopes(t, settlement, address(0), cardService, true);
        vm.expectRevert(AmplopEnvelopes.ZeroAddress.selector);
        new AmplopEnvelopes(t, settlement, treasury, address(0), true);

        NoDecimalsERC20 nd = new NoDecimalsERC20();
        vm.expectRevert(AmplopEnvelopes.TokenDecimalsUnreadable.selector);
        new AmplopEnvelopes(IERC20(address(nd)), settlement, treasury, cardService, true);

        MockERC20 t18 = new MockERC20("x", "x", 18);
        AmplopEnvelopes a = new AmplopEnvelopes(IERC20(address(t18)), settlement, treasury, cardService, false);
        assertEq(address(a.token()), address(t18));
        assertEq(a.settlement(), settlement);
        assertEq(a.treasury(), treasury);
        assertEq(a.cardService(), cardService);
        assertFalse(a.demoMode());
        assertEq(a.tokenDecimals(), 18);
        assertEq(a.accountCount(), 0);
        assertEq(amplop.tokenDecimals(), dec);
        assertTrue(amplop.demoMode());
    }
}
