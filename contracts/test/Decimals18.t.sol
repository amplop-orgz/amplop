// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SplitReleaseTest} from "./rules/SplitRelease.t.sol";
import {CardTest} from "./rules/Card.t.sol";

/// @notice Re-runs the deposit, rounding and card suites with an 18-decimal token (S03-50).
contract SplitRelease18Test is SplitReleaseTest {
    function tokenDecimals() internal pure override returns (uint8) {
        return 18;
    }
}

/// @notice Card suite at 18 decimals.
contract Card18Test is CardTest {
    function tokenDecimals() internal pure override returns (uint8) {
        return 18;
    }
}
