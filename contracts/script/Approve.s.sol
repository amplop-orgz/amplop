// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AmplopEnvelopes} from "../src/AmplopEnvelopes.sol";
import {DeployBase} from "./Deploy.s.sol";

/// @title Approve
/// @author Amplop
/// @notice Sets the Treasury and Settlement allowances for the deployed contract and revokes the old one (S04-9, S04-10).
/// @dev Reads the contract address from deployments/<chain>.json. Keys come from the deploying shell only.
contract Approve is DeployBase {
    /// @notice Entry point for `forge script script/Approve.s.sol:Approve`.
    function run() external {
        string memory file = block.chainid == 10_143 ? "monad-testnet.json" : "anvil.json";
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/../deployments/", file));
        AmplopEnvelopes amplop = AmplopEnvelopes(vm.parseJsonAddress(json, ".address"));
        IERC20 token = amplop.token();
        uint256 treasuryPk = vm.envUint("TREASURY_PRIVATE_KEY");
        uint256 settlementPk = vm.envUint("SETTLEMENT_PRIVATE_KEY");
        if (vm.addr(treasuryPk) != amplop.treasury()) revert DeployCheck("TREASURY_PRIVATE_KEY is not the treasury");
        if (vm.addr(settlementPk) != amplop.settlement()) {
            revert DeployCheck("SETTLEMENT_PRIVATE_KEY is not the settlement wallet");
        }

        setAllowance(treasuryPk, token, address(amplop), type(uint256).max);
        setAllowance(settlementPk, token, address(amplop), type(uint256).max);

        address old = vm.envOr("OLD_CONTRACT_ADDRESS", address(0));
        if (old != address(0)) {
            setAllowance(treasuryPk, token, old, 0);
            setAllowance(settlementPk, token, old, 0);
        }
    }
}
