import { Buffer } from "node:buffer";
import { config } from "../config.ts";
import { JupiterApi } from "../services/dex/jupiter/api.ts";
import { QuoteResponse } from "../services/dex/jupiter/types.ts";
import { HeliusApi } from "../services/helius/api.ts";
import {
  createSellTransactionResponse,
  HoldingRecord,
  MintsDataReponse,
  NewTokenRecord,
  SerializedQuoteResponse,
  SwapEventDetailsResponse,
} from "./types/Tracker.ts";
import { LAMPORTS_PER_SOL, VersionedTransaction } from "@solana/web3.js";
import { SolanaWallet } from "../services/solana/wallet.ts";
import { RugCheckApi } from "../services/rugcheck/api.ts";
import { TrackerService } from "../services/db/DBTrackerService.ts";
import { BigDenary } from "https://deno.land/x/bigdenary@1.0.0/mod.ts";

export class Transactions {
  private readonly jupiterApi = new JupiterApi();
  private readonly heliusApi = new HeliusApi();
  private readonly rugCheckApi = new RugCheckApi();
  private readonly db = new TrackerService();

  constructor(private readonly wallet: SolanaWallet) {}

  async fetchTransactionDetails(
    signature: string
  ): Promise<MintsDataReponse | null> {
    // Set function constants
    const maxRetries = config.tx.fetch_tx_max_retries;
    let retryCount = 0;

    // Add longer initial delay to allow transaction to be processed
    console.log(
      "Waiting " +
        config.tx.fetch_tx_initial_delay / 1000 +
        " seconds for transaction to be confirmed..."
    );
    await new Promise((resolve) =>
      setTimeout(resolve, config.tx.fetch_tx_initial_delay)
    );

    while (retryCount < maxRetries) {
      try {
        // Output logs
        console.log(
          `Attempt ${
            retryCount + 1
          } of ${maxRetries} to fetch transaction details...`
        );

        const response = await this.heliusApi.transactions([signature]);

        // Verify if a response was received
        if (!response.data) {
          throw new Error("No response data received");
        }

        // Verify if the response was in the correct format and not empty
        if (!Array.isArray(response.data) || response.data.length === 0) {
          throw new Error("Response data array is empty");
        }

        // Access the `data` property which contains the array of transactions
        const transactions = response.data;

        // Verify if transaction details were found
        if (!transactions[0]) {
          throw new Error("Transaction not found");
        }

        // Access the `instructions` property which contains account instructions
        const instructions = transactions[0].instructions;
        if (
          !instructions ||
          !Array.isArray(instructions) ||
          instructions.length === 0
        ) {
          throw new Error("No instructions found in transaction");
        }

        // Verify and find the instructions for the correct market maker id
        const instruction = instructions.find(
          (ix) => ix.programId === config.liquidity_pool.radiyum_program_id
        );
        if (!instruction || !instruction.accounts) {
          throw new Error("No market maker instruction found");
        }
        if (
          !Array.isArray(instruction.accounts) ||
          instruction.accounts.length < 10
        ) {
          throw new Error("Invalid accounts array in instruction");
        }

        // Store quote and token mints
        const accountOne = instruction.accounts[8];
        const accountTwo = instruction.accounts[9];

        // Verify if we received both quote and token mints
        if (!accountOne || !accountTwo) {
          throw new Error("Required accounts not found");
        }

        // Set new token and SOL mint
        let solTokenAccount = "";
        let newTokenAccount = "";
        if (accountOne === config.liquidity_pool.wsol_pc_mint) {
          solTokenAccount = accountOne;
          newTokenAccount = accountTwo;
        } else {
          solTokenAccount = accountTwo;
          newTokenAccount = accountOne;
        }

        // Output logs
        console.log("Successfully fetched transaction details!");
        console.log(`SOL Token Account: ${solTokenAccount}`);
        console.log(`New Token Account: ${newTokenAccount}`);

        const displayData: MintsDataReponse = {
          tokenMint: newTokenAccount,
          solMint: solTokenAccount,
        };

        return displayData;
      } catch (error) {
        console.log(`Attempt ${retryCount + 1} failed:`, error);

        retryCount++;

        if (retryCount < maxRetries) {
          const delay = Math.min(4000 * Math.pow(1.5, retryCount), 15000);
          console.log(`Waiting ${delay / 1000} seconds before next attempt...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    console.log("All attempts to fetch transaction details failed");
    return null;
  }

  async createSwapTransaction(
    solMint: string,
    tokenMint: string
  ): Promise<string | null> {
    let quoteResponseData: QuoteResponse | null = null;
    let serializedQuoteResponseData: SerializedQuoteResponse | null = null;

    // Get Swap Quote
    let retryCount = 0;
    while (retryCount < config.swap.token_not_tradable_400_error_retries) {
      try {
        // Request a quote in order to swap SOL for new token
        const quoteResponse = await this.jupiterApi.getQuote({
          inputMint: solMint,
          outputMint: tokenMint,
          amount: config.swap.amount,
          slippageBps: config.swap.slippageBps,
        });

        if (!quoteResponse.data) return null;

        if (config.swap.verbose_log && config.swap.verbose_log === true) {
          console.log("\nVerbose log:");
          console.log(quoteResponse.data);
        }

        quoteResponseData = quoteResponse.data; // Store the successful response
        break;
      } catch (error: any) {
        // Retry when error is TOKEN_NOT_TRADABLE
        if (error.response && error.response.status === 400) {
          const errorData = error.response.data;
          if (errorData.errorCode === "TOKEN_NOT_TRADABLE") {
            retryCount++;
            await new Promise((resolve) =>
              setTimeout(
                resolve,
                config.swap.token_not_tradable_400_error_delay
              )
            );
            continue; // Retry
          }
        }

        // Throw error (null) when error is not TOKEN_NOT_TRADABLE
        console.error(
          "Error while requesting a new swap quote:",
          error.message
        );
        if (config.swap.verbose_log && config.swap.verbose_log === true) {
          console.log("Verbose Error Message:");
          if (error.response) {
            // Server responded with a status other than 2xx
            console.error("Error Status:", error.response.status);
            console.error("Error Status Text:", error.response.statusText);
            console.error("Error Data:", error.response.data); // API error message
            console.error("Error Headers:", error.response.headers);
          } else if (error.request) {
            // Request was made but no response was received
            console.error("No Response:", error.request);
          } else {
            // Other errors
            console.error("Error Message:", error.message);
          }
        }
        return null;
      }
    }

    if (quoteResponseData) console.log("✅ Swap quote recieved.");

    // Serialize the quote into a swap transaction that can be submitted on chain
    try {
      if (!quoteResponseData) return null;

      const swapResponse = await this.jupiterApi.swapTransaction({
        quoteResponse: quoteResponseData,
        // user public key to be used for the swap
        userPublicKey: this.wallet.getPublicKey() ?? "",
      });
      if (!swapResponse.data) return null;

      if (config.swap.verbose_log && config.swap.verbose_log === true) {
        console.log(swapResponse.data);
      }

      serializedQuoteResponseData = swapResponse.data; // Store the successful response
    } catch (error: any) {
      console.error("Error while sending the swap quote:", error.message);
      if (config.swap.verbose_log && config.swap.verbose_log === true) {
        console.log("Verbose Error Message:");
        if (error.response) {
          // Server responded with a status other than 2xx
          console.error("Error Status:", error.response.status);
          console.error("Error Status Text:", error.response.statusText);
          console.error("Error Data:", error.response.data); // API error message
          console.error("Error Headers:", error.response.headers);
        } else if (error.request) {
          // Request was made but no response was received
          console.error("No Response:", error.request);
        } else {
          // Other errors
          console.error("Error Message:", error.message);
        }
      }
      return null;
    }

    if (serializedQuoteResponseData) console.log("✅ Swap quote serialized.");

    // deserialize, sign and send the transaction
    try {
      if (!serializedQuoteResponseData) return null;
      const swapTransactionBuf = Buffer.from(
        serializedQuoteResponseData.swapTransaction,
        "base64"
      );
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      // sign the transaction
      transaction.sign([this.wallet.getSigner()]);

      // get the latest block hash
      const latestBlockHash = await this.wallet.connection.getLatestBlockhash();

      // Execute the transaction
      const rawTransaction = transaction.serialize();
      const txid = await this.wallet.sendTransaction(rawTransaction);

      // Return null when no tx was returned
      if (!txid) {
        console.log("🚫 No id received for sent raw transaction.");
        return null;
      }

      if (txid) console.log("✅ Raw transaction id received.");

      // Fetch the current status of a transaction signature (processed, confirmed, finalized).
      const conf = await this.wallet.connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: txid,
      });

      if (txid) console.log("🔎 Checking transaction confirmation ...");

      // Return null when an error occured when confirming the transaction
      if (conf.value.err || conf.value.err !== null) {
        console.log("🚫 Transaction confirmation failed.");
        return null;
      }

      return txid;
    } catch (error: any) {
      console.error(
        "Error while signing and sending the transaction:",
        error.message
      );
      if (config.swap.verbose_log && config.swap.verbose_log === true) {
        console.log("Verbose Error Message:");
        if (error.response) {
          // Server responded with a status other than 2xx
          console.error("Error Status:", error.response.status);
          console.error("Error Status Text:", error.response.statusText);
          console.error("Error Data:", error.response.data); // API error message
          console.error("Error Headers:", error.response.headers);
        } else if (error.request) {
          // Request was made but no response was received
          console.error("No Response:", error.request);
        } else {
          // Other errors
          console.error("Error Message:", error.message);
        }
      }
      return null;
    }
  }

  async getRugCheckConfirmed(tokenMint: string): Promise<boolean> {
    const rugResponse = await this.rugCheckApi.tokens(tokenMint);

    if (!rugResponse.data) return false;

    if (config.rug_check.verbose_log && config.rug_check.verbose_log === true) {
      console.log(rugResponse.data);
    }

    // Extract information
    const tokenReport = rugResponse.data;
    const tokenCreator = tokenReport.creator ? tokenReport.creator : tokenMint;
    const mintAuthority = tokenReport.token.mintAuthority;
    const freezeAuthority = tokenReport.token.freezeAuthority;
    const isInitialized = tokenReport.token.isInitialized;
    const tokenName = tokenReport.tokenMeta.name;
    const tokenSymbol = tokenReport.tokenMeta.symbol;
    const tokenMutable = tokenReport.tokenMeta.mutable;
    let topHolders = tokenReport.topHolders;
    const marketsLength = tokenReport.markets ? tokenReport.markets.length : 0;
    const totalLPProviders = tokenReport.totalLPProviders;
    const totalMarketLiquidity = tokenReport.totalMarketLiquidity;
    const isRugged = tokenReport.rugged;
    const rugScore = tokenReport.score;
    const rugRisks = tokenReport.risks
      ? tokenReport.risks
      : [
          {
            name: "Good",
            value: "",
            description: "",
            score: 0,
            level: "good",
          },
        ];

    // Update topholders if liquidity pools are excluded
    if (config.rug_check.exclude_lp_from_topholders) {
      // local types
      type Market = {
        liquidityA?: string;
        liquidityB?: string;
      };

      const markets: Market[] | undefined = tokenReport.markets;
      if (markets) {
        // Safely extract liquidity addresses from markets
        const liquidityAddresses: string[] = (markets ?? [])
          .flatMap((market) => [market.liquidityA, market.liquidityB])
          .filter((address): address is string => !!address);

        // Filter out topHolders that match any of the liquidity addresses
        topHolders = topHolders.filter(
          (holder) => !liquidityAddresses.includes(holder.address)
        );
      }
    }

    // Get config
    const rugCheckConfig = config.rug_check;
    const rugCheckLegacy = rugCheckConfig.legacy_not_allowed;

    // Set conditions
    const conditions = [
      {
        check: !rugCheckConfig.allow_mint_authority && mintAuthority !== null,
        message: "🚫 Mint authority should be null",
      },
      {
        check: !rugCheckConfig.allow_not_initialized && !isInitialized,
        message: "🚫 Token is not initialized",
      },
      {
        check:
          !rugCheckConfig.allow_freeze_authority && freezeAuthority !== null,
        message: "🚫 Freeze authority should be null",
      },
      {
        check: !rugCheckConfig.allow_mutable && tokenMutable !== false,
        message: "🚫 Mutable should be false",
      },
      {
        check:
          !rugCheckConfig.allow_insider_topholders &&
          topHolders.some((holder) => holder.insider),
        message: "🚫 Insider accounts should not be part of the top holders",
      },
      {
        check: topHolders.some(
          (holder) => holder.pct > rugCheckConfig.max_alowed_pct_topholders
        ),
        message:
          "🚫 An individual top holder cannot hold more than the allowed percentage of the total supply",
      },
      {
        check: totalLPProviders < rugCheckConfig.min_total_lp_providers,
        message: "🚫 Not enough LP Providers.",
      },
      {
        check: marketsLength < rugCheckConfig.min_total_markets,
        message: "🚫 Not enough Markets.",
      },
      {
        check: totalMarketLiquidity < rugCheckConfig.min_total_market_Liquidity,
        message: "🚫 Not enough Market Liquidity.",
      },
      {
        check: !rugCheckConfig.allow_rugged && isRugged, //true
        message: "🚫 Token is rugged",
      },
      {
        check: rugCheckConfig.block_symbols.includes(tokenSymbol),
        message: "🚫 Symbol is blocked",
      },
      {
        check: rugCheckConfig.block_names.includes(tokenName),
        message: "🚫 Name is blocked",
      },
      {
        check:
          rugScore > rugCheckConfig.max_score && rugCheckConfig.max_score !== 0,
        message: "🚫 Rug score to high.",
      },
      {
        check: rugRisks.some((risk) => rugCheckLegacy.includes(risk.name)),
        message: "🚫 Token has legacy risks that are not allowed.",
      },
    ];

    // If tracking duplicate tokens is enabled
    if (
      config.rug_check.block_returning_token_names ||
      config.rug_check.block_returning_token_creators
    ) {
      // Get duplicates based on token min and creator
      const duplicate = await this.db.findTokensByNameOrCreator(
        tokenName,
        tokenCreator
      );

      // Verify if duplicate token or creator was returned
      if (duplicate.length !== 0) {
        if (
          config.rug_check.block_returning_token_names &&
          duplicate.some((token) => token.name === tokenName)
        ) {
          console.log("🚫 Token with this name was already created");
          return false;
        }
        if (
          config.rug_check.block_returning_token_creators &&
          duplicate.some((token) => token.creator === tokenCreator)
        ) {
          console.log("🚫 Token from this creator was already created");
          return false;
        }
      }
    }

    // Create new token record
    const newToken: NewTokenRecord = {
      time: Date.now(),
      mint: tokenMint,
      name: tokenName,
      creator: tokenCreator,
    };
    await this.db.insertNewToken(newToken).catch((err) => {
      if (
        config.rug_check.block_returning_token_names ||
        config.rug_check.block_returning_token_creators
      ) {
        console.log(
          "⛔ Unable to store new token for tracking duplicate tokens: " + err
        );
      }
    });

    //Validate conditions
    for (const condition of conditions) {
      if (condition.check) {
        console.log(condition.message);
        return false;
      }
    }

    return true;
  }

  async fetchAndSaveSwapDetails(tx: string): Promise<boolean> {
    try {
      const response = await this.heliusApi.transactions([tx]);

      // Verify if we received tx reponse data
      if (!response.data || response.data.length === 0) {
        console.log(
          "⛔ Could not fetch swap details: No response received from API."
        );
        return false;
      }

      // Safely access the event information
      const transactions = response.data;
      const swapTransactionData: SwapEventDetailsResponse = {
        programInfo: transactions[0]?.events.swap.innerSwaps[0].programInfo,
        tokenInputs: transactions[0]?.events.swap.innerSwaps[0].tokenInputs,
        tokenOutputs: transactions[0]?.events.swap.innerSwaps[0].tokenOutputs,
        fee: transactions[0]?.fee,
        slot: transactions[0]?.slot,
        timestamp: transactions[0]?.timestamp,
        description: transactions[0]?.description,
      };

      // Get latest Sol Price
      const solMint = config.liquidity_pool.wsol_pc_mint;
      const priceResponse = await this.jupiterApi.getPrice(solMint);

      // Verify if we received the price response data
      if (!priceResponse.data.data[solMint]?.price) return false;

      // Calculate estimated price paid in sol
      const solUsdcPrice = priceResponse.data.data[solMint]?.price;
      const solPaidUsdc = new BigDenary(
        swapTransactionData.tokenInputs[0].tokenAmount
      ).multipliedBy(solUsdcPrice);
      const solFeePaidUsdc = new BigDenary(swapTransactionData.fee)
        .dividedBy(LAMPORTS_PER_SOL)
        .multipliedBy(solUsdcPrice);
      const perTokenUsdcPrice = solPaidUsdc.dividedBy(
        swapTransactionData.tokenOutputs[0].tokenAmount
      );

      // Get token meta data
      let tokenName = "N/A";
      const tokenData: NewTokenRecord[] = await this.db.findTokenByMint(
        swapTransactionData.tokenOutputs[0].mint
      );
      if (tokenData) {
        tokenName = tokenData[0].name;
      }

      // Add holding to db
      const newHolding: HoldingRecord = {
        Time: swapTransactionData.timestamp,
        Token: swapTransactionData.tokenOutputs[0].mint,
        TokenName: tokenName,
        Balance: swapTransactionData.tokenOutputs[0].tokenAmount,
        SolPaid: swapTransactionData.tokenInputs[0].tokenAmount,
        SolFeePaid: swapTransactionData.fee,
        SolPaidUSDC: solPaidUsdc.valueOf(),
        SolFeePaidUSDC: solFeePaidUsdc.valueOf(),
        PerTokenPaidUSDC: perTokenUsdcPrice.valueOf(),
        Slot: swapTransactionData.slot,
        Program: swapTransactionData.programInfo
          ? swapTransactionData.programInfo.source
          : "N/A",
      };

      await this.db.insertHolding(newHolding).catch((err) => {
        console.log("⛔ Database Error: " + err);
        return false;
      });

      return true;
    } catch (error) {
      console.error("Error during request:", error);
      return false;
    }
  }

  async createSellTransaction(
    solMint: string,
    tokenMint: string,
    amount: string
  ): Promise<createSellTransactionResponse> {
    try {
      // Check token balance using RPC connection
      const tokenAccounts = await this.wallet.getTokenBalance(tokenMint);

      //Check if token exists in wallet with non-zero balance
      const totalBalance = tokenAccounts.value.reduce((sum, account) => {
        const tokenAmount = account.account.data.parsed.info.tokenAmount.amount;
        return sum + BigInt(tokenAmount); // Use BigInt for precise calculations
      }, BigInt(0));

      // Verify returned balance
      if (totalBalance <= 0n) {
        await this.db.removeHolding(tokenMint).catch((err) => {
          console.log("⛔ Database Error: " + err);
        });
        throw new Error(
          `Token has 0 balance - Already sold elsewhere. Removing from tracking.`
        );
      }

      // Verify amount with tokenBalance
      if (totalBalance !== BigInt(amount)) {
        throw new Error(
          `Wallet and tracker balance mismatch. Sell manually and token will be removed during next price check.`
        );
      }

      // Request a quote in order to swap SOL for new token
      const quoteResponse = await this.jupiterApi.getQuote({
        inputMint: tokenMint,
        outputMint: solMint,
        amount: amount,
        slippageBps: config.sell.slippageBps,
      });

      // Throw error if no quote was received
      if (!quoteResponse.data) {
        throw new Error(
          "No valid quote for selling the token was received from Jupiter!"
        );
      }

      // Serialize the quote into a swap transaction that can be submitted on chain
      const swapTransaction = await this.jupiterApi.swapTransaction({
        // quoteResponse from /quote api
        quoteResponse: quoteResponse.data,
        // user public key to be used for the swap
        userPublicKey: this.wallet.getPublicKey()!,
      });

      // Throw error if no quote was received
      if (!swapTransaction.data) {
        throw new Error("No valid swap transaction was received from Jupiter!");
      }

      // deserialize the transaction
      const swapTransactionBuf = Buffer.from(
        swapTransaction.data.swapTransaction,
        "base64"
      );
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      // sign the transaction
      transaction.sign([this.wallet.getSigner()]);

      // Execute the transaction
      const rawTransaction = transaction.serialize();
      const txid = await this.wallet.sendTransaction(rawTransaction);

      // Return null when no tx was returned
      if (!txid) {
        throw new Error(
          "Could not send transaction that was signed and serialized!"
        );
      }

      // get the latest block hash
      const latestBlockHash = await this.wallet.connection.getLatestBlockhash();

      // Fetch the current status of a transaction signature (processed, confirmed, finalized).
      const conf = await this.wallet.connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: txid,
      });

      // Return null when an error occured when confirming the transaction
      if (conf.value.err || conf.value.err !== null) {
        throw new Error("Transaction was not successfully confirmed!");
      }

      // Delete holding
      await this.db.removeHolding(tokenMint).catch((err) => {
        console.log("⛔ Database Error: " + err);
      });

      return {
        success: true,
        msg: null,
        tx: txid,
      };
    } catch (error: any) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : "Unknown error",
        tx: null,
      };
    }
  }
}
