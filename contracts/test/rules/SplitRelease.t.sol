// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../AmplopBase.t.sol";

/// @notice R3 (deposit side), R4 to R8 and R21 (S03-23 to S03-27, S03-55).
contract SplitReleaseTest is AmplopBase {
    // Dates from S03-7 as day numbers.
    uint256 internal constant SUN_11_OCT = 20_737;
    uint256 internal constant MON_12_OCT = 20_738;
    uint256 internal constant TUE_13_OCT = 20_739;
    uint256 internal constant MON_19_OCT = 20_745;
    uint256 internal constant WED_21_OCT = 20_747;
    uint256 internal constant MON_26_OCT = 20_752;
    uint256 internal constant MON_2_NOV = 20_759;
    uint256 internal constant MON_9_NOV = 20_766;

    function _weeklyAvailable(uint256 id) internal view returns (uint256 sum) {
        EnvelopeView[5] memory v = views(id);
        for (uint256 e = 0; e < 4; ++e) {
            sum += v[e].available;
        }
    }

    function _rupiahSample() internal view returns (uint256) {
        return 1_234_567 * 10 ** dec / 16_500;
    }

    // ------------------------------------------------------------ R3, R4

    function test_R4_splitMustTotal100AndStepsOf5() public {
        uint8[5][3] memory bad = [[40, 15, 15, 20, 5], [40, 15, 15, 20, 15], [40, 15, 15, 27, 3]];
        for (uint256 i = 0; i < bad.length; ++i) {
            vm.prank(raka);
            vm.expectRevert(AmplopEnvelopes.InvalidSplit.selector);
            amplop.register(bad[i]);
        }
        assertEq(register(raka, [uint8(100), 0, 0, 0, 0]), 1);
        assertEq(register(dewi, [uint8(0), 0, 0, 0, 100]), 2);
        vm.prank(raka);
        vm.expectRevert(AmplopEnvelopes.InvalidSplit.selector);
        amplop.saveSplit([uint8(50), 50, 5, 0, 0]);
    }

    function test_R4_leftoverUnitsGoToEveryday() public {
        uint256 id = registerRaka();
        uint256 amount = _rupiahSample();
        deposit(id, amount);
        uint256[5] memory t = amplop.totals(id);
        uint256 food = amount * 40 / 100;
        uint256 transport = amount * 15 / 100;
        uint256 emergency = amount * 10 / 100;
        uint256 everyday = amount - food - 2 * transport - emergency;
        assertEq(t[0], food);
        assertEq(t[1], transport);
        assertEq(t[2], transport);
        assertEq(t[3], everyday);
        assertEq(t[4], emergency);
        assertEq(t[0] + t[1] + t[2] + t[3] + t[4], amount);
        assertGe(everyday, amount * 20 / 100);
        if (dec == 6) {
            assertEq(amount, 74_822_242);
            assertEq(t[0], 29_928_896);
            assertEq(t[1], 11_223_336);
            assertEq(t[2], 11_223_336);
            assertEq(t[4], 7_482_224);
            assertEq(t[3], 14_964_450);
            assertEq(t[3] - amount * 20 / 100, 2);
        }
    }

    function test_R4_samePaymentIdCannotDepositTwice() public {
        uint256 id = registerRaka();
        bytes32 pid = keccak256("midtrans:order-1");
        vm.prank(treasury);
        amplop.deposit(id, usd(1000, 0), pid);
        assertTrue(amplop.paymentUsed(pid));
        EnvelopeView[5] memory before = views(id);
        uint256 bal = token.balanceOf(address(amplop));

        vm.prank(treasury);
        vm.expectRevert(abi.encodeWithSelector(AmplopEnvelopes.PaymentAlreadyUsed.selector, pid));
        amplop.deposit(id, usd(1000, 0), pid);

        // Also refused for another account.
        uint256 other = register(dewi, sampleSplit);
        vm.prank(treasury);
        vm.expectRevert(abi.encodeWithSelector(AmplopEnvelopes.PaymentAlreadyUsed.selector, pid));
        amplop.deposit(other, usd(1000, 0), pid);

        assertViewsEq(views(id), before);
        assertEq(token.balanceOf(address(amplop)), bal);
    }

    function test_R3_onlyTreasuryCanDeposit() public {
        uint256 id = registerRaka();
        address[5] memory callers = [raka, cardService, settlement, stranger, address(this)];
        for (uint256 i = 0; i < callers.length; ++i) {
            vm.prank(callers[i]);
            vm.expectRevert(AmplopEnvelopes.NotTreasury.selector);
            amplop.deposit(id, usd(10, 0), keccak256(abi.encode(i)));
        }
        assertEq(token.balanceOf(address(amplop)), 0);
    }

    function test_R4_sampleThousandDollars() public {
        uint256 id = registerRaka();
        deposit(id, usd(1000, 0));
        uint256[5] memory t = amplop.totals(id);
        assertEq(t[0], usd(400, 0));
        assertEq(t[1], usd(150, 0));
        assertEq(t[2], usd(150, 0));
        assertEq(t[3], usd(200, 0));
        assertEq(t[4], usd(100, 0));
        assertEq(available(id, Envelope.Food), usd(100, 0));
        assertEq(available(id, Envelope.Transport), usd(37, 50));
        assertEq(available(id, Envelope.Study), usd(37, 50));
        assertEq(available(id, Envelope.Everyday), usd(50, 0));
        assertEq(available(id, Envelope.Emergency), 0);
        assertEq(locked(id), usd(100, 0));
    }

    // ------------------------------------------------------------ R5

    function test_R5_firstShareOnArrival() public {
        uint256 id = registerRaka();
        deposit(id, usd(1000, 0));
        assertEq(available(id, Envelope.Food), usd(100, 0));
        assertEq(unreleased(id, Envelope.Food), usd(300, 0));
        assertEq(available(id, Envelope.Everyday), usd(50, 0));
        assertEq(unreleased(id, Envelope.Everyday), usd(150, 0));
        assertEq(_weeklyAvailable(id), usd(225, 0));
    }

    function test_R5_sharesTwoToFourOnNextThreeMondays() public {
        uint256 id = registerRaka();
        deposit(id, usd(1000, 0));
        uint256[3] memory mondays = [MON_19_OCT, MON_26_OCT, MON_2_NOV];
        for (uint256 k = 0; k < 3; ++k) {
            warpTo(mondays[k] - 1, DAY - 1); // Sunday 23:59:59
            assertEq(_weeklyAvailable(id), usd(225, 0) * (k + 1));
            warpTo(mondays[k], 0);
            assertEq(_weeklyAvailable(id), usd(225, 0) * (k + 2));
        }
        assertEq(available(id, Envelope.Food), usd(400, 0));
        assertEq(unreleased(id, Envelope.Food), 0);
    }

    function test_R5_arrivalOnSunday() public {
        vm.warp(1_791_712_800); // Sun 11 Oct 2026 10:00
        uint256 id = registerRaka();
        deposit(id, usd(1000, 0));
        assertEq(today(id), SUN_11_OCT);
        assertEq(nextRelease(id), MON_12_OCT);
        assertEq(available(id, Envelope.Food), usd(100, 0));
        warpTo(MON_12_OCT - 1, DAY - 1);
        assertEq(available(id, Envelope.Food), usd(100, 0));
        warpTo(MON_12_OCT, 0);
        assertEq(available(id, Envelope.Food), usd(200, 0));
        assertEq(nextRelease(id), MON_19_OCT);
        warpTo(MON_19_OCT, 0);
        assertEq(available(id, Envelope.Food), usd(300, 0));
        warpTo(MON_26_OCT, 0);
        assertEq(available(id, Envelope.Food), usd(400, 0));
        assertEq(nextRelease(id), 0);
        warpTo(MON_2_NOV, 0);
        assertEq(available(id, Envelope.Food), usd(400, 0));
    }

    function test_R5_arrivalOnMonday() public {
        // One second before Monday: share 2 arrives one second later.
        vm.warp(1_791_763_199);
        uint256 early = register(dewi, sampleSplit);
        deposit(early, usd(1000, 0));
        assertEq(available(early, Envelope.Food), usd(100, 0));

        vm.warp(1_791_763_200); // Mon 12 Oct 2026 00:00:00
        assertEq(available(early, Envelope.Food), usd(200, 0));
        uint256 id = registerRaka();
        deposit(id, usd(1000, 0));
        assertEq(available(id, Envelope.Food), usd(100, 0));
        assertEq(nextRelease(id), MON_19_OCT);

        warpTo(MON_19_OCT - 1, DAY - 1);
        assertEq(available(id, Envelope.Food), usd(100, 0));
        warpTo(MON_19_OCT, 0);
        assertEq(available(id, Envelope.Food), usd(200, 0));
        warpTo(MON_26_OCT, 0);
        assertEq(available(id, Envelope.Food), usd(300, 0));
        warpTo(MON_2_NOV, 0);
        assertEq(available(id, Envelope.Food), usd(400, 0));
    }

    function test_R5_skipThreeDaysReleasesNothing() public {
        warpTo(TUE_13_OCT, 10 hours);
        uint256 id = registerRaka();
        deposit(id, usd(1000, 0));
        EnvelopeView[5] memory before = views(id);
        uint64 next = nextRelease(id);
        vm.prank(raka);
        amplop.skipDays(3); // Tue -> Fri
        assertEq(today(id), TUE_13_OCT + 3);
        assertViewsEq(views(id), before);
        assertEq(nextRelease(id), next);
        assertEq(next, MON_19_OCT);
    }

    function test_R5_nothingAfterFourthShare() public {
        uint256 id = registerRaka();
        deposit(id, usd(1000, 0));
        warpTo(MON_2_NOV, 0);
        EnvelopeView[5] memory week4 = views(id);
        assertEq(week4[0].available, usd(400, 0));
        assertEq(nextRelease(id), 0);
        for (uint256 w = 1; w <= 4; ++w) {
            warpTo(MON_2_NOV + 7 * w, 0);
            assertViewsEq(views(id), week4);
            assertEq(nextRelease(id), 0);
        }
    }

    function test_R5_leftoverInLastShare() public {
        uint256 id = registerRaka();
        uint256 amount = _rupiahSample();
        deposit(id, amount);
        uint256 part = amplop.totals(id)[3];
        uint256 base = part / 4;
        ScheduleView[] memory s = amplop.schedules(id);
        assertEq(s.length, 1);
        assertEq(s[0].base[3], base);
        assertEq(s[0].part[3], part);
        assertEq(available(id, Envelope.Everyday), base);
        uint256[3] memory mondays = [MON_19_OCT, MON_26_OCT, MON_2_NOV];
        warpTo(mondays[0], 0);
        assertEq(available(id, Envelope.Everyday), 2 * base);
        warpTo(mondays[1], 0);
        assertEq(available(id, Envelope.Everyday), 3 * base);
        warpTo(mondays[2], 0);
        assertEq(available(id, Envelope.Everyday), part);
        if (dec == 6) {
            assertEq(part, 14_964_450);
            assertEq(base, 3_741_112);
            assertEq(part - 3 * base, 3_741_114);
        }
    }

    // ------------------------------------------------------------ R6, R7

    function test_R6_unspentMoneyCarriesOver() public {
        uint256 id = registerRaka();
        deposit(id, usd(1000, 0));
        buy(id, 5411, usd(10, 0));
        assertEq(available(id, Envelope.Food), usd(90, 0));
        warpTo(MON_19_OCT, 0);
        // Week 2 = share 1 + share 2, less what was spent.
        assertEq(available(id, Envelope.Food), usd(190, 0));
        assertEq(available(id, Envelope.Transport), usd(75, 0));
        assertEq(available(id, Envelope.Everyday), usd(100, 0));
    }

    function test_R7_emergencyShareArrivesWholeAndLocked() public {
        uint256 id = registerRaka();
        deposit(id, usd(1000, 0));
        EnvelopeView memory em = views(id)[4];
        assertEq(em.locked, usd(100, 0));
        assertEq(em.available, 0);
        assertEq(em.unreleased, 0);
        assertEq(em.held, 0);
        warpTo(MON_19_OCT, 0);
        assertEq(locked(id), usd(100, 0));
        assertEq(available(id, Envelope.Emergency), 0);
        deposit(id, usd(500, 0));
        assertEq(locked(id), usd(150, 0));
    }

    // ------------------------------------------------------------ R8

    function test_R8_twoOverlappingAllowancesAddUp() public {
        uint256 id = registerRaka();
        deposit(id, usd(1000, 0)); // A, Wed 14 Oct
        assertEq(available(id, Envelope.Food), usd(100, 0));
        assertEq(unreleased(id, Envelope.Food), usd(300, 0));

        warpTo(MON_19_OCT, 0);
        assertEq(available(id, Envelope.Food), usd(200, 0));
        assertEq(unreleased(id, Envelope.Food), usd(200, 0));

        warpTo(WED_21_OCT, 10 hours);
        deposit(id, usd(500, 0)); // B
        assertEq(available(id, Envelope.Food), usd(250, 0));
        assertEq(unreleased(id, Envelope.Food), usd(350, 0));

        uint256[3] memory mondays = [MON_26_OCT, MON_2_NOV, MON_9_NOV];
        uint256[3] memory avail = [uint256(400), 550, 600];
        uint256[3] memory later = [uint256(200), 50, 0];
        for (uint256 i = 0; i < 3; ++i) {
            warpTo(mondays[i], 0);
            assertEq(available(id, Envelope.Food), usd(avail[i], 0));
            assertEq(unreleased(id, Envelope.Food), usd(later[i], 0));
        }
    }

    function test_R8_sameWeekAllowancesMergeExactly() public {
        uint256 id = registerRaka();
        uint256 a = 1_000_000_003;
        uint256 b = 777_777_777;
        deposit(id, a);
        vm.warp(block.timestamp + 2 days); // Fri, same week
        deposit(id, b);
        ScheduleView[] memory s = amplop.schedules(id);
        assertEq(s.length, 1);

        uint256[3] memory mondays = [MON_19_OCT, MON_26_OCT, MON_2_NOV];
        for (uint256 k = 1; k <= 4; ++k) {
            if (k > 1) warpTo(mondays[k - 2], 0);
            for (uint256 e = 0; e < 4; ++e) {
                uint256 expected = _sepRelease(a, e, k) + _sepRelease(b, e, k);
                assertEq(views(id)[e].available, expected, "merged equals separate");
            }
        }
    }

    function _sepRelease(uint256 amount, uint256 e, uint256 k) internal view returns (uint256) {
        uint256 part = e == 3
            ? amount - amount * 40 / 100 - 2 * (amount * 15 / 100) - amount * 10 / 100
            : amount * sampleSplit[e] / 100;
        return k == 4 ? part : k * (part / 4);
    }

    function test_R8_finishedSchedulesFoldOnDeposit() public {
        uint256 id = registerRaka();
        // One deposit a week for six weeks: never more than three live records.
        for (uint256 w = 0; w < 6; ++w) {
            if (w > 0) warpTo(MON_19_OCT + 7 * (w - 1), 10 hours);
            deposit(id, usd(1000, 0));
            assertLe(amplop.schedules(id).length, 3);
        }

        // A finished record folds on the next deposit without changing value.
        uint256 other = register(dewi, sampleSplit);
        deposit(other, usd(1000, 0));
        warpTo(MON_9_NOV + 35, 10 hours);
        ScheduleView[] memory s = amplop.schedules(other);
        assertEq(s.length, 1);
        assertEq(s[0].sharesOut, 4);
        EnvelopeView[5] memory before = views(other);
        deposit(other, usd(1000, 0));
        assertEq(amplop.schedules(other).length, 1);
        assertEq(amplop.schedules(other)[0].sharesOut, 1);
        EnvelopeView[5] memory afterFold = views(other);
        assertEq(afterFold[0].available, before[0].available + usd(100, 0));
        assertEq(afterFold[0].unreleased, before[0].unreleased + usd(300, 0));
        assertEq(afterFold[3].available, before[3].available + usd(50, 0));
        assertEq(afterFold[4].locked, before[4].locked + usd(100, 0));
    }

    // ------------------------------------------------------------ R21

    function test_R21_newSplitOnlyForLaterAllowances() public {
        uint256 id = registerRaka();
        deposit(id, usd(1000, 0));
        uint256[5] memory first = amplop.totals(id);
        uint64 t0 = amplop.clock(id);
        vm.prank(raka);
        amplop.saveSplit([uint8(10), 10, 10, 60, 10]);
        assertEq(amplop.totals(id)[0], first[0], "old money not re-divided");

        vm.warp(block.timestamp + 47 hours);
        deposit(id, usd(1000, 0));
        uint256[5] memory second = amplop.totals(id);
        assertEq(second[0] - first[0], usd(400, 0), "+47h uses the old split");

        vm.warp(uint256(t0) + 48 hours);
        deposit(id, usd(1000, 0));
        uint256[5] memory third = amplop.totals(id);
        assertEq(third[0] - second[0], usd(100, 0), "+48h uses the new split");
        assertEq(third[3] - second[3], usd(600, 0));
        AccountInfo memory info = amplop.accountInfo(id);
        assertEq(info.split[3], 60);
        (bool active,,) = amplop.pending(id, PendingKind.Split);
        assertFalse(active);
    }

    function test_R21_immediateBeforeFirstAllowance() public {
        uint256 id = registerRaka();
        uint8[5] memory s = [uint8(25), 25, 25, 15, 10];
        vm.expectEmit(address(amplop));
        emit AmplopEnvelopes.SplitSaved(id, s, amplop.clock(id), true);
        vm.prank(raka);
        amplop.saveSplit(s);
        AccountInfo memory info = amplop.accountInfo(id);
        assertEq(info.split[0], 25);
        assertEq(info.split[3], 15);
        assertEq(info.pendingSplitStartsAt, 0);
        (bool active,,) = amplop.pending(id, PendingKind.Split);
        assertFalse(active);
        deposit(id, usd(1000, 0));
        assertEq(amplop.totals(id)[0], usd(250, 0));
    }

    function test_R21_secondSaveReplacesAndRestarts() public {
        uint256 id = registerRaka();
        deposit(id, usd(1000, 0));
        uint64 t0 = amplop.clock(id);
        vm.prank(raka);
        amplop.saveSplit([uint8(10), 10, 10, 60, 10]);
        vm.warp(block.timestamp + 24 hours);
        uint8[5] memory b = [uint8(20), 20, 20, 30, 10];
        vm.expectEmit(address(amplop));
        emit AmplopEnvelopes.SplitSaved(id, b, t0 + 72 hours, false);
        vm.prank(raka);
        amplop.saveSplit(b);

        (bool active, uint64 readyAt, bytes32 data) = amplop.pending(id, PendingKind.Split);
        assertTrue(active);
        assertEq(readyAt, t0 + 72 hours);
        assertEq(uint256(data), uint256(20) | 20 << 8 | 20 << 16 | 30 << 24 | 10 << 32);
        AccountInfo memory info = amplop.accountInfo(id);
        assertEq(info.split[0], 40, "old split still in force");
        assertEq(info.pendingSplit[3], 30);
        assertEq(info.pendingSplitStartsAt, t0 + 72 hours);

        uint256[5] memory before = amplop.totals(id);
        vm.warp(uint256(t0) + 48 hours);
        deposit(id, usd(1000, 0));
        uint256[5] memory mid = amplop.totals(id);
        assertEq(mid[0] - before[0], usd(400, 0), "first save never applies");

        vm.warp(uint256(t0) + 72 hours);
        deposit(id, usd(1000, 0));
        assertEq(amplop.totals(id)[0] - mid[0], usd(200, 0), "second save applies");
    }
}
