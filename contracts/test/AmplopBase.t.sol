// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    AmplopEnvelopes,
    Envelope,
    PurchaseState,
    DeclineReason,
    PendingKind,
    EmergencyStatus,
    OpenedBy,
    EnvelopeView,
    AccountInfo,
    PurchaseInfo,
    ScheduleView,
    EmergencyInfo
} from "../src/AmplopEnvelopes.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice Shared set-up and helpers for every contract test (S03-54).
abstract contract AmplopBase is Test {
    uint256 internal constant DAY = 86_400;
    // Wed 14 Oct 2026 10:00 UTC: day 20740, Monday number 2963.
    uint256 internal constant START = 1_791_936_000 + 10 hours;

    AmplopEnvelopes internal amplop;
    MockERC20 internal token;
    uint8 internal dec;

    address internal treasury = makeAddr("treasury");
    address internal cardService = makeAddr("cardService");
    address internal settlement = makeAddr("settlement");
    address internal raka = makeAddr("raka");
    address internal mama = makeAddr("mama");
    address internal dewi = makeAddr("dewi");
    address internal budi = makeAddr("budi");
    address internal stranger = makeAddr("stranger");

    uint256 internal inviteKeyPk = 0xA11CE;
    address internal inviteKey;

    uint8[5] internal sampleSplit = [40, 15, 15, 20, 10];

    function setUp() public virtual {
        vm.warp(START);
        dec = tokenDecimals();
        token = new MockERC20("AUSD test stand-in", "AUSD", dec);
        amplop = _deploy(true);
        inviteKey = vm.addr(inviteKeyPk);
    }

    /// @dev Decimals18.t.sol overrides this to re-run suites at 18 decimals.
    function tokenDecimals() internal pure virtual returns (uint8) {
        return 6;
    }

    function _deploy(bool demo) internal returns (AmplopEnvelopes a) {
        a = new AmplopEnvelopes(IERC20(address(token)), settlement, treasury, cardService, demo);
        token.mint(treasury, 10_000_000 * 10 ** dec);
        token.mint(settlement, 100_000 * 10 ** dec);
        vm.prank(treasury);
        token.approve(address(a), type(uint256).max);
        vm.prank(settlement);
        token.approve(address(a), type(uint256).max);
    }

    // ------------------------------------------------------------ amounts and time

    function usd(uint256 dollars, uint256 cents) internal view returns (uint256) {
        return dollars * 10 ** dec + cents * 10 ** dec / 100;
    }

    function warpTo(uint256 dayNumber, uint256 secondsIntoDay) internal {
        vm.warp(dayNumber * DAY + secondsIntoDay);
    }

    function today(uint256 id) internal view returns (uint256) {
        return amplop.clock(id) / DAY;
    }

    function mondayNumber(uint256 day) internal pure returns (uint256) {
        return (day + 3) / 7;
    }

    function mondayDay(uint256 m) internal pure returns (uint256) {
        return 7 * m - 3;
    }

    /// @dev Warps block time to the next Monday 00:00 on this account's clock.
    function skipToNextMonday(uint256 id) internal {
        uint256 c = amplop.clock(id);
        uint256 target = mondayDay(mondayNumber(c / DAY) + 1) * DAY;
        vm.warp(block.timestamp + (target - c));
    }

    // ------------------------------------------------------------ actions

    function register(address who, uint8[5] memory split) internal returns (uint256 id) {
        vm.prank(who);
        id = amplop.register(split);
    }

    function registerRaka() internal returns (uint256) {
        return register(raka, sampleSplit);
    }

    uint256 private _payNonce;

    function deposit(uint256 id, uint256 amount) internal returns (bytes32 paymentId) {
        paymentId = keccak256(abi.encode("pay", ++_payNonce));
        vm.prank(treasury);
        amplop.deposit(id, amount, paymentId);
    }

    uint256 private _buyNonce;

    function nextPurchaseId() internal returns (bytes32) {
        return keccak256(abi.encode("buy", ++_buyNonce));
    }

    function buy(uint256 id, uint16 shopType, uint256 amount) internal returns (bytes32 pid) {
        pid = nextPurchaseId();
        vm.prank(cardService);
        amplop.authorize(id, pid, shopType, amount);
    }

    function signInvite(uint256 pk, uint256 accountId, address trusted) internal view returns (bytes memory) {
        return signInviteFor(pk, accountId, trusted, block.chainid, address(amplop));
    }

    function signInviteFor(uint256 pk, uint256 accountId, address trusted, uint256 chainId, address verifying)
        internal
        pure
        returns (bytes memory)
    {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AmplopEnvelopes"),
                keccak256("1"),
                chainId,
                verifying
            )
        );
        bytes32 structHash =
            keccak256(abi.encode(keccak256("AcceptInvite(uint256 accountId,address trusted)"), accountId, trusted));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Raka invites with `inviteKey`; `who` accepts.
    function link(uint256 id, address owner, address who) internal {
        vm.prank(owner);
        amplop.createInvite(inviteKey);
        bytes memory sig = signInvite(inviteKeyPk, id, who);
        vm.prank(who);
        amplop.acceptInvite(id, sig);
    }

    // ------------------------------------------------------------ reads

    function views(uint256 id) internal view returns (EnvelopeView[5] memory list) {
        (list,) = amplop.envelopes(id);
    }

    function available(uint256 id, Envelope e) internal view returns (uint256) {
        return views(id)[uint8(e)].available;
    }

    function unreleased(uint256 id, Envelope e) internal view returns (uint256) {
        return views(id)[uint8(e)].unreleased;
    }

    function locked(uint256 id) internal view returns (uint256) {
        return views(id)[4].locked;
    }

    function nextRelease(uint256 id) internal view returns (uint64 d) {
        (, d) = amplop.envelopes(id);
    }

    function assertViewsEq(EnvelopeView[5] memory a, EnvelopeView[5] memory b) internal pure {
        for (uint256 i = 0; i < 5; ++i) {
            assertEq(a[i].available, b[i].available, "available");
            assertEq(a[i].unreleased, b[i].unreleased, "unreleased");
            assertEq(a[i].held, b[i].held, "held");
            assertEq(a[i].locked, b[i].locked, "locked");
        }
    }
}
