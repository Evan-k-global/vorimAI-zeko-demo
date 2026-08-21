import { randomBytes } from "node:crypto";

import { Field, PublicKey, UInt64 } from "o1js";

import { VorimAiCredential } from "./VorimAiCredentialRegistry.js";
import { fieldFromObject, fieldFromString, sha256Hex } from "./hash.js";

export type VorimTokenResponse = {
  access_token: string;
  id_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

export type VorimIdTokenPayload = {
  iss: string;
  aud: string;
  sub: string;
  exp?: number;
  iat?: number;
  external_user_id?: string;
  [claim: string]: unknown;
};

export type ExchangeVorimCodeInput = {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenEndpoint?: string;
};

export type BuildCredentialInput = {
  idTokenPayload: VorimIdTokenPayload;
  clientId: string;
  scope: string;
  appSalt: string;
  authContext?: Record<string, unknown>;
  holderKey: PublicKey;
  issuedAtSlot: bigint | number | string;
  expiresAtSlot: bigint | number | string;
  nonce?: string;
};

export async function exchangeVorimCode({
  code,
  clientId,
  clientSecret,
  redirectUri,
  tokenEndpoint = "https://api.vorim.ai/oauth2/token"
}: ExchangeVorimCodeInput): Promise<VorimTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri
  });

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error(`Vorim token exchange failed: ${response.status} ${await response.text()}`);
  }

  return response.json() as Promise<VorimTokenResponse>;
}

export function decodeJwtPayload(jwt: string): VorimIdTokenPayload {
  const [, payload] = jwt.split(".");
  if (!payload) {
    throw new Error("id_token is not a JWT");
  }
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as VorimIdTokenPayload;
}

export function assertVorimIdTokenClaims(
  payload: VorimIdTokenPayload,
  expected: { issuer: string; audience: string; nowSeconds?: number }
) {
  if (payload.iss !== expected.issuer) {
    throw new Error(`Unexpected Vorim issuer: ${payload.iss}`);
  }
  if (payload.aud !== expected.audience) {
    throw new Error(`Unexpected Vorim audience: ${payload.aud}`);
  }
  const nowSeconds = expected.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (payload.exp !== undefined && payload.exp <= nowSeconds) {
    throw new Error("Vorim id_token has expired");
  }
}

export function buildVorimCredential({
  idTokenPayload,
  clientId,
  scope,
  appSalt,
  authContext = {},
  holderKey,
  issuedAtSlot,
  expiresAtSlot,
  nonce = randomBytes(16).toString("hex")
}: BuildCredentialInput): VorimAiCredential {
  const vorimSubject = idTokenPayload.external_user_id ?? idTokenPayload.sub;
  if (!vorimSubject) {
    throw new Error("Vorim id_token is missing sub/external_user_id");
  }

  return new VorimAiCredential({
    subjectCommitment: fieldFromString(`${appSalt}:vorim-subject:${vorimSubject}`),
    clientIdHash: fieldFromString(clientId),
    authContextHash: fieldFromObject({
      issuer: idTokenPayload.iss,
      audience: idTokenPayload.aud,
      tokenSubjectHash: sha256Hex(idTokenPayload.sub),
      ...authContext
    }),
    scopeHash: fieldFromString(scope),
    holderKey,
    issuedAtSlot: UInt64.from(issuedAtSlot),
    expiresAtSlot: UInt64.from(expiresAtSlot),
    nullifier: fieldFromString(`${appSalt}:vorim-nullifier:${vorimSubject}:${scope}:${nonce}`)
  });
}
