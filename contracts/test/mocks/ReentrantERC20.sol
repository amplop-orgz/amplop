// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {MockERC20} from "./MockERC20.sol";

/// @notice Calls back into a target during transfers, to prove the reentrancy guard holds.
contract ReentrantERC20 is MockERC20 {
    address public target;
    bytes public payload;

    constructor() MockERC20("Reentrant", "RE", 6) {}

    function arm(address target_, bytes calldata payload_) external {
        target = target_;
        payload = payload_;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        address t = target;
        if (t != address(0) && from != address(0) && to != address(0)) {
            target = address(0);
            (bool ok, bytes memory ret) = t.call(payload);
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
    }
}
