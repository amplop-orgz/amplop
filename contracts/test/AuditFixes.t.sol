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
}
