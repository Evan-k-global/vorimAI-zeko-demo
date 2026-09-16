import type { CustomerPocDefinition } from "./customer-poc.js";
import type { PocRuntimeMode } from "./poc-runtime.js";

export type PocPublicConfig = {
  brand: { name: string; homeUrl: string | null };
  runtimeMode: PocRuntimeMode;
  poc: Pick<CustomerPocDefinition, "id" | "title" | "customerLabel" | "summary" | "actionLabel" | "escalationLabel">;
};

export function pocPublicConfig(
  definition: CustomerPocDefinition,
  runtimeMode: PocRuntimeMode
): PocPublicConfig {
  return {
    brand: {
      name: process.env.POC_BRAND_NAME ?? "Vorim",
      homeUrl: process.env.POC_BRAND_HOME_URL ?? null
    },
    runtimeMode,
    poc: {
      id: definition.id,
      title: definition.title,
      customerLabel: definition.customerLabel,
      summary: definition.summary,
      actionLabel: definition.actionLabel,
      escalationLabel: definition.escalationLabel
    }
  };
}
