// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AmplopEnvelopes} from "../src/AmplopEnvelopes.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {DeployBase, DeployInputs} from "./Deploy.s.sol";

/// @title LocalSetup
/// @author Amplop
/// @notice Builds the full local chain on Anvil: mock AUSD, contract, approvals (S04-7).
/// @dev Anvil default accounts: 0 deployer, 1 Treasury, 2 Card service, 3 Settlement, 4 Fee sponsor (01 section 9).
contract LocalSetup is DeployBase {
    // Anvil's public default mnemonic; these keys hold test MON only.
    string internal constant ANVIL_MNEMONIC = "test test test test test test test test test test test junk";

    /// @notice Entry point. DEMO_MODE defaults to true; false builds the K4 demo-off chain.
    /// @return token Mock AUSD.
    /// @return amplop The contract.
    function run() external returns (MockERC20 token, AmplopEnvelopes amplop) {
        return build(vm.envOr("DEMO_MODE", true));
    }

    /// @notice Deploys and wires everything with the given demo switch.
    /// @param demoMode Demo switch for the contract.
    /// @return token Mock AUSD.
    /// @return amplop The contract.
    function build(bool demoMode) public returns (MockERC20 token, AmplopEnvelopes amplop) {
        uint256 deployerPk = vm.deriveKey(ANVIL_MNEMONIC, 0);
        uint256 treasuryPk = vm.deriveKey(ANVIL_MNEMONIC, 1);
        uint256 settlementPk = vm.deriveKey(ANVIL_MNEMONIC, 3);
        DeployInputs memory i = DeployInputs({
            token: address(0),
            settlement: vm.addr(settlementPk),
            treasury: vm.addr(treasuryPk),
            cardService: vm.addr(vm.deriveKey(ANVIL_MNEMONIC, 2)),
            demoMode: demoMode,
            demoModeSet: true,
            finalDeploy: false
        });

        vm.startBroadcast(deployerPk);
        token = new MockERC20("AUSD test stand-in", "AUSD", 6);
        token.mint(i.treasury, 1_000_000e6);
        token.mint(i.settlement, 10_000e6);
        i.token = address(token);
        preflight(i, vm.addr(deployerPk));
        amplop = deployAmplop(i);
        vm.stopBroadcast();
        readBack(amplop, i);

        setAllowance(treasuryPk, IERC20(address(token)), address(amplop), type(uint256).max);
        setAllowance(settlementPk, IERC20(address(token)), address(amplop), type(uint256).max);
    }
}
