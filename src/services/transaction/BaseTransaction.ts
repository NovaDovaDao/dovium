//src/transactions/BaseTransaction.ts
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { SolanaWallet } from "../solana/wallet.ts";
import { Buffer } from "node:buffer";
import { QuoteResponse, SerializedQuoteResponse } from "../../core/types/Tracker.ts";
import axios from "axios";
import { config } from "../../config.ts";

export abstract class BaseTransaction {
    protected connection: Connection;
    protected wallet: SolanaWallet;
    protected quoteUrl: string;
    protected swapUrl: string;

    constructor() {
        const rpcUrl = process.env.HELIUS_HTTPS_URI || "";
        this.quoteUrl = process.env.JUP_HTTPS_QUOTE_URI || "";
        this.swapUrl = process.env.JUP_HTTPS_SWAP_URI || "";
        this.connection = new Connection(rpcUrl);
        const privateKey = process.env.PRIV_KEY_WALLET || "";
        this.wallet = new SolanaWallet(this.connection, privateKey);
    }

    protected async getQuote(inputMint: string, outputMint: string, amount: string | number, slippageBps: number): Promise<QuoteResponse> {
        const response = await axios.get<QuoteResponse>(this.quoteUrl, {
            params: { inputMint, outputMint, amount, slippageBps },
            timeout: config.tx.get_timeout
        });

        if (!response.data) {
            throw new Error("No quote response received");
        }

        return response.data;
    }

    protected async serializeTransaction(quoteResponse: QuoteResponse, priorityConfig: any): Promise<SerializedQuoteResponse> {
        const publicKey = this.wallet.getPublicKey();
        if (!publicKey) {
            throw new Error("Wallet not initialized");
        }

        const response = await axios.post<SerializedQuoteResponse>(
            this.swapUrl,
            JSON.stringify({
                quoteResponse,
                userPublicKey: publicKey,
                wrapAndUnwrapSol: true,
                dynamicSlippage: {
                    maxBps: 300,
                },
                prioritizationFeeLamports: priorityConfig
            }),
            {
                headers: { "Content-Type": "application/json" },
                timeout: config.tx.get_timeout
            }
        );

        if (!response.data) {
            throw new Error("No serialized transaction received");
        }

        return response.data;
    }

    protected async executeTransaction(serializedTx: SerializedQuoteResponse): Promise<string> {
        const transactionBuffer = Buffer.from(serializedTx.swapTransaction, "base64");
        const transaction = VersionedTransaction.deserialize(transactionBuffer);
        
        transaction.sign([this.wallet.getSigner()]);
        
        const rawTransaction = transaction.serialize();
        const txid = await this.wallet.sendTransaction(rawTransaction);

        if (!txid) {
            throw new Error("Transaction failed to send");
        }

        const latestBlockHash = await this.connection.getLatestBlockhash();
        const confirmation = await this.connection.confirmTransaction({
            blockhash: latestBlockHash.blockhash,
            lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
            signature: txid
        });

        if (confirmation.value.err) {
            throw new Error("Transaction failed to confirm");
        }

        return txid;
    }
}