// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "../AmplopBase.t.sol";
import {Vm} from "forge-std/Vm.sol";

/// @notice 08 S08-4: the shared vector file the web app's `splitParts` is also tested against.
contract SplitVectorsTest is AmplopBase {
    function test_DepositMatchesSharedSplitVectors() public {
        string memory json = vm.readFile("../packages/shared/test/vectors/split.json");
        uint256 i = 0;
        for (; vm.keyExistsJson(json, string.concat(".cases[", vm.toString(i), "]")); ++i) {
            string memory c = string.concat(".cases[", vm.toString(i), "]");
            uint256 units = vm.parseJsonUint(json, string.concat(c, ".units"));
            uint256[] memory s = vm.parseJsonUintArray(json, string.concat(c, ".split"));
            uint256[] memory want = vm.parseJsonUintArray(json, string.concat(c, ".parts"));
            uint8[5] memory split;
            for (uint256 e = 0; e < 5; ++e) {
                split[e] = uint8(s[e]);
            }
            uint256 id = register(makeAddr(string.concat("student", vm.toString(i))), split);
            token.mint(treasury, units);
            vm.recordLogs();
            deposit(id, units);
            Vm.Log[] memory logs = vm.getRecordedLogs();
            (, uint256[5] memory parts,) = abi.decode(logs[logs.length - 1].data, (uint256, uint256[5], uint64));
            for (uint256 e = 0; e < 5; ++e) {
                assertEq(parts[e], want[e], string.concat("case ", vm.toString(i)));
            }
        }
        assertEq(i, 9);
    }
}
