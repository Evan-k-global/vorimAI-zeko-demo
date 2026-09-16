import "dotenv/config";

import { MockVorimClient } from "./mock-vorim.js";
import type { VorimRuntimeClient } from "./vorim-zeko-adapter.js";
import { createVorimSdkRuntime } from "./vorim-sdk-runtime.js";

export type PocRuntimeMode = "mock" | "vorim-sdk";

export function pocRuntimeModeFromEnv(): PocRuntimeMode {
  const mode = process.env.POC_RUNTIME_MODE ?? "mock";
  if (mode === "mock" || mode === "vorim-sdk") return mode;
  throw new Error("POC_RUNTIME_MODE must be mock or vorim-sdk.");
}

export async function createPocRuntime(scenario: "allow" | "modify" | "escalate" | "fallback" | "deny"): Promise<VorimRuntimeClient> {
  const mode = pocRuntimeModeFromEnv();
  if (mode === "mock") return new MockVorimClient(scenario);

  const apiKey = process.env.VORIM_API_KEY;
  if (!apiKey) {
    throw new Error("VORIM_API_KEY is required when POC_RUNTIME_MODE=vorim-sdk.");
  }
  return createVorimSdkRuntime({
    apiKey,
    baseUrl: process.env.VORIM_API_BASE_URL,
    sdkModule: process.env.VORIM_SDK_MODULE
  });
}
