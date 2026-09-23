import "server-only";
import { AnthropicProvider } from "./anthropic";
import { GroundedProvider } from "./grounded";
import type { AIProvider } from "./types";

export * from "./types";
export { GroundedProvider } from "./grounded";

/**
 * Spec §23 — "keep an abstraction layer; do not scatter provider-specific
 * calls throughout the application".
 *
 * Nothing outside this directory imports a provider SDK. Services ask for a
 * provider and describe the task; the choice of who answers is made here,
 * once, from configuration.
 */

let cached: AIProvider | null = null;

/** True when a real model is reachable. */
export function isModelConfigured(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY?.trim() ||
      process.env.ANTHROPIC_AUTH_TOKEN?.trim(),
  );
}

/**
 * The provider for this deployment.
 *
 * With credentials, Claude writes the answer and its citations are validated
 * against the retrieved record. Without them, the grounded provider composes
 * the same answer deterministically from those records. The product works
 * either way, and the UI always says which one answered.
 */
export function resolveProvider(): AIProvider {
  if (cached) return cached;
  cached = isModelConfigured()
    ? new AnthropicProvider()
    : new GroundedProvider();
  return cached;
}

/** Test seam — lets a test install a provider without touching the env. */
export function setProvider(provider: AIProvider | null): void {
  cached = provider;
}
