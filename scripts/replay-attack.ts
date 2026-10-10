import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

const rpc = process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const key = process.env.TEST_WALLET_KEY as `0x${string}`;
const contract = process.env.CONTRACT_ADDRESS as `0x${string}`;
const amount = BigInt(process.env.VOUCHER_AMOUNT ?? "50000000000000000");
const nonce = BigInt(process.env.VOUCHER_NONCE ?? "0");
const day = BigInt(process.env.VOUCHER_DAY ?? Math.floor(Date.now() / 86_400_000));
const signature = process.env.VOUCHER_SIGNATURE as `0x${string}`;
if (!key || !contract || !signature) throw new Error("Set TEST_WALLET_KEY, CONTRACT_ADDRESS, VOUCHER_SIGNATURE");
const account = privateKeyToAccount(key);
const wallet = createWalletClient({ account, chain: monadTestnet, transport: http(rpc) });
const client = createPublicClient({ chain: monadTestnet, transport: http(rpc) });
const abi = parseAbi(["function claim(uint256,uint256,uint256,bytes)"]);
const hash = await wallet.writeContract({ address: contract, abi, functionName: "claim", args: [amount, nonce, day, signature] });
await client.waitForTransactionReceipt({ hash });
console.log("first claim succeeded:", hash);
try {
  await wallet.writeContract({ address: contract, abi, functionName: "claim", args: [amount, nonce, day, signature] });
  console.error("ERROR: replay unexpectedly succeeded");
  process.exitCode = 1;
} catch (error) {
  console.log("replay rejected as expected:", error instanceof Error ? error.message : error);
}
