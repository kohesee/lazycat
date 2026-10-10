type Address = `0x${string}`;
type Hex = `0x${string}`;

export const EIP712_NAME = "KickbacksEarn";
export const EIP712_VERSION = "1";

export const claimTypes = {
  Claim: [
    { name: "wallet", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "day", type: "uint256" },
  ],
} as const;

export type ClaimMessage = {
  wallet: Address;
  amount: bigint;
  nonce: bigint;
  day: bigint;
};

export function claimDomain(chainId: number, verifyingContract: Address) {
  return {
    name: EIP712_NAME,
    version: EIP712_VERSION,
    chainId,
    verifyingContract,
  } as const;
}

export type Voucher = ClaimMessage & { signature: Hex };
