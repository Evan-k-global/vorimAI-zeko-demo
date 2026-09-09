import "dotenv/config";

import { Mina, PrivateKey, fetchAccount, type NetworkId } from "o1js";

const zekoGraphql = process.env.ZEKO_GRAPHQL_URL ?? "https://sepolia.zeko.io/graphql";
const zekoArchive = process.env.ZEKO_ARCHIVE_URL ?? "https://sepolia.zeko.io/graphql";
// Zeko Sepolia reports zeko:testnet but uses the standard testnet signing domain.
const zekoO1jsNetworkId = (process.env.ZEKO_O1JS_NETWORK_ID ?? "testnet") as NetworkId;
const missionRegistryAddress = process.env.MBA_MISSION_REGISTRY_ADDRESS ??
  "B62qikuceF52NVPb8VAVSaRoCRMusFz38pLLENjvLaUuLiDnULAVohe";
const x402ContractAddress = process.env.X402_ZEKO_CONTRACT_ADDRESS ??
  "B62qqb9HqChXa8k4dukxRA6EZ76LzeuJKCpEcBsyicb5aTLoQg9J9rU";

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
    networkId: zekoO1jsNetworkId
  })
);

async function inspectKey(label: string, privateKeyBase58?: string) {
  if (!privateKeyBase58) return;
  const publicKey = PrivateKey.fromBase58(privateKeyBase58).toPublicKey();
  const response = await fetchAccount({ publicKey });
  console.log(`\n${label}`);
  console.log(`publicKey ${publicKey.toBase58()}`);
  if (!response.account) {
    console.log(`account lookup failed: ${response.error?.statusText ?? "not found"}`);
    return;
  }
  console.log(`balance ${response.account.balance.toString()} nanomina`);
  console.log(`nonce ${response.account.nonce.toString()}`);
}

async function inspectPublicZkApp(label: string, address: string) {
  const response = await fetch(zekoGraphql, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: "query ZkApp($pk: PublicKey!) { networkID account(publicKey: $pk) { zkappState verificationKey { hash } } }",
      variables: { pk: address }
    })
  });
  const body = await response.json() as {
    data?: { networkID?: string; account?: { zkappState?: string[]; verificationKey?: { hash?: string } } };
    errors?: Array<{ message?: string }>;
  };
  console.log(`\n${label}`);
  console.log(`address ${address}`);
  if (!response.ok || !body.data?.account) {
    console.log(`account lookup failed: ${body.errors?.[0]?.message ?? response.statusText ?? "not found"}`);
    process.exitCode = 1;
    return;
  }
  console.log(`nodeNetworkId ${body.data.networkID ?? "missing"}`);
  console.log(`verificationKey ${body.data.account.verificationKey?.hash ?? "missing"}`);
  console.log(`state ${body.data.account.zkappState?.join(",") ?? "missing"}`);
}

try {
  console.log(`\nprotocolNetworkId ${process.env.ZEKO_PROTOCOL_NETWORK_ID ?? "zeko:sepolia"}`);
  console.log(`o1jsNetworkId ${zekoO1jsNetworkId}`);
  await inspectPublicZkApp("canonical Mission-Bound Auth registry", missionRegistryAddress);
  await inspectPublicZkApp("canonical x402 Zeko settlement", x402ContractAddress);
  await inspectKey("deployer", process.env.ZEKO_DEPLOYER_PRIVATE_KEY);
  await inspectKey("zkapp", process.env.ZEKO_ZKAPP_PRIVATE_KEY);
  await inspectKey("issuer", process.env.VORIM_ISSUER_PRIVATE_KEY);
} catch (error) {
  console.error(`\nZeko account check failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
