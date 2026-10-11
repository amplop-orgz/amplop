// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MockERC20} from "./MockERC20.sol";

/// @notice Burns 1% of every transfer, so the receiver gets less than the amount.
contract FeeOnTransferERC20 is MockERC20 {
    constructor() MockERC20("Fee token", "FEE", 6) {}

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0), fee);
            value -= fee;
        }
        super._update(from, to, value);
    }
}
