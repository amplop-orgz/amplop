// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @notice The five envelopes, in the order used everywhere.
enum Envelope {
    Food,
    Transport,
    Study,
    Everyday,
    Emergency
}

/// @notice Lifecycle of an approved card purchase.
enum PurchaseState {
    None,
    Held,
    Collected,
    Released,
    Refunded
}

/// @notice Why a card purchase was declined.
enum DeclineReason {
    None,
    Blocked,
    NotEnough
}

/// @notice Changes that wait 48 hours before they take effect.
enum PendingKind {
    Split,
    TrustedRemoval,
    LockOff,
    Recovery
}

/// @notice State of the account's latest Emergency request.
enum EmergencyStatus {
    None,
    Open,
    Opened,
    Cancelled
}

/// @notice How an Emergency request was opened.
enum OpenedBy {
    Approval,
    Time
}

/// @notice One envelope's balances as shown on screen.
struct EnvelopeView {
    uint256 available;
    uint256 unreleased;
    uint256 held;
    uint256 locked;
}

/// @notice Everything about an account except its balances.
struct AccountInfo {
    address owner;
    address trusted;
    uint8[5] split;
    uint8[5] pendingSplit;
    uint64 pendingSplitStartsAt;
    bool lockOn;
    bool everDeposited;
    uint64 requestSeq;
    uint64 skipSeconds;
}

/// @notice One approved card purchase.
struct PurchaseInfo {
    uint256 accountId;
    Envelope envelope;
    uint256 amount;
    uint256 held;
    uint256 collected;
    uint256 refunded;
    uint16 shopType;
    uint64 createdAt;
    PurchaseState state;
    bool moved;
    bool everydayStepIn;
}

/// @notice One release schedule record (allowances that started in the same week).
struct ScheduleView {
    uint64 startMonday;
    uint8 sharesOut;
    uint256[4] base;
    uint256[4] part;
}

/// @notice The account's latest Emergency request.
struct EmergencyInfo {
    EmergencyStatus status;
    uint64 requestSeq;
    uint256 amount;
    bytes32 reasonHash;
    uint64 requestedAt;
    uint64 opensAt;
}

