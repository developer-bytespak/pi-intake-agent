/**
 * Public demo configuration. The Retell public key is meant to be visible in
 * the browser; the API key and the Lawmatics token never leave the server.
 */
import { NextResponse } from "next/server";
import { FIRM, SCRIPTS, STAFF } from "@/lib/config";
import { connectionSource, databaseMode, databaseWarning } from "@/lib/db";
import { lawmatics, lawmaticsConfigured } from "@/lib/lawmatics";
import { esignMode, smsConfigured, smsMode } from "@/lib/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    firm: FIRM,
    scripts: SCRIPTS,
    staff: STAFF.map((s) => ({ id: s.id, firstName: s.firstName, name: s.name, role: s.role, title: s.title, tone: s.tone })),
    retell: {
      publicKey: process.env.NEXT_PUBLIC_RETELL_PUBLIC_KEY ?? "",
      agentId: process.env.NEXT_PUBLIC_RETELL_AGENT_ID ?? "",
      phoneNumber: process.env.NEXT_PUBLIC_DEMO_PHONE_NUMBER ?? "",
      configured: Boolean(process.env.NEXT_PUBLIC_RETELL_PUBLIC_KEY && process.env.NEXT_PUBLIC_RETELL_AGENT_ID),
      outbound: Boolean(process.env.RETELL_API_KEY && process.env.RETELL_FROM_NUMBER && process.env.NEXT_PUBLIC_RETELL_AGENT_ID),
    },
    integrations: {
      database: { mode: databaseMode(), source: connectionSource(), warning: databaseWarning() },
      lawmatics: { mode: lawmatics().mode, credentialsPresent: lawmaticsConfigured() },
      sms: { mode: smsMode(), credentialsPresent: smsConfigured() },
      esign: { mode: esignMode() },
    },
  });
}
