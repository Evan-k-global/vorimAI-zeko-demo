import type { VorimRuntimeClient } from "./vorim-zeko-adapter.js";

type CreateVorim = (options: { apiKey: string; baseUrl?: string }) => VorimRuntimeClient;

export type VorimSdkRuntimeConfig = {
  apiKey: string;
  baseUrl?: string;
  sdkModule?: string;
};

/**
 * Loads Vorim's real SDK only when a deployment opts into SDK mode. This keeps
 * the public demo runnable without bundling customer credentials or replacing
 * the documented @vorim/sdk runtime calls with an invented HTTP client.
 */
export async function createVorimSdkRuntime(
  config: VorimSdkRuntimeConfig
): Promise<VorimRuntimeClient> {
  const sdkModule = config.sdkModule ?? "@vorim/sdk";
  let imported: { default?: unknown; createVorim?: unknown };
  try {
    imported = await import(sdkModule) as { default?: unknown; createVorim?: unknown };
  } catch (error) {
    throw new Error(
      `Could not load ${sdkModule}. Install Vorim's SDK in this deployment before setting POC_RUNTIME_MODE=vorim-sdk. ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const createVorim = imported.default ?? imported.createVorim;
  if (typeof createVorim !== "function") {
    throw new Error(`${sdkModule} does not export createVorim as its default or named export.`);
  }
  return (createVorim as CreateVorim)({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {})
  });
}