/// @author Amplop
/// @title AmplopEnvelopes
/// @notice Holds every AUSD unit of every student and enforces rules R1 to R24 of the Amplop PRD.
/// @dev Balances are computed on read from monotonic counters and at most three live schedule records,
/// so no weekly transaction is needed. There is no owner, admin, pause or upgrade path.
contract AmplopEnvelopes is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    // ---------------------------------------------------------------- constants

    /// @notice Wait before an Emergency opens by time or a pending change can finish (R17, R20 to R23).
    uint64 public constant WAIT = 48 hours;
    /// @notice How long a card hold can be collected (R13).
    uint64 public constant HOLD_PERIOD = 7 days;
    /// @notice How long after a purchase it can be moved (R15).
    uint64 public constant MOVE_PERIOD = 7 days;
    /// @notice How long an invite stays valid (R22).
    uint64 public constant INVITE_LIFE = 7 days;
    /// @notice Storage capacity for schedule records; at most three are ever live (S03-10).
    uint8 public constant MAX_SCHEDULES = 6;
    /// @notice Largest demo skip per call.
    uint16 public constant MAX_SKIP_DAYS_PER_CALL = 14;

    bytes32 private constant ACCEPT_INVITE_TYPEHASH = keccak256("AcceptInvite(uint256 accountId,address trusted)");
    uint8 private constant RULE_BLOCKED = 255;
    uint8 private constant EVERYDAY = 3;
    uint256 private constant WEEKLY = 4;

    // ---------------------------------------------------------------- storage

    struct Schedule {
        uint64 startMonday;
        uint128[4] base;
        uint128[4] part;
    }

    struct EmergencyRec {
        EmergencyStatus status;
        uint64 requestSeq;
        uint64 requestedAt;
        uint64 opensAt;
        uint256 amount;
        bytes32 reasonHash;
    }

    struct Invite {
        address key;
        uint64 expiresAt;
        bool used;
    }

    struct Pending {
        bool active;
        uint64 readyAt;
        bytes32 data;
    }

    struct Account {
        address owner;
        bool lockOn;
        bool everDeposited;
        uint8 scheduleCount;
        uint64 skipSeconds;
        address trusted;
        uint64 requestSeq;
        uint8[5] split;
        uint256 locked;
        uint256[4] inAmt;
        uint256[4] outAmt;
        uint256[4] held;
        Schedule[6] schedules;
        EmergencyRec em;
        Invite invite;
        Pending[4] pendings;
        mapping(uint16 shopType => uint8 rule) overrideOf;
    }

    struct Purchase {
        uint64 accountId;
        uint64 createdAt;
        uint16 shopType;
        uint8 envelope;
        PurchaseState state;
        bool moved;
        bool everydayStepIn;
        uint128 amount;
        uint128 held;
        uint128 collected;
        uint128 refunded;
    }

    /// @notice The token every envelope holds (AUSD).
    IERC20 public immutable token;
    /// @notice The only address collected card money is ever sent to, and refunds come from.
    address public immutable settlement;
    /// @notice The only address that can deposit (R3).
    address public immutable treasury;
    /// @notice The only address that can authorise, collect and refund card purchases (R3).
    address public immutable cardService;
    /// @notice Whether `skipDays` works on this deployment. Fixed at deploy.
    bool public immutable demoMode;
    /// @notice `token.decimals()` read at deploy. No contract formula depends on it.
    uint8 public immutable tokenDecimals;

    /// @notice Number of accounts created. Ids run from 1 to `accountCount`.
    uint256 public accountCount;
    /// @notice Account owned by an address, 0 = none.
    mapping(address owner => uint256 accountId) public accountOf;
    /// @notice Account an address is the trusted person of, 0 = none.
    mapping(address trusted => uint256 accountId) public trustedAccountOf;
    /// @notice Account with a pending recovery to this new owner, 0 = none.
    mapping(address newOwner => uint256 accountId) public recoveryAccountOf;
    /// @notice Whether an address was ever used as an invite key (SA-06).
    mapping(address inviteKey => bool used) public inviteKeyUsed;
    /// @notice Whether a deposit payment id was used.
    mapping(bytes32 paymentId => bool used) public paymentUsed;
    /// @notice Whether a purchase id reached the chain (approved or declined).
    mapping(bytes32 purchaseId => bool used) public purchaseUsed;

    mapping(uint256 accountId => Account) private _accounts;
    mapping(bytes32 purchaseId => Purchase) private _purchases;
    mapping(uint16 shopType => uint8 rule) private _defaultRule;

    // ---------------------------------------------------------------- events

    /// @notice A student created an account (R1).
    /// @param accountId New account id.
    /// @param owner The student's address.
    /// @param split The split in force.
    event AccountCreated(uint256 indexed accountId, address indexed owner, uint8[5] split);
    /// @notice A split was saved (R21).
    /// @param accountId Account.
    /// @param split The saved split.
    /// @param startsAt Account-clock time it applies from.
    /// @param immediate True when it applied at once (no allowance yet).
    event SplitSaved(uint256 indexed accountId, uint8[5] split, uint64 startsAt, bool immediate);
    /// @notice An invite was created, replacing any earlier one (R22).
    /// @param accountId Account.
    /// @param inviteKey Address whose key signs the acceptance.
    /// @param expiresAt Account-clock expiry.
    event InviteCreated(uint256 indexed accountId, address inviteKey, uint64 expiresAt);
    /// @notice A trusted person linked (R2, R22).
    /// @param accountId Account.
    /// @param trusted The trusted person.
    event TrustedLinked(uint256 indexed accountId, address indexed trusted);
    /// @notice The student started removing the trusted person (R22).
    /// @param accountId Account.
    /// @param trusted The trusted person being removed.
    /// @param readyAt Account-clock time the removal can finish.
    event TrustedRemovalStarted(uint256 indexed accountId, address indexed trusted, uint64 readyAt);
    /// @notice The trusted person was removed after the wait.
    /// @param accountId Account.
    /// @param trusted The removed trusted person.
    event TrustedRemoved(uint256 indexed accountId, address indexed trusted);
    /// @notice An allowance arrived (R4 to R8).
    /// @param accountId Account.
    /// @param paymentId Single-use payment id.
    /// @param amount Token units.
    /// @param parts Split result per envelope.
    /// @param startDay Account-clock day number of arrival.
    event Deposited(
        uint256 indexed accountId, bytes32 indexed paymentId, uint256 amount, uint256[5] parts, uint64 startDay
    );
    /// @notice A card purchase was approved and held (R9, R10).
    /// @param accountId Account.
    /// @param purchaseId Purchase id.
    /// @param envelope Envelope that paid.
    /// @param amount Token units held.
    /// @param shopType Merchant category code.
    /// @param everydayStepIn True when Everyday paid for another envelope.
    event PurchaseApproved(
        uint256 indexed accountId,
        bytes32 indexed purchaseId,
        Envelope envelope,
        uint256 amount,
        uint16 shopType,
        bool everydayStepIn
    );
    /// @notice A card purchase was declined (R10, R12).
    /// @param accountId Account.
    /// @param purchaseId Purchase id (burned).
    /// @param amount Token units asked.
    /// @param shopType Merchant category code.
    /// @param reason Why.
    event PurchaseDeclined(
        uint256 indexed accountId, bytes32 indexed purchaseId, uint256 amount, uint16 shopType, DeclineReason reason
    );
    /// @notice A hold was collected to settlement (R13).
    /// @param accountId Account.
    /// @param purchaseId Purchase id.
    /// @param amount Token units sent to settlement.
    /// @param returned Token units returned to the envelope.
    event PurchaseCollected(uint256 indexed accountId, bytes32 indexed purchaseId, uint256 amount, uint256 returned);
    /// @notice A hold was released back to its envelope (R13).
    /// @param accountId Account.
    /// @param purchaseId Purchase id.
    /// @param amount Token units returned.
    event HoldReleased(uint256 indexed accountId, bytes32 indexed purchaseId, uint256 amount);
    /// @notice Money was refunded from settlement to the paying envelope (R13).
    /// @param accountId Account.
    /// @param purchaseId Purchase id.
    /// @param amount Token units refunded.
    event PurchaseRefunded(uint256 indexed accountId, bytes32 indexed purchaseId, uint256 amount);
    /// @notice A purchase moved out of Everyday (R15).
    /// @param accountId Account.
    /// @param purchaseId Purchase id.
    /// @param from Always Everyday.
    /// @param to Target envelope.
    /// @param shopType Shop type now overridden for this account.
    event PurchaseMoved(
        uint256 indexed accountId, bytes32 indexed purchaseId, Envelope from, Envelope to, uint16 shopType
    );
    /// @notice The student asked to open Emergency money (R16).
    /// @param accountId Account.
    /// @param requestSeq Request number.
    /// @param amount Token units asked.
    /// @param reasonHash keccak256 of the reason text.
    /// @param opensAt Account-clock time it opens without approval.
    event EmergencyRequested(
        uint256 indexed accountId, uint64 requestSeq, uint256 amount, bytes32 reasonHash, uint64 opensAt
    );
    /// @notice Emergency money moved to Everyday (R17, R18).
    /// @param accountId Account.
    /// @param requestSeq Request number.
    /// @param amount Token units opened.
    /// @param openedBy Approval or time.
    event EmergencyOpened(uint256 indexed accountId, uint64 requestSeq, uint256 amount, OpenedBy openedBy);
    /// @notice The student cancelled an open request (R16).
    /// @param accountId Account.
    /// @param requestSeq Request number.
    event EmergencyCancelled(uint256 indexed accountId, uint64 requestSeq);
    /// @notice The student started turning the Emergency lock off (R20).
    /// @param accountId Account.
    /// @param readyAt Account-clock time it can finish.
    event LockOffStarted(uint256 indexed accountId, uint64 readyAt);
    /// @notice The Emergency lock is off and the locked balance moved to Everyday (R20).
    /// @param accountId Account.
    /// @param moved Token units moved.
    event LockOffDone(uint256 indexed accountId, uint256 moved);
    /// @notice The trusted person approved a recovery to a new owner (R23).
    /// @param accountId Account.
    /// @param newOwner New owner address.
    /// @param readyAt Account-clock time it can finish.
    event RecoveryApproved(uint256 indexed accountId, address indexed newOwner, uint64 readyAt);
    /// @notice The account moved to its new owner (R23).
    /// @param accountId Account.
    /// @param oldOwner Previous owner.
    /// @param newOwner New owner.
    event RecoveryDone(uint256 indexed accountId, address indexed oldOwner, address indexed newOwner);
    /// @notice The student cancelled a pending change (R24).
    /// @param accountId Account.
    /// @param kind Which change.
    event PendingCancelled(uint256 indexed accountId, PendingKind kind);
    /// @notice Demo only: the account clock moved forward.
    /// @param accountId Account.
    /// @param numDays Days skipped by this call.
    /// @param skipSeconds Total skipped seconds for the account.
    event DaysSkipped(uint256 indexed accountId, uint16 numDays, uint64 skipSeconds);

    // ---------------------------------------------------------------- errors

    /// @notice An address argument is zero.
    error ZeroAddress();
    /// @notice The token's `decimals()` reverted.
    error TokenDecimalsUnreadable();
    /// @notice The caller already owns an account (R1).
    error AlreadyHasAccount();
    /// @notice The caller owns no account.
    error NoAccount();
    /// @notice The account id does not exist.
    /// @param accountId The id asked for.
    error AccountNotFound(uint256 accountId);
    /// @notice The purchase belongs to another account.
    error NotOwner();
    /// @notice The caller is not this account's trusted person.
    error NotTrusted();
    /// @notice Only the treasury can deposit (R3).
    error NotTreasury();
    /// @notice Only the card service can do this (R3).
    error NotCardService();
    /// @notice The split is not five multiples of 5 summing to 100 (R4).
    error InvalidSplit();
    /// @notice The amount is zero.
    error AmountZero();
    /// @notice The amount does not fit 128 bits.
    error AmountTooLarge();
    /// @notice A payment or purchase id is zero.
    error InvalidId();
    /// @notice The payment id was already deposited.
    /// @param paymentId The id.
    error PaymentAlreadyUsed(bytes32 paymentId);
    /// @notice No free schedule slot (unreachable).
    error TooManySchedules();
    /// @notice The contract balance did not change by exactly the amount.
    error TransferMismatch();
    /// @notice The purchase id was already authorised.
    /// @param purchaseId The id.
    error PurchaseIdUsed(bytes32 purchaseId);
    /// @notice No approved purchase with this id.
    /// @param purchaseId The id.
    error PurchaseNotFound(bytes32 purchaseId);
    /// @notice The purchase is not held.
    error NotHeld();
    /// @notice Collect amount above the hold.
    error AmountAboveHeld();
    /// @notice The hold period is over; only release works (R13).
    error HoldExpired();
    /// @notice The hold period is not over.
    error HoldNotExpired();
    /// @notice The purchase was never collected.
    error NotCollected();
    /// @notice Refunds would exceed the collected amount.
    error RefundTooLarge();
    /// @notice A purchase can only move to Food, Transport or Study (R15).
    error InvalidTarget();
    /// @notice A purchase can move once (R15).
    error AlreadyMoved();
    /// @notice Only Everyday purchases can move (R15).
    error NotFromEveryday();
    /// @notice The seven-day move window is over (R15).
    error MovePeriodOver();
    /// @notice Nothing left to move.
    error NothingToMove();
    /// @notice The target envelope cannot cover the move.
    error TargetShort();
    /// @notice An Emergency request is already open.
    error RequestAlreadyOpen();
    /// @notice No open Emergency request.
    error NoOpenRequest();
    /// @notice The open request is not the one being approved (SA-01).
    error RequestChanged();
    /// @notice The request is above the locked balance (R16).
    error AmountAboveLocked();
    /// @notice A reason is required (PRD 14 rule 6).
    error ReasonRequired();
    /// @notice Lock-off is pending; cancel it first.
    error LockOffPending();
    /// @notice The lock is already off.
    error LockAlreadyOff();
    /// @notice The wait is not over.
    /// @param readyAt Account-clock time it will be.
    error WaitNotOver(uint64 readyAt);
    /// @notice The wait is over; the change can no longer be cancelled.
    error WaitOver();
    /// @notice Nothing of this kind is pending.
    error NothingPending();
    /// @notice No invite exists.
    error NoInvite();
    /// @notice The invite was used.
    error InviteUsed();
    /// @notice The invite expired.
    error InviteExpired();
    /// @notice The invite signature is not valid for this caller.
    error BadSignature();
    /// @notice An owner cannot be their own trusted person.
    error CannotTrustSelf();
    /// @notice The caller is already the trusted person of an account.
    error AlreadyTrusted();
    /// @notice The account already has a trusted person.
    error TrustedAlreadyLinked();
    /// @notice The account has no trusted person.
    error NoTrustedPerson();
    /// @notice A trusted-person removal is pending.
    error TrustedRemovalPending();
    /// @notice A recovery past its wait is pending; only the new owner can finish it.
    error RecoveryPending();
    /// @notice Only the new owner can finish a recovery (SA-04).
    error NotNewOwner();
    /// @notice This address was used as an invite key before (SA-06).
    error InviteKeyReused();
    /// @notice The new owner already owns an account.
    error NewOwnerHasAccount();
    /// @notice The new owner is this account's trusted person.
    error NewOwnerIsTrusted();
    /// @notice Another account already waits to move to this new owner.
    error RecoveryTargetBusy();
    /// @notice Demo tools are off on this deployment.
    error DemoOff();
    /// @notice Days must be 1 to 14.
    error InvalidDays();

    // ---------------------------------------------------------------- constructor

    /// @notice Deploys the contract with its fixed roles.
    /// @param token_ The token (AUSD).
    /// @param settlement_ Where collected money goes and refunds come from.
    /// @param treasury_ The only depositor.
    /// @param cardService_ The only card caller.
    /// @param demoMode_ Whether `skipDays` works.
    constructor(IERC20 token_, address settlement_, address treasury_, address cardService_, bool demoMode_)
        EIP712("AmplopEnvelopes", "1")
    {
        if (
            address(token_) == address(0) || settlement_ == address(0) || treasury_ == address(0)
                || cardService_ == address(0)
        ) revert ZeroAddress();
        uint8 dec = 0;
        // aderyn-ignore-next-line(reentrancy-state-change) -- a view call in the constructor; nothing to re-enter (SA-07)
        try IERC20Metadata(address(token_)).decimals() returns (uint8 d) {
            dec = d;
        } catch {
            revert TokenDecimalsUnreadable();
        }
        token = token_;
        settlement = settlement_;
        treasury = treasury_;
        cardService = cardService_;
        demoMode = demoMode_;
        tokenDecimals = dec;

        // R9 default shop-type table (01 section 3). Rule = envelope + 1; 255 = blocked; unset = Everyday.
        _defaultRule[5411] = 1;
        _defaultRule[5812] = 1;
        _defaultRule[5814] = 1;
        _defaultRule[4111] = 2;
        _defaultRule[4121] = 2;
        _defaultRule[5541] = 2;
        _defaultRule[5542] = 2;
        _defaultRule[5943] = 3;
        _defaultRule[7338] = 3;
        _defaultRule[8299] = 3;
        _defaultRule[7995] = RULE_BLOCKED;
    }

    // ---------------------------------------------------------------- student writes

    /// @notice Creates the caller's account with a split (R1, R4).
    /// @dev The Emergency lock starts on.
    /// @param split Percentages for the five envelopes.
    /// @return accountId The new id.
    function register(uint8[5] calldata split) external returns (uint256 accountId) {
        if (accountOf[msg.sender] != 0) revert AlreadyHasAccount();
        _checkSplit(split);
        accountId = ++accountCount;
        Account storage acc = _accounts[accountId];
        acc.owner = msg.sender;
        acc.split = split;
        acc.lockOn = true;
        accountOf[msg.sender] = accountId;
        emit AccountCreated(accountId, msg.sender, split);
    }

    /// @notice Saves a new split (R21).
    /// @dev Immediate before the first allowance; otherwise pending for WAIT and only for later allowances.
    /// @param split Percentages for the five envelopes.
    function saveSplit(uint8[5] calldata split) external {
        (uint256 id, Account storage acc) = _caller();
        _checkSplit(split);
        _promoteSplit(acc);
        uint64 now_ = _clock(acc);
        Pending storage p = acc.pendings[uint8(PendingKind.Split)];
        if (!acc.everDeposited) {
            acc.split = split;
            delete acc.pendings[uint8(PendingKind.Split)];
            emit SplitSaved(id, split, now_, true);
        } else {
            uint64 readyAt = now_ + WAIT;
            p.active = true;
            p.readyAt = readyAt;
            p.data = _packSplit(split);
            emit SplitSaved(id, split, readyAt, false);
        }
    }

    /// @notice Creates an invite for a trusted person, replacing any earlier one (R22).
    /// @dev Each invite key works once across the whole contract, so a signature made for an earlier invite
    /// can never be replayed by reusing its key (SA-06).
    /// @param inviteKey Address of the one-time key the invite link carries.
    function createInvite(address inviteKey) external {
        (uint256 id, Account storage acc) = _caller();
        if (inviteKey == address(0)) revert ZeroAddress();
        if (inviteKeyUsed[inviteKey]) revert InviteKeyReused(); // SA-06: old acceptance signatures stay dead
        inviteKeyUsed[inviteKey] = true;
        uint64 expiresAt = _clock(acc) + INVITE_LIFE;
        acc.invite = Invite({key: inviteKey, expiresAt: expiresAt, used: false});
        emit InviteCreated(id, inviteKey, expiresAt);
    }

    /// @notice Starts removing the trusted person (R22). They keep every power during the wait except
    /// approving a recovery. A recovery they approved is cancelled while the student could still cancel it.
    /// @dev Cancelling here stops a trusted person re-approving after every cancel to block removal (SA-02).
    /// A recovery past its wait is the new owner's to finish, so it still blocks removal.
    function removeTrusted() external {
        (uint256 id, Account storage acc) = _caller();
        if (acc.trusted == address(0)) revert NoTrustedPerson();
        if (acc.pendings[uint8(PendingKind.Recovery)].active) {
            if (!_recoveryCancellable(acc)) revert RecoveryPending();
            _clearRecovery(acc);
        }
        uint64 readyAt = _startPending(acc, PendingKind.TrustedRemoval, bytes32(0));
        emit TrustedRemovalStarted(id, acc.trusted, readyAt);
    }

    /// @notice Moves an Everyday purchase to Food, Transport or Study, and remembers the shop type (R15).
    /// @param purchaseId Purchase id.
    /// @param to Target envelope.
    function movePurchase(bytes32 purchaseId, Envelope to) external {
        (uint256 id, Account storage acc) = _caller();
        Purchase storage p = _purchases[purchaseId];
        if (p.state == PurchaseState.None) revert PurchaseNotFound(purchaseId);
        if (p.accountId != id) revert NotOwner();
        if (uint8(to) >= EVERYDAY) revert InvalidTarget();
        if (p.moved) revert AlreadyMoved();
        if (p.envelope != EVERYDAY) revert NotFromEveryday();
        if (_clock(acc) >= p.createdAt + MOVE_PERIOD) revert MovePeriodOver();
        uint256 m = 0;
        if (p.state == PurchaseState.Held) m = p.held;
        else if (p.state != PurchaseState.Released) m = uint256(p.collected) - p.refunded;
        if (m == 0) revert NothingToMove();
        uint8 t = uint8(to);
        if (_available(acc, t) < m) revert TargetShort();

        if (p.state == PurchaseState.Held) {
            acc.held[EVERYDAY] -= m;
            acc.held[t] += m;
        }
        acc.outAmt[t] += m;
        acc.inAmt[EVERYDAY] += m;
        p.envelope = t;
        p.moved = true;
        acc.overrideOf[p.shopType] = t + 1;
        emit PurchaseMoved(id, purchaseId, Envelope.Everyday, to, p.shopType);
    }

    /// @notice Asks to open part of the locked Emergency money (R16).
    /// @param amount Token units, at most the locked balance.
    /// @param reasonHash keccak256 of the reason text; required.
    function requestEmergency(uint256 amount, bytes32 reasonHash) external {
        (uint256 id, Account storage acc) = _caller();
        if (acc.em.status == EmergencyStatus.Open) revert RequestAlreadyOpen();
        if (acc.pendings[uint8(PendingKind.LockOff)].active) revert LockOffPending();
        if (amount == 0) revert AmountZero();
        if (amount > acc.locked) revert AmountAboveLocked();
        if (reasonHash == bytes32(0)) revert ReasonRequired();
        uint64 now_ = _clock(acc);
        uint64 seq = ++acc.requestSeq;
        acc.em = EmergencyRec({
            status: EmergencyStatus.Open,
            requestSeq: seq,
            requestedAt: now_,
            opensAt: now_ + WAIT,
            amount: amount,
            reasonHash: reasonHash
        });
        emit EmergencyRequested(id, seq, amount, reasonHash, now_ + WAIT);
    }

    /// @notice Cancels the open Emergency request; the locked balance is unchanged (R16).
    function cancelEmergency() external {
        (uint256 id, Account storage acc) = _caller();
        if (acc.em.status != EmergencyStatus.Open) revert NoOpenRequest();
        acc.em.status = EmergencyStatus.Cancelled;
        emit EmergencyCancelled(id, acc.em.requestSeq);
    }

    /// @notice Starts turning the Emergency lock off (R20).
    function startLockOff() external {
        (uint256 id, Account storage acc) = _caller();
        if (!acc.lockOn) revert LockAlreadyOff();
        if (acc.em.status == EmergencyStatus.Open) revert RequestAlreadyOpen();
        uint64 readyAt = _startPending(acc, PendingKind.LockOff, bytes32(0));
        emit LockOffStarted(id, readyAt);
    }

    /// @notice Cancels a pending change before its wait ends (R24).
    /// @param kind Which change.
    function cancelPending(PendingKind kind) external {
        (uint256 id, Account storage acc) = _caller();
        Pending storage p = acc.pendings[uint8(kind)];
        uint64 now_ = _clock(acc);
        if (!p.active || (kind == PendingKind.Split && now_ >= p.readyAt)) revert NothingPending();
        if (kind == PendingKind.Recovery ? !_recoveryCancellable(acc) : now_ >= p.readyAt) revert WaitOver();
        if (kind == PendingKind.Recovery) _clearRecovery(acc);
        else delete acc.pendings[uint8(kind)];
        emit PendingCancelled(id, kind);
    }

    /// @notice Demo only: moves the caller's account clock forward.
    /// @param numDays 1 to 14.
    function skipDays(uint16 numDays) external {
        if (!demoMode) revert DemoOff();
        (uint256 id, Account storage acc) = _caller();
        if (numDays == 0 || numDays > MAX_SKIP_DAYS_PER_CALL) revert InvalidDays();
        uint64 total = acc.skipSeconds + uint64(numDays) * 1 days;
        acc.skipSeconds = total;
        emit DaysSkipped(id, numDays, total);
    }

    // ---------------------------------------------------------------- trusted person writes

    /// @notice Links the caller as trusted person with a valid invite signature (R2, R22).
    /// @param accountId Account.
    /// @param signature EIP-712 signature by the invite key over AcceptInvite(accountId, caller).
    function acceptInvite(uint256 accountId, bytes calldata signature) external {
        Account storage acc = _account(accountId);
        Invite storage inv = acc.invite;
        if (inv.key == address(0)) revert NoInvite();
        if (inv.used) revert InviteUsed();
        if (_clock(acc) >= inv.expiresAt) revert InviteExpired();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(ACCEPT_INVITE_TYPEHASH, accountId, msg.sender)));
        // slither-disable-next-line unused-return -- the error argument adds nothing once err is checked (SA-07)
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || signer != inv.key) revert BadSignature();
        if (msg.sender == acc.owner) revert CannotTrustSelf();
        if (trustedAccountOf[msg.sender] != 0) revert AlreadyTrusted();
        if (acc.trusted != address(0)) revert TrustedAlreadyLinked();

        inv.used = true;
        acc.trusted = msg.sender;
        trustedAccountOf[msg.sender] = accountId;
        emit TrustedLinked(accountId, msg.sender);
    }

    /// @notice Opens the request at once (R17).
    /// @dev Bound to `requestSeq` so a request swapped while the approval is in flight is not opened (SA-01).
    /// @param accountId Account.
    /// @param requestSeq The request number the trusted person is approving.
    function approveEmergency(uint256 accountId, uint64 requestSeq) external {
        Account storage acc = _account(accountId);
        _onlyTrusted(acc);
        if (acc.em.status != EmergencyStatus.Open) revert NoOpenRequest();
        if (acc.em.requestSeq != requestSeq) revert RequestChanged();
        _openEmergency(accountId, acc, OpenedBy.Approval);
    }

    /// @notice Approves moving the account to a new owner after WAIT (R23).
    /// @param accountId Account.
    /// @param newOwner The student's new address.
    function approveRecovery(uint256 accountId, address newOwner) external {
        Account storage acc = _account(accountId);
        _onlyTrusted(acc);
        if (newOwner == address(0)) revert ZeroAddress();
        if (accountOf[newOwner] != 0) revert NewOwnerHasAccount();
        if (newOwner == acc.trusted) revert NewOwnerIsTrusted();
        if (acc.pendings[uint8(PendingKind.TrustedRemoval)].active) revert TrustedRemovalPending();
        uint256 busy = recoveryAccountOf[newOwner];
        if (busy != 0 && busy != accountId) revert RecoveryTargetBusy();

        Pending storage p = acc.pendings[uint8(PendingKind.Recovery)];
        if (p.active) recoveryAccountOf[address(uint160(uint256(p.data)))] = 0;
        uint64 readyAt = _startPending(acc, PendingKind.Recovery, bytes32(uint256(uint160(newOwner))));
        recoveryAccountOf[newOwner] = accountId;
        emit RecoveryApproved(accountId, newOwner, readyAt);
    }

    // ---------------------------------------------------------------- anyone, after the wait

    /// @notice Finishes a trusted-person removal after WAIT.
    /// @param accountId Account.
    function finishRemoveTrusted(uint256 accountId) external {
        Account storage acc = _account(accountId);
        _finishPending(acc, PendingKind.TrustedRemoval);
        address t = acc.trusted;
        trustedAccountOf[t] = 0;
        acc.trusted = address(0);
        emit TrustedRemoved(accountId, t);
    }

    /// @notice Opens the request by time once WAIT has passed (R17, R19).
    /// @param accountId Account.
    function finalizeEmergency(uint256 accountId) external {
        Account storage acc = _account(accountId);
        if (acc.em.status != EmergencyStatus.Open) revert NoOpenRequest();
        if (_clock(acc) < acc.em.opensAt) revert WaitNotOver(acc.em.opensAt);
        _openEmergency(accountId, acc, OpenedBy.Time);
    }

    /// @notice Finishes lock-off: the locked balance moves to Everyday (R20).
    /// @param accountId Account.
    function finishLockOff(uint256 accountId) external {
        Account storage acc = _account(accountId);
        _finishPending(acc, PendingKind.LockOff);
        uint256 moved = acc.locked;
        acc.locked = 0;
        acc.inAmt[EVERYDAY] += moved;
        acc.lockOn = false;
        emit LockOffDone(accountId, moved);
    }

    /// @notice Moves the account to the approved new owner (R23). Only the new owner can call it.
    /// @dev The new owner's call is its consent: nobody can push an account onto an address (SA-04). The old
    /// key's unused invite and pending lock-off are dropped so they cannot act on the new owner's account (SA-05).
    /// @param accountId Account.
    function finishRecovery(uint256 accountId) external {
        Account storage acc = _account(accountId);
        address newOwner = address(uint160(uint256(acc.pendings[uint8(PendingKind.Recovery)].data)));
        _finishPending(acc, PendingKind.Recovery);
        if (msg.sender != newOwner) revert NotNewOwner();
        if (accountOf[newOwner] != 0) revert NewOwnerHasAccount();
        if (newOwner == acc.trusted) revert NewOwnerIsTrusted();
        address old = acc.owner;
        accountOf[old] = 0;
        accountOf[newOwner] = accountId;
        acc.owner = newOwner;
        recoveryAccountOf[newOwner] = 0;
        delete acc.invite;
        delete acc.pendings[uint8(PendingKind.LockOff)];
        emit RecoveryDone(accountId, old, newOwner);
    }

    // ---------------------------------------------------------------- treasury and card service

    /// @notice Adds an allowance, split into envelopes and released over four Mondays (R3 to R8).
    /// @param accountId Account.
    /// @param amount Token units pulled from the treasury.
    /// @param paymentId Single-use id of the payment.
    function deposit(uint256 accountId, uint256 amount, bytes32 paymentId) external nonReentrant {
        if (msg.sender != treasury) revert NotTreasury(); // R3
        Account storage acc = _account(accountId);
        if (amount == 0) revert AmountZero();
        if (amount > type(uint128).max) revert AmountTooLarge();
        if (paymentId == bytes32(0)) revert InvalidId();
        if (paymentUsed[paymentId]) revert PaymentAlreadyUsed(paymentId);

        _promoteSplit(acc);
        uint64 today = _clock(acc) / 1 days;
        uint64 monday = _mondayNumber(today);
        _fold(acc, monday);

        // R4: floor each part; every leftover unit goes to Everyday.
        uint256[5] memory parts;
        uint256 others = 0;
        for (uint256 e = 0; e < 5; ++e) {
            if (e == EVERYDAY) continue;
            parts[e] = amount * acc.split[e] / 100;
            others += parts[e];
        }
        parts[EVERYDAY] = amount - others;

        paymentUsed[paymentId] = true;
        acc.everDeposited = true;

        // R7 locked whole; R20 once the lock is off, it is Everyday money at once.
        uint256 em = parts[uint8(Envelope.Emergency)];
        if (acc.lockOn) acc.locked += em;
        else acc.inAmt[EVERYDAY] += em;

        Schedule storage r = _scheduleFor(acc, monday);
        for (uint256 e = 0; e < WEEKLY; ++e) {
            r.base[e] = (uint256(r.base[e]) + parts[e] / 4).toUint128(); // R5
            r.part[e] = (uint256(r.part[e]) + parts[e]).toUint128();
        }

        uint256 before = token.balanceOf(address(this));
        // slither-disable-next-line arbitrary-send-erc20 -- `from` is the immutable treasury, only it can call (SA-07)
        token.safeTransferFrom(treasury, address(this), amount);
        _checkReceived(before, amount);
        emit Deposited(accountId, paymentId, amount, parts, today);
    }

    /// @notice Authorises a card purchase: holds it in one envelope or declines (R9 to R12).
    /// @dev Never reverts for a decline. Reverts only on bad input.
    /// @param accountId Account.
    /// @param purchaseId Single-use purchase id.
    /// @param shopType Merchant category code.
    /// @param amount Token units.
    function authorize(uint256 accountId, bytes32 purchaseId, uint16 shopType, uint256 amount) external {
        _onlyCardService();
        Account storage acc = _account(accountId);
        if (purchaseId == bytes32(0)) revert InvalidId();
        if (purchaseUsed[purchaseId]) revert PurchaseIdUsed(purchaseId);
        if (amount == 0) revert AmountZero();
        if (amount > type(uint128).max) revert AmountTooLarge();

        purchaseUsed[purchaseId] = true;
        (Envelope env, bool blocked) = _resolve(acc, shopType);
        if (blocked) {
            emit PurchaseDeclined(accountId, purchaseId, amount, shopType, DeclineReason.Blocked); // R12
            return;
        }
        uint8 pay = uint8(env);
        bool stepIn = false;
        if (_available(acc, pay) < amount) {
            // R10: only Everyday steps in, and never as a split.
            if (pay == EVERYDAY || _available(acc, EVERYDAY) < amount) {
                emit PurchaseDeclined(accountId, purchaseId, amount, shopType, DeclineReason.NotEnough);
                return;
            }
            pay = EVERYDAY;
            stepIn = true;
        }
        acc.outAmt[pay] += amount;
        acc.held[pay] += amount;
        _purchases[purchaseId] = Purchase({
            accountId: accountId.toUint64(),
            createdAt: _clock(acc),
            shopType: shopType,
            envelope: pay,
            state: PurchaseState.Held,
            moved: false,
            everydayStepIn: stepIn,
            amount: amount.toUint128(),
            held: amount.toUint128(),
            collected: 0,
            refunded: 0
        });
        emit PurchaseApproved(accountId, purchaseId, Envelope(pay), amount, shopType, stepIn);
    }

    /// @notice Collects part or all of a hold to settlement; the rest returns to the envelope (R13).
    /// @param purchaseId Purchase id.
    /// @param amount Token units to collect, at most the hold.
    function collect(bytes32 purchaseId, uint256 amount) external nonReentrant {
        _onlyCardService();
        Purchase storage p = _purchases[purchaseId];
        if (p.state != PurchaseState.Held) revert NotHeld();
        if (amount == 0) revert AmountZero();
        uint256 h = p.held;
        if (amount > h) revert AmountAboveHeld();
        Account storage acc = _accounts[p.accountId];
        if (_clock(acc) >= p.createdAt + HOLD_PERIOD) revert HoldExpired();

        uint256 returned = h - amount;
        acc.held[p.envelope] -= h;
        acc.inAmt[p.envelope] += returned;
        p.held = 0;
        p.collected = amount.toUint128();
        p.state = PurchaseState.Collected;

        token.safeTransfer(settlement, amount); // invariant 4
        emit PurchaseCollected(p.accountId, purchaseId, amount, returned);
    }

    /// @notice Releases a hold back to its envelope (R13). Anyone may once the hold period is over.
    /// @param purchaseId Purchase id.
    function releaseHold(bytes32 purchaseId) external {
        Purchase storage p = _purchases[purchaseId];
        if (p.state != PurchaseState.Held) revert NotHeld();
        Account storage acc = _accounts[p.accountId];
        if (msg.sender != cardService && _clock(acc) < p.createdAt + HOLD_PERIOD) revert HoldNotExpired();

        uint256 a = p.held;
        acc.held[p.envelope] -= a;
        acc.inAmt[p.envelope] += a;
        p.held = 0;
        p.state = PurchaseState.Released;
        emit HoldReleased(p.accountId, purchaseId, a);
    }

    /// @notice Refunds collected money from settlement into the envelope that paid (R13).
    /// @param purchaseId Purchase id.
    /// @param amount Token units, up to collected minus refunded.
    function refund(bytes32 purchaseId, uint256 amount) external nonReentrant {
        _onlyCardService();
        Purchase storage p = _purchases[purchaseId];
        if (p.state != PurchaseState.Collected && p.state != PurchaseState.Refunded) revert NotCollected();
        if (amount == 0) revert AmountZero();
        if (uint256(p.refunded) + amount > p.collected) revert RefundTooLarge();

        p.refunded += amount.toUint128();
        p.state = PurchaseState.Refunded;
        _accounts[p.accountId].inAmt[p.envelope] += amount;

        uint256 before = token.balanceOf(address(this));
        // slither-disable-next-line arbitrary-send-erc20 -- `from` is the immutable settlement, capped per purchase (SA-07)
        token.safeTransferFrom(settlement, address(this), amount);
        _checkReceived(before, amount);
        emit PurchaseRefunded(p.accountId, purchaseId, amount);
    }

    // ---------------------------------------------------------------- reads

    /// @notice Balances of the five envelopes and the next release day.
    /// @param accountId Account.
    /// @return list One view per envelope.
    /// @return nextReleaseDay Account-clock day number of the next release, 0 if none is due.
    function envelopes(uint256 accountId) external view returns (EnvelopeView[5] memory list, uint64 nextReleaseDay) {
        Account storage acc = _accounts[accountId];
        uint64 monday = _mondayNumber(_clock(acc) / 1 days);
        for (uint8 e = 0; e < WEEKLY; ++e) {
            (uint256 live, uint256 total) = _live(acc, e, monday);
            list[e] = EnvelopeView({
                available: acc.inAmt[e] + live - acc.outAmt[e], unreleased: total - live, held: acc.held[e], locked: 0
            });
        }
        list[4].locked = acc.locked;
        for (uint256 i = 0; i < acc.scheduleCount; ++i) {
            if (_sharesOut(acc.schedules[i].startMonday, monday) < 4) return (list, _mondayDay(monday + 1));
        }
    }

    /// @notice Parent totals: available plus unreleased per envelope; Emergency is the locked balance (R25).
    /// @param accountId Account.
    /// @return t Five totals; held is excluded.
    function totals(uint256 accountId) external view returns (uint256[5] memory t) {
        Account storage acc = _accounts[accountId];
        uint64 monday = _mondayNumber(_clock(acc) / 1 days);
        for (uint8 e = 0; e < WEEKLY; ++e) {
            (, uint256 total) = _live(acc, e, monday);
            t[e] = acc.inAmt[e] + total - acc.outAmt[e];
        }
        t[4] = acc.locked;
    }

    /// @notice Account details with the effective split.
    /// @param accountId Account.
    /// @return info Account details; zeros for an unknown id.
    function accountInfo(uint256 accountId) external view returns (AccountInfo memory info) {
        Account storage acc = _accounts[accountId];
        Pending storage p = acc.pendings[uint8(PendingKind.Split)];
        info.owner = acc.owner;
        info.trusted = acc.trusted;
        info.split = acc.split;
        if (p.active) {
            if (_clock(acc) >= p.readyAt) {
                info.split = _unpackSplit(p.data);
            } else {
                info.pendingSplit = _unpackSplit(p.data);
                info.pendingSplitStartsAt = p.readyAt;
            }
        }
        info.lockOn = acc.lockOn;
        info.everDeposited = acc.everDeposited;
        info.requestSeq = acc.requestSeq;
        info.skipSeconds = acc.skipSeconds;
    }

    /// @notice An approved purchase.
    /// @param purchaseId Purchase id.
    /// @return info Purchase details; zeros for unknown or declined ids.
    function purchase(bytes32 purchaseId) external view returns (PurchaseInfo memory info) {
        Purchase storage p = _purchases[purchaseId];
        info = PurchaseInfo({
            accountId: p.accountId,
            envelope: Envelope(p.envelope),
            amount: p.amount,
            held: p.held,
            collected: p.collected,
            refunded: p.refunded,
            shopType: p.shopType,
            createdAt: p.createdAt,
            state: p.state,
            moved: p.moved,
            everydayStepIn: p.everydayStepIn
        });
    }

    /// @notice The latest Emergency request.
    /// @param accountId Account.
    /// @return info Request details.
    function emergency(uint256 accountId) external view returns (EmergencyInfo memory info) {
        EmergencyRec storage r = _accounts[accountId].em;
        info = EmergencyInfo({
            status: r.status,
            requestSeq: r.requestSeq,
            amount: r.amount,
            reasonHash: r.reasonHash,
            requestedAt: r.requestedAt,
            opensAt: r.opensAt
        });
    }

    /// @notice A pending change. A split already due reads as not pending.
    /// @param accountId Account.
    /// @param kind Which change.
    /// @return active Whether it is pending.
    /// @return readyAt Account-clock time it can finish.
    /// @return data Packed split, or the new owner for a recovery.
    function pending(uint256 accountId, PendingKind kind)
        external
        view
        returns (bool active, uint64 readyAt, bytes32 data)
    {
        Account storage acc = _accounts[accountId];
        Pending storage p = acc.pendings[uint8(kind)];
        if (kind == PendingKind.Split && p.active && _clock(acc) >= p.readyAt) return (false, 0, 0);
        return (p.active, p.readyAt, p.data);
    }

    /// @notice Which envelope a shop type pays from for an account (R9, R12, R15).
    /// @param accountId Account (0 for the default table).
    /// @param shopType Merchant category code.
    /// @return envelope The paying envelope.
    /// @return blocked True when always declined.
    function shopEnvelope(uint256 accountId, uint16 shopType) external view returns (Envelope envelope, bool blocked) {
        return _resolve(_accounts[accountId], shopType);
    }

    /// @notice The account clock: block time plus demo skips.
    /// @param accountId Account.
    /// @return now_ Seconds since 1970 on the account clock.
    function clock(uint256 accountId) external view returns (uint64 now_) {
        return _clock(_accounts[accountId]);
    }

    /// @notice The current invite.
    /// @param accountId Account.
    /// @return inviteKey Address of the invite key.
    /// @return expiresAt Account-clock expiry.
    /// @return used Whether it was accepted.
    function inviteOf(uint256 accountId) external view returns (address inviteKey, uint64 expiresAt, bool used) {
        Invite storage inv = _accounts[accountId].invite;
        return (inv.key, inv.expiresAt, inv.used);
    }

    /// @notice Every stored schedule record, with shares out computed now.
    /// @param accountId Account.
    /// @return list Schedule records.
    function schedules(uint256 accountId) external view returns (ScheduleView[] memory list) {
        Account storage acc = _accounts[accountId];
        uint64 monday = _mondayNumber(_clock(acc) / 1 days);
        list = new ScheduleView[](acc.scheduleCount);
        for (uint256 i = 0; i < list.length; ++i) {
            Schedule storage r = acc.schedules[i];
            list[i].startMonday = r.startMonday;
            list[i].sharesOut = uint8(_sharesOut(r.startMonday, monday));
            for (uint256 e = 0; e < WEEKLY; ++e) {
                list[i].base[e] = r.base[e];
                list[i].part[e] = r.part[e];
            }
        }
    }

    // ---------------------------------------------------------------- internal

    function _caller() private view returns (uint256 id, Account storage acc) {
        id = accountOf[msg.sender];
        if (id == 0) revert NoAccount();
        acc = _accounts[id];
    }

    function _account(uint256 accountId) private view returns (Account storage) {
        if (accountId == 0 || accountId > accountCount) revert AccountNotFound(accountId);
        return _accounts[accountId];
    }

    function _onlyCardService() private view {
        if (msg.sender != cardService) revert NotCardService(); // R3
    }

    function _onlyTrusted(Account storage acc) private view {
        if (acc.trusted == address(0) || msg.sender != acc.trusted) revert NotTrusted();
    }

    /// @dev One clock for every wait (invariant 6).
    function _clock(Account storage acc) private view returns (uint64) {
        return uint64(block.timestamp) + acc.skipSeconds;
    }

    /// @dev Day 0 is a Thursday, so +3 makes each Monday number start at Monday 00:00 UTC.
    function _mondayNumber(uint64 day) private pure returns (uint64) {
        return (day + 3) / 7;
    }

    function _mondayDay(uint64 monday) private pure returns (uint64) {
        return 7 * monday - 3;
    }

    function _sharesOut(uint64 startMonday, uint64 monday) private pure returns (uint256) {
        uint256 k = 1 + uint256(monday - startMonday);
        return k < 4 ? k : 4;
    }

    /// @dev Released and total amounts of envelope `e` over the live schedule records (R5, R8).
    function _live(Account storage acc, uint8 e, uint64 monday) private view returns (uint256 live, uint256 total) {
        uint256 n = acc.scheduleCount;
        for (uint256 i = 0; i < n; ++i) {
            Schedule storage r = acc.schedules[i];
            uint256 k = _sharesOut(r.startMonday, monday);
            uint256 part = r.part[e];
            total += part;
            live += k < 4 ? k * r.base[e] : part;
        }
    }

    function _available(Account storage acc, uint8 e) private view returns (uint256) {
        (uint256 live,) = _live(acc, e, _mondayNumber(_clock(acc) / 1 days));
        return acc.inAmt[e] + live - acc.outAmt[e];
    }

    /// @dev Moves finished records into the counters; the value is unchanged (S03-10).
    function _fold(Account storage acc, uint64 monday) private {
        uint256 i = 0;
        while (i < acc.scheduleCount) {
            Schedule storage r = acc.schedules[i];
            if (_sharesOut(r.startMonday, monday) < 4) {
                ++i;
                continue;
            }
            for (uint256 e = 0; e < WEEKLY; ++e) {
                acc.inAmt[e] += r.part[e];
            }
            uint8 last = acc.scheduleCount - 1;
            if (i != last) acc.schedules[i] = acc.schedules[last];
            delete acc.schedules[last];
            acc.scheduleCount = last;
        }
    }

    function _scheduleFor(Account storage acc, uint64 monday) private returns (Schedule storage) {
        uint8 n = acc.scheduleCount;
        for (uint8 i = 0; i < n; ++i) {
            // slither-disable-next-line incorrect-equality -- exact week match is the merge rule (S03-10) (SA-07)
            if (acc.schedules[i].startMonday == monday) return acc.schedules[i];
        }
        if (n == MAX_SCHEDULES) revert TooManySchedules();
        acc.scheduleCount = n + 1;
        acc.schedules[n].startMonday = monday;
        return acc.schedules[n];
    }

    function _resolve(Account storage acc, uint16 shopType) private view returns (Envelope, bool) {
        uint8 rule = _defaultRule[shopType];
        if (rule == RULE_BLOCKED) return (Envelope.Everyday, true); // R12 wins over any override
        uint8 o = acc.overrideOf[shopType];
        if (o > 0) return (Envelope(o - 1), false);
        if (rule > 0) return (Envelope(rule - 1), false);
        return (Envelope.Everyday, false);
    }

    function _openEmergency(uint256 accountId, Account storage acc, OpenedBy by) private {
        uint256 amount = acc.em.amount;
        acc.locked -= amount; // R18: the rest stays locked
        acc.inAmt[EVERYDAY] += amount;
        acc.em.status = EmergencyStatus.Opened;
        emit EmergencyOpened(accountId, acc.em.requestSeq, amount, by);
    }

    /// @dev A pending recovery can be cancelled before its wait ends, or at any time once it can never finish
    /// because its new owner has since registered (SA-03).
    function _recoveryCancellable(Account storage acc) private view returns (bool) {
        Pending storage p = acc.pendings[uint8(PendingKind.Recovery)];
        return _clock(acc) < p.readyAt || accountOf[address(uint160(uint256(p.data)))] != 0;
    }

    /// @dev Drops a pending recovery and its lookup entry, if any.
    function _clearRecovery(Account storage acc) private {
        Pending storage p = acc.pendings[uint8(PendingKind.Recovery)];
        if (!p.active) return;
        recoveryAccountOf[address(uint160(uint256(p.data)))] = 0;
        delete acc.pendings[uint8(PendingKind.Recovery)];
    }

    function _startPending(Account storage acc, PendingKind kind, bytes32 data) private returns (uint64 readyAt) {
        readyAt = _clock(acc) + WAIT;
        acc.pendings[uint8(kind)] = Pending({active: true, readyAt: readyAt, data: data});
    }

    function _finishPending(Account storage acc, PendingKind kind) private {
        Pending storage p = acc.pendings[uint8(kind)];
        if (!p.active) revert NothingPending();
        if (_clock(acc) < p.readyAt) revert WaitNotOver(p.readyAt);
        delete acc.pendings[uint8(kind)];
    }

    /// @dev Applies a pending split whose wait is over. Emits nothing; SplitSaved already announced it.
    function _promoteSplit(Account storage acc) private {
        Pending storage p = acc.pendings[uint8(PendingKind.Split)];
        if (p.active && _clock(acc) >= p.readyAt) {
            acc.split = _unpackSplit(p.data);
            delete acc.pendings[uint8(PendingKind.Split)];
        }
    }

    /// @dev Balance-delta check after a pull, so fee-on-transfer and odd tokens cannot break invariant 1.
    function _checkReceived(uint256 before, uint256 amount) private view {
        if (token.balanceOf(address(this)) - before != amount) revert TransferMismatch();
    }

    /// @dev R4: multiples of 5 summing to exactly 100; summed in uint256 so uint8 overflow cannot hide.
    function _checkSplit(uint8[5] calldata split) private pure {
        uint256 sum = 0;
        for (uint256 i = 0; i < 5; ++i) {
            if (split[i] % 5 != 0) revert InvalidSplit();
            sum += split[i];
        }
        if (sum != 100) revert InvalidSplit();
    }

    function _packSplit(uint8[5] calldata s) private pure returns (bytes32) {
        return
            bytes32(
                uint256(s[0]) | uint256(s[1]) << 8 | uint256(s[2]) << 16 | uint256(s[3]) << 24 | uint256(s[4]) << 32
            );
    }

    function _unpackSplit(bytes32 data) private pure returns (uint8[5] memory s) {
        uint256 d = uint256(data);
        for (uint256 i = 0; i < 5; ++i) {
            // forge-lint: disable-next-line(unsafe-typecast) -- taking one byte is the point
            s[i] = uint8(d >> (8 * i));
        }
    }
}
