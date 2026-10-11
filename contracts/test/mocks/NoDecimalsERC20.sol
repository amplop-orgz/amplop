// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice A token whose decimals() reverts.
contract NoDecimalsERC20 {
    function decimals() external pure returns (uint8) {
        revert("no decimals");
    }
}
