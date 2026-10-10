export const RULES = {
  chainId: 10143,
  maxAdsPerDay: 20,
  maxAdsPerHour: 6,
  minDwellSeconds: 10,
  cooldownSeconds: 10,
  heartbeatSeconds: 5,
  rewardPerAdWei: 50_000_000_000_000_000n,
  dailyCapWei: 1_000_000_000_000_000_000n,
} as const;

export const MONAD_TESTNET = {
  chainId: RULES.chainId,
  rpcUrl: "https://testnet-rpc.monad.xyz",
  explorerUrl: "https://testnet.monadvision.com",
} as const;
