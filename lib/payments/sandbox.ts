import { randomUUID } from "node:crypto";

/**
 * Mock payment rail. Stands in for a provider's payments API in sandbox mode:
 * it validates the instruction and returns a provider reference. It never
 * touches balances; the caller commits the result to the ledger atomically.
 *
 * Set SANDBOX_FORCE_FAILURE=1 to rehearse the failure path.
 */
export interface SandboxPaymentInstruction {
  transfer_request_id: string;
  provider: string;
  source_amount: number;
  source_currency: string;
  destination_amount: number;
  destination_currency: string;
  recipient: string;
  reference: string | null;
}

export type SandboxPaymentResult =
  | { ok: true; provider_reference: string; accepted_at: string; status: "COMPLETED" }
  | { ok: false; reason: string; status: "FAILED" };

export async function submitSandboxPayment(instruction: SandboxPaymentInstruction): Promise<SandboxPaymentResult> {
  // Simulate the round trip so the UI's "executing" state is visible in a demo.
  const latency = Number(process.env.SANDBOX_LATENCY_MS ?? 600);
  if (latency > 0) await new Promise((r) => setTimeout(r, latency));

  if (process.env.SANDBOX_FORCE_FAILURE === "1") {
    return { ok: false, reason: "Sandbox provider rejected the instruction (forced failure).", status: "FAILED" };
  }
  if (!(instruction.source_amount > 0) || !(instruction.destination_amount > 0)) {
    return { ok: false, reason: "Amounts must be positive.", status: "FAILED" };
  }
  if (!instruction.recipient.trim()) {
    return { ok: false, reason: "Recipient is missing.", status: "FAILED" };
  }
  return {
    ok: true,
    provider_reference: `SBX-${randomUUID().slice(0, 8).toUpperCase()}`,
    accepted_at: new Date().toISOString(),
    status: "COMPLETED",
  };
}
