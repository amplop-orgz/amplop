// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../AmplopBase.t.sol";

/// @notice Fuzz tests for split, release and Monday maths (S03-57).
contract FuzzMathsTest is AmplopBase {
    function _splitFromSeed(uint8[5] memory seed) internal pure returns (uint8[5] memory s) {
        uint256 left = 20; // twenty steps of 5%
        for (uint256 i = 0; i < 4; ++i) {
            uint256 x = seed[i] % (left + 1);
            s[i] = uint8(x * 5);
            left -= x;
        }
        s[4] = uint8(left * 5);
    }

    function _fund(uint256 amount) internal {
        token.mint(treasury, amount);
    }

    function testFuzz_R4_partsSumToAmount(uint128 amount, uint8[5] memory seed) public {
        amount = uint128(bound(amount, 1, type(uint128).max));
        uint8[5] memory s = _splitFromSeed(seed);
        uint256 id = register(raka, s);
        _fund(amount);
        deposit(id, amount);
        uint256[5] memory t = amplop.totals(id);
        assertEq(t[0] + t[1] + t[2] + t[3] + t[4], amount);
        assertEq(t[0], uint256(amount) * s[0] / 100);
        assertEq(t[1], uint256(amount) * s[1] / 100);
        assertEq(t[2], uint256(amount) * s[2] / 100);
        assertEq(t[4], uint256(amount) * s[4] / 100);
        assertGe(t[3], uint256(amount) * s[3] / 100);
        assertEq(token.balanceOf(address(amplop)), amount);
    }

    function testFuzz_R5_sharesSumToPart(uint128 part) public {
        part = uint128(bound(part, 1, type(uint128).max));
        uint256 id = register(raka, [uint8(0), 0, 0, 100, 0]);
        _fund(part);
        deposit(id, part);
        ScheduleView[] memory s = amplop.schedules(id);
        uint256 base = s[0].base[3];
        uint256 last = uint256(part) - 3 * base;
        assertEq(base, part / 4);
        assertEq(3 * base + last, part);
        assertLt(last - base, 4);
        assertEq(available(id, Envelope.Everyday), base);
        for (uint256 k = 2; k <= 4; ++k) {
            skipToNextMonday(id);
            assertEq(available(id, Envelope.Everyday), k == 4 ? uint256(part) : k * base);
        }
    }

    function testFuzz_mondayMaths(uint64 t) public {
        t = uint64(bound(t, 30 days, 4_000_000_000));
        vm.warp(t);
        uint256 id = registerRaka();
        deposit(id, usd(100, 0));
        uint256 day = t / DAY;
        uint256 weekday = (day + 4) % 7; // Monday = 1
        uint256 toNext = weekday == 1 ? 7 : (8 - weekday) % 7;
        uint256 next = nextRelease(id);
        assertEq(next, day + toNext);
        assertEq((next + 4) % 7, 1, "next release is a Monday");
        // Monday number changes exactly at Monday 00:00: nothing releases one second before.
        uint256 food = available(id, Envelope.Food);
        vm.warp(next * DAY - 1);
        assertEq(available(id, Envelope.Food), food);
        vm.warp(next * DAY);
        assertGt(available(id, Envelope.Food), food);
    }

    function testFuzz_R8_mergeEqualsSeparate(uint128 a, uint128 b) public {
        a = uint128(bound(a, 1, type(uint128).max / 4));
        b = uint128(bound(b, 1, type(uint128).max / 4));
        uint256 id = registerRaka();
        _fund(uint256(a) + b);
        deposit(id, a);
        vm.warp(block.timestamp + 1 days); // Thursday, same week as START
        deposit(id, b);
        assertEq(amplop.schedules(id).length, 1);
        for (uint256 k = 1; k <= 4; ++k) {
            if (k > 1) skipToNextMonday(id);
            for (uint256 e = 0; e < 4; ++e) {
                assertEq(views(id)[e].available, _ref(a, e, k) + _ref(b, e, k));
            }
        }
    }

    function _ref(uint256 amount, uint256 e, uint256 k) internal view returns (uint256) {
        uint256 part = e == 3
            ? amount - amount * 40 / 100 - 2 * (amount * 15 / 100) - amount * 10 / 100
            : amount * sampleSplit[e] / 100;
        return k == 4 ? part : k * (part / 4);
    }
}
