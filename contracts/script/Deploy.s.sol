// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/* solhint-disable no-console */
// Deploy scripts report to the operator through the console; the contract itself never logs.

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {AmplopEnvelopes} from "../src/AmplopEnvelopes.sol";

/// @notice Constructor inputs and deploy-time switches (S04-1).
struct DeployInputs {
    address token;
    address settlement;
    address treasury;
    address cardService;
    bool demoMode;
    bool demoModeSet;
    bool finalDeploy;
}

/// @title DeployBase
/// @author Amplop
/// @notice Shared deploy, read-back and approval steps for Deploy, LocalSetup and Approve (spec 04).
abstract contract DeployBase is Script {
    /// @notice A pre-flight or read-back check failed.
    /// @param reason What failed.
    error DeployCheck(string reason);

    uint256 internal constant RESERVE = 10 ether; // Monad reserve balance (S04-15)
    uint256 internal constant DEPLOY_GAS_ESTIMATE = 5_000_000;

    /// @notice S04-4 pre-flight checks. Reverts with a clear reason when one fails.
    /// @param i Inputs.
    /// @param deployer Address that will send the deploy transaction.
    function preflight(DeployInputs memory i, address deployer) public view {
        if (block.chainid != 10_143 && block.chainid != 31_337) revert DeployCheck("chain id must be 10143 or 31337");
        if (i.token == address(0)) revert DeployCheck("token address is zero");
        if (i.settlement == address(0)) revert DeployCheck("settlement address is zero");
        if (i.treasury == address(0)) revert DeployCheck("treasury address is zero");
        if (i.cardService == address(0)) revert DeployCheck("card service address is zero");
        if (i.token.code.length == 0) revert DeployCheck("token has no code");
        try IERC20Metadata(i.token).decimals() returns (uint8 d) {
            console2.log("token decimals:", d);
            if (d != 6) console2.log("WARNING: token decimals is not 6 (AUSD is expected to use 6)");
        } catch {
            revert DeployCheck("token decimals() reverts");
        }
        if (i.treasury == i.cardService) {
            if (i.finalDeploy) revert DeployCheck("treasury and card service must differ on the final deploy");
            console2.log("WARNING: treasury and card service are the same wallet (allowed only in the first days)");
        }
        if (block.chainid == 10_143) {
            if (!i.demoModeSet) revert DeployCheck("DEMO_MODE must be set explicitly on 10143");
            if (deployer.balance <= RESERVE + DEPLOY_GAS_ESTIMATE * tx.gasprice) {
                revert DeployCheck("deployer balance must exceed 10 MON plus the deploy cost");
            }
        }
    }

    /// @notice Deploys with the inputs in 01 section 3 order. Call inside a broadcast.
    /// @param i Inputs.
    /// @return a The deployed contract.
    function deployAmplop(DeployInputs memory i) internal returns (AmplopEnvelopes a) {
        a = new AmplopEnvelopes(IERC20(i.token), i.settlement, i.treasury, i.cardService, i.demoMode);
    }

    /// @notice S04-5 read-back: every getter must equal its input.
    /// @param a The deployed contract.
    /// @param i Inputs.
    function readBack(AmplopEnvelopes a, DeployInputs memory i) public view {
        if (address(a.token()) != i.token) revert DeployCheck("token() read-back differs");
        if (a.settlement() != i.settlement) revert DeployCheck("settlement() read-back differs");
        if (a.treasury() != i.treasury) revert DeployCheck("treasury() read-back differs");
        if (a.cardService() != i.cardService) revert DeployCheck("cardService() read-back differs");
        if (a.demoMode() != i.demoMode) revert DeployCheck("demoMode() read-back differs");
        if (a.tokenDecimals() != IERC20Metadata(i.token).decimals()) revert DeployCheck("tokenDecimals() differs");
        console2.log("AmplopEnvelopes:", address(a));
    }

    /// @notice S04-9 / S04-10: sets an allowance from the key's wallet and reads it back.
    /// @param pk Private key of the approving wallet.
    /// @param token Token.
    /// @param spender Contract.
    /// @param amount Allowance to set (max, or 0 to revoke).
    function setAllowance(uint256 pk, IERC20 token, address spender, uint256 amount) internal {
        vm.startBroadcast(pk);
        token.approve(spender, amount);
        vm.stopBroadcast();
        if (token.allowance(vm.addr(pk), spender) != amount) revert DeployCheck("allowance read-back differs");
    }
}

/// @title Deploy
/// @author Amplop
/// @notice Deploys AmplopEnvelopes to Monad testnet or a running Anvil (S04-4 to S04-6).
contract Deploy is DeployBase {
    /// @notice Reads S04-1 inputs from the environment.
    /// @return i Inputs.
    function readEnv() public view returns (DeployInputs memory i) {
        i.token = vm.envAddress("AUSD_ADDRESS");
        i.settlement = vm.envAddress("SETTLEMENT_ADDRESS");
        i.treasury = vm.envAddress("TREASURY_ADDRESS");
        i.cardService = vm.envAddress("CARD_SERVICE_ADDRESS");
        i.demoModeSet = vm.envExists("DEMO_MODE");
        i.demoMode = vm.envOr("DEMO_MODE", block.chainid == 31_337);
        i.finalDeploy = vm.envOr("FINAL_DEPLOY", false);
    }

    /// @notice Entry point for `forge script script/Deploy.s.sol:Deploy`.
    /// @return a The deployed contract.
    function run() external returns (AmplopEnvelopes a) {
        DeployInputs memory i = readEnv();
        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        preflight(i, deployer);
        a = deployAmplop(i);
        vm.stopBroadcast();
        readBack(a, i);
    }
}
