import { Buffer } from "node:buffer";
import {
  Connection,
  Keypair,
  Signer,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

// Slippage is defined in bps which means 100 is 1% so we gotta multiply by 100
const getAmountOutJupyter = async (
  tokenA: string,
  tokenB: string,
  amount: number,
  slippage: number
) => {
  const params = new URLSearchParams({
    inputMint: tokenA,
    outputMint: tokenB,
    amount: Number(amount).toFixed(0),
    slippageBps: String(slippage * 100),
  });

  const url = `https://quote-api.jup.ag/v6/quote?${params}`;
  console.log(url);
  let quote = null;
  try {
    quote = await (await fetch(url)).json();
    if (!quote) {
      console.error("unable to quote");
      return null;
    }
  } catch (e) {
    console.log("Error getting amount out", e);
    return null;
  }
  return quote;
};

export const swapJupyter = async (
  privateKey: any,
  tokenA: string,
  tokenB: string,
  amount: number,
  slippage: any
) => {
  console.log("starting swap...");
  console.log(
    "swapping:",
    amount,
    "of",
    tokenA,
    "for token:",
    tokenB,
    "with slippage:",
    slippage
  );

  let txid = null;
  let tokenData = null;
  let amountOut = null;
  let quote = null;

  const wallet: Signer = Keypair.fromSecretKey(bs58.decode(privateKey));
  const rpcUrl = Deno.env.get("SOLANA_RPC_URL");
  const connection = new Connection(rpcUrl!); // The RPC endpoint must be quicknode because chainstack doesn't work

  try {
    quote = {
      inputMint: "8HjiRvPNwFT9jpzAAsYF4rE9y576CKdTkQZXaxibpump",
      inAmount: "690000",
      outputMint: "So11111111111111111111111111111111111111112",
      outAmount: "109",
      otherAmountThreshold: "109",
      swapMode: "ExactIn",
      slippageBps: 50,
      platformFee: null,
      priceImpactPct: "0.0098764760886581041797914231",
      routePlan: [
        {
          swapInfo: {
            ammKey: "3i8Wmd25PDifBiKjMkLELvENjjHiM3mFLUABcMeofWC2",
            label: "Raydium",
            inputMint: "8HjiRvPNwFT9jpzAAsYF4rE9y576CKdTkQZXaxibpump",
            outputMint: "So11111111111111111111111111111111111111112",
            inAmount: "690000",
            outAmount: "109",
            feeAmount: "1725",
            feeMint: "8HjiRvPNwFT9jpzAAsYF4rE9y576CKdTkQZXaxibpump",
          },
          percent: 100,
        },
      ],
      scoreReport: null,
      contextSlot: 315788524,
      timeTaken: 0.130272437,
      swapUsdValue: "0.0000273883721633335734194597",
    };
    // quote = await getAmountOutJupyter(tokenA, tokenB, amount, slippage);
    amountOut = quote.outAmount;
    if (!amountOut) {
      console.log("quote", quote);
      return { ok: false };
    }
  } catch (e) {
    console.log("Error getting quote", e);
    return { ok: false };
  }
  try {
    // get serialized transaction
    const swapResult = await (
      await fetch("https://quote-api.jup.ag/v6/swap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: wallet.publicKey.toString(),
          dynamicComputeUnitLimit: true, // allow dynamic compute limit instead of max 1,400,000
          prioritizationFeeLamports: "auto", // or custom lamports: 1000
        }),
      })
    ).json();
    // submit transaction
    const swapTransactionBuf = Buffer.from(
      swapResult.swapTransaction,
      "base64"
    );
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([wallet]);
    const rawTransaction = transaction.serialize();
    txid = await connection.sendRawTransaction(rawTransaction, {
      maxRetries: 30,
      skipPreflight: false, // If you set this to true, you can skip the next one.
      preflightCommitment: "processed",
    });
    console.log(`https://solscan.io/tx/${txid}`);
    await connection.confirmTransaction(txid);
  } catch (e) {
    console.log("Transaction didnt confirm in 60 seconds (it is still valid)");
    // The transaction may fail because it didn't confirm in 1 minute but 99% of the times it works a bit later
  }

  return {
    txid,
    ok: true,
    solSpent: amount,
    tokensReceived: amountOut,
  };
};
