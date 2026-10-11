// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {AmplopEnvelopes} from "../src/AmplopEnvelopes.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {Deploy, DeployBase, DeployInputs} from "../script/Deploy.s.sol";
import {LocalSetup} from "../script/LocalSetup.s.sol";

/// @notice Deploy and LocalSetup scripts run in-process (S04-8).
contract DeployTest is Test {
    MockERC20 internal token;
    address internal settlement = makeAddr("settlement");
    address internal treasury = makeAddr("treasury");
    address internal cardService = makeAddr("cardService");

    function setUp() public {
        token = new MockERC20("AUSD test stand-in", "AUSD", 6);
    }

    function _inputs() internal view returns (DeployInputs memory) {
        return DeployInputs(address(token), settlement, treasury, cardService, true, true, false);
    }

    function test_DEPLOY_readBacksMatchInputs() public {
        // The only test that sets env, so parallel tests never see it change under them.
        vm.setEnv("AUSD_ADDRESS", vm.toString(address(token)));
        vm.setEnv("SETTLEMENT_ADDRESS", vm.toString(settlement));
        vm.setEnv("TREASURY_ADDRESS", vm.toString(treasury));
        vm.setEnv("CARD_SERVICE_ADDRESS", vm.toString(cardService));
        AmplopEnvelopes a = new Deploy().run();
        assertEq(address(a.token()), address(token));
        assertEq(a.settlement(), settlement);
        assertEq(a.treasury(), treasury);
        assertEq(a.cardService(), cardService);
        assertTrue(a.demoMode());
        assertEq(a.tokenDecimals(), 6);

        (MockERC20 t, AmplopEnvelopes local) = new LocalSetup().build(true);
        assertEq(t.allowance(local.treasury(), address(local)), type(uint256).max);
        assertEq(t.allowance(local.settlement(), address(local)), type(uint256).max);
        assertEq(t.balanceOf(local.treasury()), 1_000_000e6);
        assertEq(t.balanceOf(local.settlement()), 10_000e6);
    }

    function test_DEPLOY_preflightRejectsBadInputs() public {
        Deploy d = new Deploy();
        d.preflight(_inputs(), address(this)); // good inputs pass

        DeployInputs memory i = _inputs();
        i.settlement = address(0);
        vm.expectRevert(abi.encodeWithSelector(DeployBase.DeployCheck.selector, "settlement address is zero"));
        d.preflight(i, address(this));

        i = _inputs();
        i.token = makeAddr("noCode");
        vm.expectRevert(abi.encodeWithSelector(DeployBase.DeployCheck.selector, "token has no code"));
        d.preflight(i, address(this));

        i = _inputs();
        i.cardService = treasury;
        i.finalDeploy = true;
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployBase.DeployCheck.selector, "treasury and card service must differ on the final deploy"
            )
        );
        d.preflight(i, address(this));

        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(DeployBase.DeployCheck.selector, "chain id must be 10143 or 31337"));
        d.preflight(_inputs(), address(this));

        vm.chainId(10_143);
        i = _inputs();
        i.demoModeSet = false;
        vm.expectRevert(
            abi.encodeWithSelector(DeployBase.DeployCheck.selector, "DEMO_MODE must be set explicitly on 10143")
        );
        d.preflight(i, address(this));
    }

    function test_DEPLOY_localSetupDemoOff() public {
        (, AmplopEnvelopes a) = new LocalSetup().build(false);
        assertFalse(a.demoMode());
        address student = makeAddr("student");
        vm.prank(student);
        a.register([uint8(40), 15, 15, 20, 10]);
        vm.prank(student);
        vm.expectRevert(AmplopEnvelopes.DemoOff.selector);
        a.skipDays(1);
    }
}
