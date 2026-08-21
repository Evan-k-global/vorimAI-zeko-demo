import "dotenv/config";

import { AccountUpdate, fetchAccount, Mina, PrivateKey } from "o1js";

import { VorimAiCredentialRegistry } from "../src/index.js";

const deployerPrivateKey = process.env.ZEKO_DEPLOYER_PRIVATE_KEY;
const zkappPrivateKey = process.env.ZEKO_ZKAPP_PRIVATE_KEY;
const issuerPrivateKey = process.env.VORIM_ISSUER_PRIVATE_KEY;

if (!deployerPrivateKey || !zkappPrivateKey || !issuerPrivateKey) {
  throw new Error(
    "Set ZEKO_DEPLOYER_PRIVATE_KEY, ZEKO_ZKAPP_PRIVATE_KEY, and VORIM_ISSUER_PRIVATE_KEY."
  );
}

const network = Mina.Network({
  mina: process.env.ZEKO_GRAPHQL_URL ?? "https://testnet.zeko.io/graphql",
  archive: process.env.ZEKO_ARCHIVE_URL ?? "https://archive.testnet.zeko.io/graphql",
  networkId: "testnet"
});
Mina.setActiveInstance(network);

const deployer = PrivateKey.fromBase58(deployerPrivateKey);
const zkappKey = PrivateKey.fromBase58(zkappPrivateKey);
const issuerKey = PrivateKey.fromBase58(issuerPrivateKey);
const zkapp = new VorimAiCredentialRegistry(zkappKey.toPublicKey());

const deployerAccount = await fetchAccount(
  { publicKey: deployer.toPublicKey() },
  process.env.ZEKO_GRAPHQL_URL ?? "https://testnet.zeko.io/graphql"
);
if (!deployerAccount.account) {
  throw new Error(
    `Deployer account lookup failed: ${deployerAccount.error?.statusText ?? "not found"}`
  );
}

console.log("Compiling VorimAiCredentialRegistry...");
await VorimAiCredentialRegistry.compile();

const tx = await Mina.transaction(
  { sender: deployer.toPublicKey(), fee: 100_000_000 },
  async () => {
    AccountUpdate.fundNewAccount(deployer.toPublicKey());
    await zkapp.deploy();
  }
);

await tx.prove();
await tx.sign([deployer, zkappKey]).send();

const configureTx = await Mina.transaction(
  { sender: deployer.toPublicKey(), fee: 100_000_000 },
  async () => {
    await zkapp.configure(issuerKey.toPublicKey());
  }
);
await configureTx.prove();
await configureTx.sign([deployer, zkappKey]).send();

console.log(JSON.stringify({
  zkappAddress: zkapp.address.toBase58(),
  issuerPublicKey: issuerKey.toPublicKey().toBase58(),
  graphQlUrl: process.env.ZEKO_GRAPHQL_URL ?? "https://testnet.zeko.io/graphql"
}, null, 2));
