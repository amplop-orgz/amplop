// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MockERC20} from "../mocks/MockERC20.sol";

/// @notice Mock AUSD that records every transfer out of a watched address (invariant 4).
contract LoggingERC20 is MockERC20 {
    address public watched;
    address public allowedRecipient;
    uint256 public outCount;
    uint256 public badOutCount;
    uint256 public outTotal;

    constructor(uint8 decimals_) MockERC20("AUSD test stand-in", "AUSD", decimals_) {}

    function watch(address watched_, address allowedRecipient_) external {
        watched = watched_;
        allowedRecipient = allowedRecipient_;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == watched && from != address(0)) {
            ++outCount;
            outTotal += value;
            if (to != allowedRecipient) ++badOutCount;
        }
        super._update(from, to, value);
    }
}
