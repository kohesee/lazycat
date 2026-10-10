// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {EarnEscrow} from "../src/EarnEscrow.sol";

contract Deploy is Script {
    function run() external returns (EarnEscrow escrow) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address signer = vm.envAddress("VOUCHER_SIGNER");
        uint256 cap = vm.envUint("DAILY_CAP");
        uint256 adsCap = vm.envUint("MAX_ADS_PER_DAY");
        vm.startBroadcast(deployerKey);
        escrow = new EarnEscrow(vm.addr(deployerKey), signer, cap, adsCap);
        vm.stopBroadcast();
        console2.log("EarnEscrow", address(escrow));
    }
}
