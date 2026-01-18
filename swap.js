import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import fs from "fs";
import axios from "axios";

const config = JSON.parse(fs.readFileSync("config.json", "utf8"));
const secret = JSON.parse(fs.readFileSync("wallet.json", "utf8"));
const wallet = Keypair.fromSecretKey(Uint8Array.from(secret));

const conn = new Connection(config.RPC, "confirmed");

const TGLSS_MINT = new PublicKey(config.TGLSS_MINT);
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

// Amount to swap (per your dry-run plan)
const SWAP_TGLSS_UI = 25000;

async function getMintDecimals(mint) {
  const info = await conn.getParsedAccountInfo(mint);
  const decimals = info.value?.data?.parsed?.info?.decimals;
  if (typeof decimals !== "number") throw new Error("Cannot read mint decimals");
  return decimals;
}

function uiToAtomicInt(uiInt, decimals) {
  return BigInt(uiInt) * (10n ** BigInt(decimals));
}

console.log("=== SWAP STEP (Jupiter) ===");
console.log("Treasury:", wallet.publicKey.toBase58());

const decimals = await getMintDecimals(TGLSS_MINT);
const amountAtomic = uiToAtomicInt(SWAP_TGLSS_UI, decimals);

console.log("TGLSS decimals:", decimals);
console.log("Swap TGLSS (ui):", SWAP_TGLSS_UI);
console.log("Swap amount (atomic):", amountAtomic.toString());

const quoteUrl = "https://lite-api.jup.ag/swap/v1/quote";
const swapUrl  = "https://lite-api.jup.ag/swap/v1/swap";

try {
  // 1) Quote
  const quote = await axios.get(quoteUrl, {
    params: {
      inputMint: TGLSS_MINT.toBase58(),
      outputMint: WSOL_MINT.toBase58(),
      amount: amountAtomic.toString(),
      slippageBps: config.SLIPPAGE_BPS ?? 400
    },
    timeout: 15000
  });

  const q = quote.data;
  if (!q) throw new Error("Empty quote response");

  // different Jupiter responses have different shapes; we just sanity check
  const hasRoute =
    (Array.isArray(q.routePlan) && q.routePlan.length > 0) ||
    (Array.isArray(q.routes) && q.routes.length > 0);

  if (!hasRoute) {
    console.log("No route found.");
    console.log(JSON.stringify(q).slice(0, 800));
    process.exit(1);
  }

  console.log("Quote OK.");

  // 2) Swap tx
  const swapResp = await axios.post(
    swapUrl,
    {
      quoteResponse: q,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true
    },
    { timeout: 15000 }
  );

  const txB64 = swapResp.data?.swapTransaction;
  if (!txB64) {
    console.log("No swapTransaction returned.");
    console.log(JSON.stringify(swapResp.data).slice(0, 800));
    process.exit(1);
  }

  const tx = VersionedTransaction.deserialize(Buffer.from(txB64, "base64"));
  tx.sign([wallet]);

  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  console.log("Swap sent. Signature:", sig);

  const conf = await conn.confirmTransaction(sig, "confirmed");
  console.log("Confirmed:", conf.value?.err ? conf.value.err : "OK");
} catch (e) {
  console.log("SWAP FAILED:");
  console.log(e?.message || e);
  if (e?.response?.data) {
    console.log("Response:");
    console.log(JSON.stringify(e.response.data).slice(0, 1200));
  }
}
