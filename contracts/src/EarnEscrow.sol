// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract EarnEscrow is EIP712, Ownable, Pausable, ReentrancyGuard {
    using ECDSA for bytes32;

    uint256 public immutable dailyCap;
    uint256 public immutable maxAdsPerDay;
    address public voucherSigner;
    mapping(address => mapping(uint256 => uint256)) public claimedToday;
    mapping(address => mapping(uint256 => uint256)) public adsClaimedToday;
    mapping(address => mapping(uint256 => bool)) public usedNonce;

    bytes32 private constant CLAIM_TYPEHASH =
        keccak256("Claim(address wallet,uint256 amount,uint256 nonce,uint256 day)");

    event Claimed(address indexed wallet, uint256 amount, uint256 nonce, uint256 day);
    event VoucherSignerUpdated(address indexed signer);

    constructor(address initialOwner, address initialSigner, uint256 cap, uint256 adsCap)
        EIP712("KickbacksEarn", "1")
        Ownable(initialOwner)
    {
        require(initialSigner != address(0) && cap > 0 && adsCap > 0, "invalid config");
        voucherSigner = initialSigner;
        dailyCap = cap;
        maxAdsPerDay = adsCap;
    }

    receive() external payable {}

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function claim(uint256 amount, uint256 nonce, uint256 day, bytes calldata signature)
        external
        whenNotPaused
        nonReentrant
    {
        require(day == block.timestamp / 1 days, "wrong day");
        require(!usedNonce[msg.sender][nonce], "nonce used");
        require(amount > 0, "zero amount");
        require(claimedToday[msg.sender][day] + amount <= dailyCap, "daily cap");
        require(adsClaimedToday[msg.sender][day] < maxAdsPerDay, "ad cap");

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(CLAIM_TYPEHASH, msg.sender, amount, nonce, day))
        );
        require(digest.recover(signature) == voucherSigner, "invalid signer");

        usedNonce[msg.sender][nonce] = true;
        claimedToday[msg.sender][day] += amount;
        adsClaimedToday[msg.sender][day] += 1;
        (bool sent,) = payable(msg.sender).call{value: amount}("");
        require(sent, "transfer failed");
        emit Claimed(msg.sender, amount, nonce, day);
    }

    function setVoucherSigner(address signer) external onlyOwner {
        require(signer != address(0), "zero signer");
        voucherSigner = signer;
        emit VoucherSignerUpdated(signer);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
