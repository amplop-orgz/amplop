// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../AmplopBase.t.sol";

/// @notice Input checks that no rule test reaches (S03-53 error table).
contract InputChecksTest is AmplopBase {
    uint256 internal id;

    function setUp() public override {
        super.setUp();
        id = registerRaka();
    }

    function test_INPUT_accountIdZeroAndUnknown() public {
        vm.expectRevert(abi.encodeWithSelector(AmplopEnvelopes.AccountNotFound.selector, 0));
        amplop.finalizeEmergency(0);
        vm.expectRevert(abi.encodeWithSelector(AmplopEnvelopes.AccountNotFound.selector, 2));
        amplop.finalizeEmergency(2);
    }

    function test_INPUT_depositChecks() public {
        vm.startPrank(treasury);
        vm.expectRevert(AmplopEnvelopes.AmountZero.selector);
        amplop.deposit(id, 0, bytes32(uint256(1)));
        vm.expectRevert(AmplopEnvelopes.AmountTooLarge.selector);
        amplop.deposit(id, uint256(type(uint128).max) + 1, bytes32(uint256(1)));
        vm.expectRevert(AmplopEnvelopes.InvalidId.selector);
        amplop.deposit(id, 1, bytes32(0));
        vm.stopPrank();
    }

    function test_INPUT_authorizeChecks() public {
        vm.startPrank(cardService);
        vm.expectRevert(AmplopEnvelopes.InvalidId.selector);
        amplop.authorize(id, bytes32(0), 5411, 1);
        vm.expectRevert(AmplopEnvelopes.AmountZero.selector);
        amplop.authorize(id, bytes32(uint256(1)), 5411, 0);
        vm.expectRevert(AmplopEnvelopes.AmountTooLarge.selector);
        amplop.authorize(id, bytes32(uint256(1)), 5411, uint256(type(uint128).max) + 1);
        vm.stopPrank();
        assertFalse(amplop.purchaseUsed(bytes32(uint256(1))), "failed checks burn no id");
    }

    function test_INPUT_collectAndRefundZero() public {
        deposit(id, usd(1000, 0));
        bytes32 pid = buy(id, 5411, usd(10, 0));
        vm.startPrank(cardService);
        vm.expectRevert(AmplopEnvelopes.AmountZero.selector);
        amplop.collect(pid, 0);
        vm.expectRevert(AmplopEnvelopes.NotCollected.selector);
        amplop.refund(pid, 1);
        amplop.collect(pid, usd(10, 0));
        vm.expectRevert(AmplopEnvelopes.AmountZero.selector);
        amplop.refund(pid, 0);
        amplop.refund(pid, usd(4, 0));
        amplop.refund(pid, usd(1, 0)); // a second partial refund on a Refunded purchase
        vm.stopPrank();
        assertEq(amplop.purchase(pid).refunded, usd(5, 0));
    }

    function test_INPUT_zeroAddresses() public {
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.ZeroAddress.selector);
        amplop.createInvite(address(0));
        link(id, raka, mama);
        vm.prank(mama);
        vm.expectRevert(AmplopEnvelopes.ZeroAddress.selector);
        amplop.approveRecovery(id, address(0));
    }

    function test_INPUT_acceptWithoutInvite() public {
        vm.prank(mama);
        vm.expectRevert(AmplopEnvelopes.NoInvite.selector);
        amplop.acceptInvite(id, "");
    }

    function test_INPUT_moveTargetAndNothingToMove() public {
        deposit(id, usd(1000, 0));
        bytes32 pid = buy(id, 7832, usd(10, 0)); // cinema pays from Everyday
        vm.startPrank(raka);
        vm.expectRevert(AmplopEnvelopes.InvalidTarget.selector);
        amplop.movePurchase(pid, Envelope.Emergency);
        vm.expectRevert(AmplopEnvelopes.InvalidTarget.selector);
        amplop.movePurchase(pid, Envelope.Everyday);
        vm.stopPrank();

        vm.prank(cardService);
        amplop.releaseHold(pid);
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.NothingToMove.selector); // released: nothing left
        amplop.movePurchase(pid, Envelope.Food);

        bytes32 pid2 = buy(id, 7832, usd(10, 0));
        vm.startPrank(cardService);
        amplop.collect(pid2, usd(10, 0));
        amplop.refund(pid2, usd(10, 0));
        vm.stopPrank();
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.NothingToMove.selector); // fully refunded
        amplop.movePurchase(pid2, Envelope.Food);

        bytes32 pid3 = buy(id, 7832, usd(10, 0));
        vm.startPrank(cardService);
        amplop.collect(pid3, usd(10, 0));
        amplop.refund(pid3, usd(3, 0));
        vm.stopPrank();
        uint256 foodBefore = available(id, Envelope.Food);
        vm.prank(raka);
        amplop.movePurchase(pid3, Envelope.Food); // collected minus refunded moves
        assertEq(available(id, Envelope.Food), foodBefore - usd(7, 0));
    }
}
