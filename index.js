import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import fs from "fs";

const config = JSON.parse(fs.readFileSync("config.json", "utf8"));
const secret = JSON.parse(fs.readFileSync("wallet.json", "utf8"));
const wallet = Keypair.fromSecretKey(Uint8Array.from(secret));

const conn = new Connection(config.RPC, "confirmed");
const TGLSS_MINT = new PublicKey(config.TGLSS_MINT);

console.log("TGLSS Liquidity Engine Ready");
console.log("Treasury:", wallet.publicKey.toBase58());

async function getTokenBalance(ownerPubkey, mintPubkey) {
  const res = await conn.getParsedTokenAccountsByOwner(ownerPubkey, { mint: mintPubkey });
  if (res.value.length === 0) return 0;

  // usually 1 ATA; if multiple, sum them
  let total = 0;
  for (const acc of res.value) {
    const ui = acc.account.data.parsed.info.tokenAmount.uiAmount || 0;
    total += ui;
  }
  return total;
}

const solLamports = await conn.getBalance(wallet.publicKey);
const sol = solLamports / 1e9;
const tglss = await getTokenBalance(wallet.publicKey, TGLSS_MINT);

console.log("SOL:", sol);
console.log("TGLSS:", tglss);

console.log("MIN_TGLSS_TO_LP:", config.MIN_TGLSS_TO_LP);
console.log("READY_TO_LP:", tglss >= config.MIN_TGLSS_TO_LP);
