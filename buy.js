import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import fs from "fs";
import axios from "axios";

const RPC = "https://api.mainnet-beta.solana.com";
const conn = new Connection(RPC, "confirmed");

const wallet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("wallet.json"))));

const TGLSS = new PublicKey("E1dsYuFzGPbxXPxHrqrrEQdPbk84fbXkudu2o9H9o12T");
const SOL = "So11111111111111111111111111111111111111112";

const BUY_SOL = 0.1;

async function main(){
  console.log("=== BUY TGLSS ===");
  console.log("Treasury:", wallet.publicKey.toBase58());

  const quote = await axios.get("https://quote-api.jup.ag/v6/quote", {
    params: {
      inputMint: SOL,
      outputMint: TGLSS.toBase58(),
      amount: Math.floor(BUY_SOL * 1e9),
      slippageBps: 400,
    }
  });

  const route = quote.data.data[0];

  const swap = await axios.post("https://quote-api.jup.ag/v6/swap", {
    route,
    userPublicKey: wallet.publicKey.toBase58(),
    wrapUnwrapSOL: true,
  });

  const tx = swap.data.swapTransaction;
  const buff = Buffer.from(tx, "base64");
  const sig = await conn.sendRawTransaction(buff, { skipPreflight: true });
  await conn.confirmTransaction(sig, "confirmed");

  console.log("Swap done:", sig);
}

main();
