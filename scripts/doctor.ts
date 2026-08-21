import "dotenv/config";

import { Mina, PrivateKey, fetchAccount } from "o1js";

const zekoGraphql = process.env.ZEKO_GRAPHQL_URL ?? "https://testnet.zeko.io/graphql";
const zekoArchive = process.env.ZEKO_ARCHIVE_URL ?? "https://archive.testnet.zeko.io/graphql";

const required = [
  "VORIM_CLIENT_ID",
  "VORIM_CLIENT_SECRET",
  "VORIM_AGENT_ID",
  "VORIM_ISSUER_PRIVATE_KEY",
  "ZEKO_DEPLOYER_PRIVATE_KEY",
  "ZEKO_ZKAPP_PRIVATE_KEY"
];

console.log("VorimAI on Zeko readiness\n");
for (const name of required) {
  console.log(`${process.env[name] ? "ok" : "missing"} ${name}`);
}

Mina.setActiveInstance(
  Mina.Network({
    mina: zekoGraphql,
    archive: zekoArchive,
    networkId: "testnet"
  })
);

async function inspectKey(label: string, privateKeyBase58?: string) {
  if (!privateKeyBase58) return;
  const publicKey = PrivateKey.fromBase58(privateKeyBase58).toPublicKey();
  const response = await fetchAccount({ publicKey }, zekoGraphql);
  console.log(`\n${label}`);
  console.log(`publicKey ${publicKey.toBase58()}`);
  if (!response.account) {
    console.log(`account lookup failed: ${response.error?.statusText ?? "not found"}`);
    return;
  }
  console.log(`balance ${response.account.balance.toString()} nanomina`);
  console.log(`nonce ${response.account.nonce.toString()}`);
}

try {
  await inspectKey("deployer", process.env.ZEKO_DEPLOYER_PRIVATE_KEY);
  await inspectKey("zkapp", process.env.ZEKO_ZKAPP_PRIVATE_KEY);
  await inspectKey("issuer", process.env.VORIM_ISSUER_PRIVATE_KEY);
} catch (error) {
  console.error(`\nZeko account check failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
