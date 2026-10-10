// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EarnEscrow} from "../src/EarnEscrow.sol";

contract EarnEscrowTest is Test {
    EarnEscrow escrow;
    uint256 signerKey = 0xA11CE;
    address signer;
    address user = address(0xBEEF);
    uint256 constant CAP = 1 ether;

    function setUp() public {
        signer = vm.addr(signerKey);
        escrow = new EarnEscrow(address(this), signer, CAP, 20);
        vm.deal(address(escrow), 100 ether);
    }

    function voucher(uint256 amount, uint256 nonce, uint256 day, uint256 key)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Claim(address wallet,uint256 amount,uint256 nonce,uint256 day)"),
                user, amount, nonce, day
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", escrow.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function testValidClaim() public {
        uint256 day = block.timestamp / 1 days;
        bytes memory sig = voucher(0.05 ether, 1, day, signerKey);
        uint256 beforeBalance = user.balance;
        vm.prank(user);
        escrow.claim(0.05 ether, 1, day, sig);
        assertEq(user.balance, beforeBalance + 0.05 ether);
    }

    function testReplayRejected() public {
        uint256 day = block.timestamp / 1 days;
        bytes memory sig = voucher(0.05 ether, 1, day, signerKey);
        vm.prank(user);
        escrow.claim(0.05 ether, 1, day, sig);
        vm.prank(user);
        vm.expectRevert("nonce used");
        escrow.claim(0.05 ether, 1, day, sig);
    }

    function testWrongSignerRejected() public {
        uint256 day = block.timestamp / 1 days;
        bytes memory sig = voucher(0.05 ether, 1, day, 0xBAD);
        vm.prank(user);
        vm.expectRevert("invalid signer");
        escrow.claim(0.05 ether, 1, day, sig);
    }

    function testCapRejected() public {
        uint256 day = block.timestamp / 1 days;
        bytes memory sig = voucher(1.01 ether, 1, day, signerKey);
        vm.prank(user);
        vm.expectRevert("daily cap");
        escrow.claim(1.01 ether, 1, day, sig);
    }

    function testWrongDayRejected() public {
        uint256 day = block.timestamp / 1 days;
        bytes memory sig = voucher(0.05 ether, 1, day + 1, signerKey);
        vm.prank(user);
        vm.expectRevert("wrong day");
        escrow.claim(0.05 ether, 1, day + 1, sig);
    }

    function testPausedRejected() public {
        escrow.pause();
        uint256 day = block.timestamp / 1 days;
        bytes memory sig = voucher(0.05 ether, 1, day, signerKey);
        vm.prank(user);
        vm.expectRevert();
        escrow.claim(0.05 ether, 1, day, sig);
    }
}
