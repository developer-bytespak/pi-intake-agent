/**
 * The endpoint Retell calls when the agent uses a tool. This is the pipeline
 * entry point: verify the signature first, record that verification so the
 * client can watch it happen, then dispatch.
 */

import { NextRequest, NextResponse } from "next/server";
import { databaseWarning } from "@/lib/db";
import { isAfterHours } from "@/lib/config";
import { logPipeline, touchCall } from "@/lib/ops";
import { signatureRequired, verifyRetellSignature, type ToolRequest } from "@/lib/retell";
import { runTool } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    return await handle(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    // Retell reads this aloud in the worst case, so keep it short and calm.
    return NextResponse.json(
      { status: "error", say: "I could not reach our system just now", detail: message, hint: databaseWarning() },
      { status: 200 },
    );
  }
}

async function handle(request: NextRequest) {
  const startedAt = Date.now();
  const rawBody = await request.text();

  let payload: ToolRequest;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "body is not valid JSON" }, { status: 400 });
  }

  const callId = payload?.call?.call_id;
  if (!callId || !payload?.name) {
    return NextResponse.json({ error: "expected name and call.call_id" }, { status: 400 });
  }

  const check = verifyRetellSignature(rawBody, request.headers.get("x-retell-signature"), process.env.RETELL_API_KEY);

  const leadRaw = payload.call.metadata?.lead_id ?? payload.call.retell_llm_dynamic_variables?.lead_id;
  const leadId = Number(leadRaw) > 0 ? Number(leadRaw) : null;

  await touchCall(callId, {
    channel: leadId ? "outbound" : payload.call.from_number ? "phone" : "web",
    fromNumber: payload.call.from_number,
    afterHours: isAfterHours(),
    leadId,
  });

  if (!check.ok) {
    if (signatureRequired()) {
      await logPipeline(callId, "lead_received", "error", check.reason);
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
    await logPipeline(callId, "lead_received", "warn", "unsigned, allowed by demo setting");
  } else {
    await logPipeline(
      callId,
      "lead_received",
      "ok",
      `${leadId ? "outbound call answered" : payload.call.from_number ? "phone call answered" : "web call answered"}, signature verified`,
      Date.now() - startedAt,
    );
  }

  const result = await runTool(payload);
  return NextResponse.json(result);
}

export async function GET() {
  return NextResponse.json({ ok: true, signature_required: signatureRequired() });
}
