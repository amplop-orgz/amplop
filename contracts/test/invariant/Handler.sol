// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {
    AmplopEnvelopes,
    Envelope,
    PurchaseState,
    PendingKind,
    EmergencyStatus,
    EnvelopeView,
    AccountInfo,
    PurchaseInfo,
    EmergencyInfo
} from "../../src/AmplopEnvelopes.sol";
import {LoggingERC20} from "./LoggingERC20.sol";

/// @notice Drives bounded random calls into AmplopEnvelopes and keeps ghost records (S03-56).
contract Handler is Test {
    AmplopEnvelopes public immutable amplop;
    LoggingERC20 public immutable token;
    address public immutable treasury;
    address public immutable cardService;
    address public immutable settlement;
    uint256 public immutable settlementStart;

    address[] public people;
    bytes32[] public purchaseIds; // approved only
    bytes32[] public paymentIds; // deposited
    bytes32[] public declinedIds;
    mapping(uint256 accountId => uint256 pk) public invitePk;

    uint16[13] internal shopTypes = [5411, 5812, 5814, 4111, 4121, 5541, 5542, 5943, 7338, 8299, 7995, 5942, 1234];

    // ghosts
    uint256 public ghostCollected;
    uint256 public ghostRefunded;
    uint256 public lockedViolations; // invariant 2
    uint256 public purchaseViolations; // invariant 3
    uint256 public disallowedSuccesses; // invariant 5
    uint256 public clockViolations; // invariant 6
    uint256 public idReuseSuccesses; // XR ids
    uint256 internal _nonce;
    mapping(bytes32 => uint256) public calls;

    // invariant 2: which account may lower `locked` in the current call, and to what
    uint256 internal _okId;
    uint256 internal _okLocked;

    constructor(AmplopEnvelopes amplop_, LoggingERC20 token_, address treasury_, address card_, address settlement_) {
        amplop = amplop_;
        token = token_;
        treasury = treasury_;
        cardService = card_;
        settlement = settlement_;
        settlementStart = token_.balanceOf(settlement_);
        for (uint256 i = 0; i < 10; ++i) {
            people.push(makeAddr(string.concat("person", vm.toString(i))));
        }
    }

    // ------------------------------------------------------------ modifiers and pickers

    /// @dev Snapshots every account's locked balance and fails the ghost if any fell without permission.
    modifier trackLocked(bytes32 name) {
        calls[name]++;
        uint256 n = amplop.accountCount();
        uint256[] memory before = new uint256[](n + 1);
        for (uint256 i = 1; i <= n; ++i) {
            before[i] = _locked(i);
        }
        _okId = 0;
        _;
        for (uint256 i = 1; i <= n; ++i) {
            uint256 l = _locked(i);
            if (l < before[i] && !(i == _okId && l == _okLocked)) lockedViolations++;
        }
    }

    function _locked(uint256 id) internal view returns (uint256) {
        (EnvelopeView[5] memory v,) = amplop.envelopes(id);
        return v[4].locked;
    }

    function _person(uint256 seed) internal view returns (address) {
        return people[seed % people.length];
    }

    function _accountId(uint256 seed) internal view returns (uint256) {
        uint256 n = amplop.accountCount();
        return n == 0 ? 0 : 1 + seed % n;
    }

    function _owner(uint256 id) internal view returns (address) {
        return amplop.accountInfo(id).owner;
    }

    function _trusted(uint256 id) internal view returns (address) {
        return amplop.accountInfo(id).trusted;
    }

    function _split(uint256 seed) internal pure returns (uint8[5] memory s) {
        if (seed % 2 == 0) return [uint8(40), 15, 15, 20, 10]; // the sample split half the time
        seed /= 2;
        uint256 left = 20;
        for (uint256 i = 0; i < 4; ++i) {
            uint256 v = seed % (left + 1);
            seed /= 21;
            left -= v;
            s[i] = uint8(v * 5);
        }
        s[4] = uint8(left * 5);
    }

    function _purchase(uint256 seed) internal view returns (bytes32) {
        return purchaseIds.length == 0 ? bytes32(0) : purchaseIds[seed % purchaseIds.length];
    }

    // ------------------------------------------------------------ student writes

    function register(uint256 who, uint256 splitSeed) external trackLocked("register") {
        vm.prank(_person(who));
        try amplop.register(_split(splitSeed)) {} catch {}
    }

    function saveSplit(uint256 who, uint256 splitSeed) external trackLocked("saveSplit") {
        uint256 id = _accountId(who);
        if (id == 0) return;
        uint64 c = amplop.clock(id);
        bool wasDeposited = amplop.accountInfo(id).everDeposited;
        vm.prank(_owner(id));
        amplop.saveSplit(_split(splitSeed));
        if (wasDeposited) {
            (, uint64 readyAt,) = amplop.pending(id, PendingKind.Split);
            if (readyAt != c + amplop.WAIT()) clockViolations++;
        }
    }

    function createInvite(uint256 who) external trackLocked("createInvite") {
        uint256 id = _accountId(who);
        if (id == 0) return;
        uint64 c = amplop.clock(id);
        _newInvite(id);
        (, uint64 expiresAt,) = amplop.inviteOf(id);
        if (expiresAt != c + amplop.INVITE_LIFE()) clockViolations++;
    }

    function _newInvite(uint256 id) internal {
        uint256 pk = uint256(keccak256(abi.encode("invite", ++_nonce))) % 1e70 + 1;
        invitePk[id] = pk;
        vm.prank(_owner(id));
        amplop.createInvite(vm.addr(pk));
    }

    /// @dev Links some eligible person when the account has no trusted person, so trusted paths run.
    function _ensureTrusted(uint256 id, uint256 seed) internal {
        if (_trusted(id) != address(0)) return;
        _newInvite(id);
        for (uint256 i = 0; i < people.length; ++i) {
            address t = people[(seed + i) % people.length];
            if (t == _owner(id) || amplop.trustedAccountOf(t) != 0) continue;
            vm.prank(t);
            try amplop.acceptInvite(id, _sign(invitePk[id], id, t)) {} catch {}
            return;
        }
    }

    function acceptInvite(uint256 acct, uint256 who) external trackLocked("acceptInvite") {
        uint256 id = _accountId(acct);
        if (id == 0) return;
        if (invitePk[id] == 0) _newInvite(id);
        address t = _person(who);
        (, uint64 expiresAt,) = amplop.inviteOf(id);
        uint64 c = amplop.clock(id);
        vm.prank(t);
        try amplop.acceptInvite(id, _sign(invitePk[id], id, t)) {
            if (c >= expiresAt) clockViolations++;
        } catch {}
    }

    function removeTrusted(uint256 who) external trackLocked("removeTrusted") {
        uint256 id = _accountId(who);
        if (id == 0) return;
        uint64 c = amplop.clock(id);
        vm.prank(_owner(id));
        try amplop.removeTrusted() {
            _checkReady(id, PendingKind.TrustedRemoval, c);
        } catch {}
    }

    function movePurchase(uint256 pSeed, uint256 toSeed) external trackLocked("movePurchase") {
        bytes32 pid = _purchaseIn(pSeed, PurchaseState.Held);
        if (pid == 0) return;
        uint256 id = amplop.purchase(pid).accountId;
        if (amplop.purchase(pid).envelope != Envelope.Everyday || amplop.purchase(pid).moved) {
            pid = _buy(id, uint16(10_000 + pSeed % 50_000), 1 + pSeed % 5e6);
            if (pid == 0) return;
        }
        vm.prank(_owner(id));
        try amplop.movePurchase(pid, Envelope(toSeed % 3)) {} catch {}
    }

    function requestEmergency(uint256 who, uint256 amount) external trackLocked("requestEmergency") {
        uint256 id = _accountId(who);
        if (id == 0) return;
        uint256 l = _locked(id);
        if (l == 0) return;
        uint64 c = amplop.clock(id);
        vm.prank(_owner(id));
        try amplop.requestEmergency(bound(amount, 1, l), keccak256(abi.encode(amount))) {
            EmergencyInfo memory e = amplop.emergency(id);
            if (e.requestedAt != c || e.opensAt != c + amplop.WAIT()) clockViolations++;
        } catch {}
    }

    function cancelEmergency(uint256 who) external trackLocked("cancelEmergency") {
        uint256 id = _accountId(who);
        if (id == 0) return;
        vm.prank(_owner(id));
        try amplop.cancelEmergency() {} catch {}
    }

    function startLockOff(uint256 who) external trackLocked("startLockOff") {
        uint256 id = _accountId(who);
        if (id == 0) return;
        uint64 c = amplop.clock(id);
        vm.prank(_owner(id));
        try amplop.startLockOff() {
            _checkReady(id, PendingKind.LockOff, c);
        } catch {}
    }

    function cancelPending(uint256 who, uint256 kindSeed) external trackLocked("cancelPending") {
        uint256 id = _accountId(who);
        if (id == 0) return;
        PendingKind kind = PendingKind(kindSeed % 4);
        (bool active, uint64 readyAt, bytes32 data) = amplop.pending(id, kind);
        uint64 c = amplop.clock(id);
        // SA-03: a recovery whose new owner now owns an account stays cancellable after its wait.
        bool dead = kind == PendingKind.Recovery && amplop.accountOf(address(uint160(uint256(data)))) != 0;
        vm.prank(_owner(id));
        try amplop.cancelPending(kind) {
            if (!active || (c >= readyAt && !dead)) clockViolations++;
        } catch {}
    }

    function skipDays(uint256 who, uint256 numDays) external trackLocked("skipDays") {
        uint256 id = _accountId(who);
        if (id == 0) return;
        vm.prank(_owner(id));
        amplop.skipDays(uint16(bound(numDays, 1, 14)));
    }

    function warp(uint256 secs) external trackLocked("warp") {
        vm.warp(block.timestamp + bound(secs, 0, 9 days));
    }

    // ------------------------------------------------------------ trusted person writes

    function approveEmergency(uint256 acct) external trackLocked("approveEmergency") {
        uint256 id = _accountId(acct);
        if (id == 0) return;
        _ensureTrusted(id, acct);
        uint256 l = _locked(id);
        if (amplop.emergency(id).status != EmergencyStatus.Open && l > 0) {
            vm.prank(_owner(id));
            try amplop.requestEmergency(l / 2 + 1, keccak256("reason")) {} catch {}
        }
        EmergencyInfo memory e = amplop.emergency(id);
        vm.prank(_trusted(id));
        try amplop.approveEmergency(id, e.requestSeq) {
            _okId = id;
            _okLocked = l - e.amount;
        } catch {}
    }

    function approveRecovery(uint256 acct, uint256 who) external trackLocked("approveRecovery") {
        uint256 id = _accountId(acct);
        if (id == 0) return;
        _ensureTrusted(id, acct);
        uint64 c = amplop.clock(id);
        vm.prank(_trusted(id));
        try amplop.approveRecovery(id, _person(who)) {
            _checkReady(id, PendingKind.Recovery, c);
        } catch {}
    }

    // ------------------------------------------------------------ anyone after the wait

    function finishRemoveTrusted(uint256 acct) external trackLocked("finishRemoveTrusted") {
        uint256 id = _accountId(acct);
        if (id == 0) return;
        (bool active, uint64 readyAt,) = amplop.pending(id, PendingKind.TrustedRemoval);
        if (!active) {
            _ensureTrusted(id, acct);
            vm.prank(_owner(id));
            try amplop.removeTrusted() {} catch {}
            return;
        }
        uint64 c = amplop.clock(id);
        try amplop.finishRemoveTrusted(id) {
            if (!active || c < readyAt) clockViolations++;
        } catch {}
    }

    function finalizeEmergency(uint256 acct) external trackLocked("finalizeEmergency") {
        uint256 id = _accountId(acct);
        if (id == 0) return;
        EmergencyInfo memory e = amplop.emergency(id);
        uint256 l = _locked(id);
        uint64 c = amplop.clock(id);
        try amplop.finalizeEmergency(id) {
            if (c < e.opensAt) clockViolations++;
            _okId = id;
            _okLocked = l - e.amount;
        } catch {}
    }

    function finishLockOff(uint256 acct) external trackLocked("finishLockOff") {
        uint256 id = _accountId(acct);
        if (id == 0) return;
        (bool active, uint64 readyAt,) = amplop.pending(id, PendingKind.LockOff);
        if (!active) {
            vm.prank(_owner(id));
            try amplop.startLockOff() {} catch {}
            return;
        }
        uint64 c = amplop.clock(id);
        try amplop.finishLockOff(id) {
            if (!active || c < readyAt) clockViolations++;
            _okId = id;
            _okLocked = 0;
        } catch {}
    }

    function finishRecovery(uint256 acct) external trackLocked("finishRecovery") {
        uint256 id = _accountId(acct);
        if (id == 0) return;
        (bool active, uint64 readyAt, bytes32 data) = amplop.pending(id, PendingKind.Recovery);
        if (!active) {
            _ensureTrusted(id, acct);
            vm.prank(_trusted(id));
            try amplop.approveRecovery(id, _person(acct >> 8)) {} catch {}
            return;
        }
        uint64 c = amplop.clock(id);
        vm.prank(address(uint160(uint256(data)))); // SA-04: only the new owner finishes
        try amplop.finishRecovery(id) {
            if (!active || c < readyAt) clockViolations++;
        } catch {}
    }

    // ------------------------------------------------------------ treasury and card service

    function deposit(uint256 acct, uint256 amount, uint256 reuse) external trackLocked("deposit") {
        uint256 id = _accountId(acct);
        if (id == 0) return;
        amount = bound(amount, 1, 5000e6);
        if (reuse % 10 == 0 && paymentIds.length > 0) {
            vm.prank(treasury);
            try amplop.deposit(id, amount, paymentIds[reuse % paymentIds.length]) {
                idReuseSuccesses++;
            } catch {}
            return;
        }
        bytes32 pay = keccak256(abi.encode("pay", ++_nonce));
        vm.prank(treasury);
        amplop.deposit(id, amount, pay);
        paymentIds.push(pay);
    }

    function authorize(uint256 acct, uint256 shopSeed, uint256 amount, uint256 reuse)
        external
        trackLocked("authorize")
    {
        uint256 id = _accountId(acct);
        if (id == 0) return;
        uint16 shop = shopTypes[shopSeed % shopTypes.length];
        amount = bound(amount, 1, 120e6);
        if (reuse % 10 == 0 && purchaseIds.length + declinedIds.length > 0) {
            bytes32 old = reuse % 2 == 0 && purchaseIds.length > 0
                ? purchaseIds[reuse % purchaseIds.length]
                : (declinedIds.length > 0 ? declinedIds[reuse % declinedIds.length] : purchaseIds[0]);
            vm.prank(cardService);
            try amplop.authorize(id, old, shop, amount) {
                idReuseSuccesses++;
            } catch {}
            return;
        }
        _buy(id, shop, amount);
    }

    /// @dev Authorises a fresh purchase and checks invariant 3; returns the id if approved, else 0.
    function _buy(uint256 id, uint16 shop, uint256 amount) internal returns (bytes32) {
        bytes32 pid = keccak256(abi.encode("buy", ++_nonce));
        (EnvelopeView[5] memory before,) = amplop.envelopes(id);
        vm.prank(cardService);
        amplop.authorize(id, pid, shop, amount);
        (EnvelopeView[5] memory afterV,) = amplop.envelopes(id);
        PurchaseInfo memory p = amplop.purchase(pid);
        if (p.state == PurchaseState.Held) {
            purchaseIds.push(pid);
            for (uint256 e = 0; e < 5; ++e) {
                uint256 want = e == uint8(p.envelope) ? before[e].available - amount : before[e].available;
                if (afterV[e].available != want) purchaseViolations++;
            }
            return pid;
        }
        declinedIds.push(pid);
        for (uint256 e = 0; e < 5; ++e) {
            if (afterV[e].available != before[e].available) purchaseViolations++;
        }
        return 0;
    }

    /// @dev A purchase in `state`, buying a small Everyday one when the random pick does not fit.
    function _purchaseIn(uint256 seed, PurchaseState state) internal returns (bytes32 pid) {
        pid = _purchase(seed);
        if (pid != 0 && amplop.purchase(pid).state == state) return pid;
        uint256 id = _accountId(seed);
        if (id == 0) return 0;
        pid = _buy(id, uint16(10_000 + seed % 50_000), 1 + seed % 5e6);
        if (pid == 0 || state == PurchaseState.Held) return pid;
        uint256 h = amplop.purchase(pid).held;
        vm.prank(cardService);
        amplop.collect(pid, h);
        ghostCollected += h;
    }

    function collect(uint256 pSeed, uint256 amount) external trackLocked("collect") {
        bytes32 pid = _purchaseIn(pSeed, PurchaseState.Held);
        if (pid == 0) return;
        PurchaseInfo memory p = amplop.purchase(pid);
        if (p.held == 0) return;
        amount = bound(amount, 1, p.held);
        uint64 c = amplop.clock(p.accountId);
        vm.prank(cardService);
        try amplop.collect(pid, amount) {
            ghostCollected += amount;
            if (c >= p.createdAt + amplop.HOLD_PERIOD()) clockViolations++;
        } catch {}
    }

    function releaseHold(uint256 pSeed, bool byService) external trackLocked("releaseHold") {
        bytes32 pid = _purchaseIn(pSeed, PurchaseState.Held);
        if (pid == 0) return;
        PurchaseInfo memory p = amplop.purchase(pid);
        uint64 c = amplop.clock(p.accountId);
        vm.prank(byService ? cardService : people[0]);
        try amplop.releaseHold(pid) {
            if (!byService && c < p.createdAt + amplop.HOLD_PERIOD()) clockViolations++;
        } catch {}
    }

    function refund(uint256 pSeed, uint256 amount) external trackLocked("refund") {
        bytes32 pid = _purchaseIn(pSeed, PurchaseState.Collected);
        if (pid == 0) return;
        PurchaseInfo memory p = amplop.purchase(pid);
        uint256 left = p.collected - p.refunded;
        if (left == 0) return;
        amount = bound(amount, 1, left);
        vm.prank(cardService);
        try amplop.refund(pid, amount) {
            ghostRefunded += amount;
        } catch {}
    }

    // ------------------------------------------------------------ disallowed callers (invariant 5)

    function disallowed(uint256 fn, uint256 acct, uint256 who) external trackLocked("disallowed") {
        uint256 id = _accountId(acct);
        if (id == 0) return;
        address caller = _person(who);
        if (caller == treasury || caller == cardService) return;
        bool isTrusted = caller == _trusted(id);
        bytes32 pid = _purchase(who);
        fn = fn % 6;
        vm.startPrank(caller);
        if (fn == 0) {
            try amplop.deposit(id, 1e6, keccak256(abi.encode("bad", ++_nonce))) {
                disallowedSuccesses++;
            } catch {}
        } else if (fn == 1) {
            try amplop.authorize(id, keccak256(abi.encode("badbuy", ++_nonce)), 5411, 1) {
                disallowedSuccesses++;
            } catch {}
        } else if (fn == 2 && pid != 0) {
            try amplop.collect(pid, 1) {
                disallowedSuccesses++;
            } catch {}
        } else if (fn == 3 && pid != 0) {
            try amplop.refund(pid, 1) {
                disallowedSuccesses++;
            } catch {}
        } else if (fn == 4 && !isTrusted) {
            try amplop.approveEmergency(id, amplop.emergency(id).requestSeq) {
                disallowedSuccesses++;
            } catch {}
        } else if (fn == 5 && !isTrusted) {
            try amplop.approveRecovery(id, people[(who + 1) % people.length]) {
                disallowedSuccesses++;
            } catch {}
        }
        vm.stopPrank();
    }

    // ------------------------------------------------------------ helpers

    function _checkReady(uint256 id, PendingKind kind, uint64 c) internal {
        (bool active, uint64 readyAt,) = amplop.pending(id, kind);
        if (!active || readyAt != c + amplop.WAIT()) clockViolations++;
    }

    function _sign(uint256 pk, uint256 accountId, address trusted) internal view returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AmplopEnvelopes"),
                keccak256("1"),
                block.chainid,
                address(amplop)
            )
        );
        bytes32 structHash =
            keccak256(abi.encode(keccak256("AcceptInvite(uint256 accountId,address trusted)"), accountId, trusted));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        return abi.encodePacked(r, s, v);
    }

    function paymentIdsLength() external view returns (uint256) {
        return paymentIds.length;
    }

    function purchaseIdsLength() external view returns (uint256) {
        return purchaseIds.length;
    }

    function declinedIdsLength() external view returns (uint256) {
        return declinedIds.length;
    }
}
