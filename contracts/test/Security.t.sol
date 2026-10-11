// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "./AmplopBase.t.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ReentrantERC20} from "./mocks/ReentrantERC20.sol";
import {FeeOnTransferERC20} from "./mocks/FeeOnTransferERC20.sol";

/// @notice PRD 15 security tests, contract part (S03-58).
contract SecurityTest is AmplopBase {
    uint256 internal constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    function _invited() internal returns (uint256 id) {
        id = registerRaka();
        vm.prank(raka);
        amplop.createInvite(inviteKey);
    }

    function test_SEC_inviteSignatureForAnotherChainRejected() public {
        uint256 id = _invited();
        bytes memory sig = signInviteFor(inviteKeyPk, id, mama, 1, address(amplop));
        vm.prank(mama);
        vm.expectRevert(AmplopEnvelopes.BadSignature.selector);
        amplop.acceptInvite(id, sig);
    }

    function test_SEC_inviteSignatureForAnotherContractRejected() public {
        uint256 id = _invited();
        bytes memory sig = signInviteFor(inviteKeyPk, id, mama, block.chainid, makeAddr("otherContract"));
        vm.prank(mama);
        vm.expectRevert(AmplopEnvelopes.BadSignature.selector);
        amplop.acceptInvite(id, sig);
    }

    function test_SEC_malleableSignatureRejected() public {
        uint256 id = _invited();
        bytes memory sig = signInvite(inviteKeyPk, id, mama);
        bytes32 r;
        bytes32 s;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
        }
        uint8 v = uint8(sig[64]);
        bytes memory twin = abi.encodePacked(r, bytes32(SECP256K1_N - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        vm.prank(mama);
        vm.expectRevert(AmplopEnvelopes.BadSignature.selector);
        amplop.acceptInvite(id, twin);
        // The original still works.
        vm.prank(mama);
        amplop.acceptInvite(id, sig);
    }

    function test_SEC_skipDaysRevertsWithDemoOff() public {
        amplop = _deploy(false);
        registerRaka();
        register(dewi, sampleSplit);
        address[3] memory who = [raka, dewi, stranger];
        for (uint256 i = 0; i < who.length; ++i) {
            for (uint16 d = 0; d <= 15; d += 5) {
                vm.prank(who[i]);
                vm.expectRevert(AmplopEnvelopes.DemoOff.selector);
                amplop.skipDays(d);
            }
        }
    }

    function test_SEC_reentrancyBlocked() public {
        ReentrantERC20 re = new ReentrantERC20();
        AmplopEnvelopes a = new AmplopEnvelopes(IERC20(address(re)), settlement, treasury, cardService, true);
        re.mint(treasury, usd(10_000, 0));
        re.mint(settlement, usd(10_000, 0));
        vm.prank(treasury);
        re.approve(address(a), type(uint256).max);
        vm.prank(settlement);
        re.approve(address(a), type(uint256).max);
        vm.prank(raka);
        uint256 id = a.register(sampleSplit);
        vm.prank(treasury);
        a.deposit(id, usd(1000, 0), keccak256("p1"));

        bytes4 guardErr = ReentrancyGuard.ReentrancyGuardReentrantCall.selector;

        // deposit -> transferFrom -> deposit
        re.arm(address(a), abi.encodeCall(a.deposit, (id, 1, keccak256("p3"))));
        vm.prank(treasury);
        vm.expectRevert(guardErr);
        a.deposit(id, usd(1, 0), keccak256("p2"));

        // collect -> transfer -> collect
        bytes32 pid = keccak256("buy1");
        vm.prank(cardService);
        a.authorize(id, pid, 5411, usd(10, 0));
        re.arm(address(a), abi.encodeCall(a.collect, (pid, 1)));
        vm.prank(cardService);
        vm.expectRevert(guardErr);
        a.collect(pid, usd(5, 0));

        // refund -> transferFrom -> refund
        re.arm(address(0), "");
        vm.prank(cardService);
        a.collect(pid, usd(5, 0));
        re.arm(address(a), abi.encodeCall(a.refund, (pid, 1)));
        vm.prank(cardService);
        vm.expectRevert(guardErr);
        a.refund(pid, usd(1, 0));
    }

    function test_SEC_feeOnTransferTokenRejected() public {
        FeeOnTransferERC20 fee = new FeeOnTransferERC20();
        AmplopEnvelopes a = new AmplopEnvelopes(IERC20(address(fee)), settlement, treasury, cardService, true);
        fee.mint(treasury, 10_000e6);
        vm.prank(treasury);
        fee.approve(address(a), type(uint256).max);
        vm.prank(raka);
        uint256 id = a.register(sampleSplit);
        vm.prank(treasury);
        vm.expectRevert(AmplopEnvelopes.TransferMismatch.selector);
        a.deposit(id, 1000e6, keccak256("p"));
    }

    function test_SEC_collectOnlyToSettlement() public {
        uint256 id = registerRaka();
        deposit(id, usd(1000, 0));
        bytes32 pid = buy(id, 5411, usd(20, 0));
        uint256 sBefore = token.balanceOf(settlement);
        uint256 cBefore = token.balanceOf(address(amplop));
        uint256 tBefore = token.balanceOf(treasury);
        vm.prank(cardService);
        amplop.collect(pid, usd(15, 0));
        assertEq(token.balanceOf(settlement), sBefore + usd(15, 0));
        assertEq(token.balanceOf(address(amplop)), cBefore - usd(15, 0));
        assertEq(token.balanceOf(treasury), tBefore);
        assertEq(token.balanceOf(cardService), 0);
        assertEq(token.balanceOf(raka), 0);
    }

    function test_SEC_serverKeysCannotTouchLockedOrUnreleased() public {
        uint256 id = registerRaka();
        link(id, raka, mama);
        deposit(id, usd(1000, 0));
        bytes32 pid = buy(id, 5942, usd(10, 0));
        EnvelopeView[5] memory before = views(id);

        address[2] memory keys = [treasury, cardService];
        bytes[] memory calls = new bytes[](16);
        calls[0] = abi.encodeCall(amplop.authorize, (id, keccak256("x1"), 5411, usd(10_000, 0)));
        calls[1] = abi.encodeCall(amplop.authorize, (id, keccak256("x2"), 7995, usd(1, 0)));
        calls[2] = abi.encodeCall(amplop.collect, (pid, usd(10, 0)));
        calls[3] = abi.encodeCall(amplop.refund, (pid, usd(10, 0)));
        calls[4] = abi.encodeCall(amplop.releaseHold, (pid));
        calls[5] = abi.encodeCall(amplop.approveEmergency, (id));
        calls[6] = abi.encodeCall(amplop.finalizeEmergency, (id));
        calls[7] = abi.encodeCall(amplop.finishLockOff, (id));
        calls[8] = abi.encodeCall(amplop.approveRecovery, (id, stranger));
        calls[9] = abi.encodeCall(amplop.finishRecovery, (id));
        calls[10] = abi.encodeCall(amplop.finishRemoveTrusted, (id));
        calls[11] = abi.encodeCall(amplop.movePurchase, (pid, Envelope.Food));
        calls[12] = abi.encodeCall(amplop.requestEmergency, (usd(10, 0), keccak256("r")));
        calls[13] = abi.encodeCall(amplop.startLockOff, ());
        calls[14] = abi.encodeCall(amplop.skipDays, (14));
        calls[15] = abi.encodeCall(amplop.cancelPending, (PendingKind.LockOff));
        for (uint256 k = 0; k < keys.length; ++k) {
            for (uint256 i = 0; i < calls.length; ++i) {
                vm.prank(keys[k]);
                (bool ok,) = address(amplop).call(calls[i]);
                ok; // outcome irrelevant; balances are checked below
            }
        }
        EnvelopeView[5] memory afterV = views(id);
        assertEq(afterV[4].locked, before[4].locked, "locked");
        for (uint256 e = 0; e < 4; ++e) {
            assertGe(afterV[e].unreleased, before[e].unreleased, "unreleased");
        }
    }

    function test_SEC_noEtherAccepted() public {
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        (bool ok,) = address(amplop).call{value: 1}("");
        assertFalse(ok);
        vm.prank(stranger);
        (ok,) = address(amplop).call{value: 1}(hex"12345678");
        assertFalse(ok);
        assertEq(address(amplop).balance, 0);
    }
}
