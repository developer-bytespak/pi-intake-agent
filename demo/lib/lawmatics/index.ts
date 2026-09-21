/**
 * Picks the Lawmatics implementation.
 *
 * Mock unless a token is present, so the demo runs on a clean machine with no
 * accounts. Set LAWMATICS_TOKEN to write to a real Lawmatics firm instead.
 *
 * LAWMATICS_MODE=mock forces the mock even when a token exists, which is what
 * you want while rehearsing so a network problem cannot spoil a live demo.
 */

import { MockLawmatics } from "./mock";
import { LiveLawmatics } from "./live";
import type { LawmaticsGateway } from "./types";

let gateway: LawmaticsGateway | null = null;

export function lawmaticsConfigured(): boolean {
  return Boolean(process.env.LAWMATICS_TOKEN);
}

export function lawmatics(): LawmaticsGateway {
  if (gateway) return gateway;
  const forced = process.env.LAWMATICS_MODE;
  gateway =
    forced !== "live" && (forced === "mock" || !lawmaticsConfigured()) ? new MockLawmatics() : new LiveLawmatics();
  return gateway;
}

export type { LawmaticsGateway } from "./types";
export * from "./types";
