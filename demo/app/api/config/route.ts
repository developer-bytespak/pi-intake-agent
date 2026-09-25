/**
 * Public configuration for the call widget. The Retell public key is meant to
 * be visible in the browser; the API key and the Lawmatics token never leave
 * the server. With ?scope=app the agent is the signed-in workspace's own.
 */
import { NextRequest, NextResponse } from "next/server";
import { FIRM, SCRIPTS, STAFF } from "@/lib/config";
import { connectionSource, databaseMode, databaseWarning } from "@/lib/db";
import { lawmatics, lawmaticsConfigured } from "@/lib/lawmatics";
import { esignMode, smsConfigured, smsMode } from "@/lib/messages";
import { tenantForRequest } from "@/lib/scope";
import { DEMO_TENANT_ID } from "@/lib/tenancy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const resolved = await tenantForRequest(request);
  if (resolved instanceof NextResponse) return resolved;
  const { tenant } = resolved;

  const agentId = tenant.retell_agent_id ?? (tenant.id === DEMO_TENANT_ID ? process.env.NEXT_PUBLIC_RETELL_AGENT_ID ?? "" : "");
  const phoneNumber = tenant.phone_number ?? (tenant.id === DEMO_TENANT_ID ? process.env.NEXT_PUBLIC_DEMO_PHONE_NUMBER ?? "" : "");

  return NextResponse.json({
    firm: {
      ...FIRM,
      name: tenant.name,
      shortName: tenant.short_name,
      tagline: tenant.tagline ?? FIRM.tagline,
      mainNumber: tenant.main_number ?? FIRM.mainNumber,
      timezone: tenant.timezone,
    },
    tenant: { id: tenant.id, status: tenant.status, plan: tenant.plan },
    scripts: SCRIPTS,
    staff: STAFF.map((s) => ({ id: s.id, firstName: s.firstName, name: s.name, role: s.role, title: s.title, tone: s.tone })),
    retell: {
      publicKey: process.env.NEXT_PUBLIC_RETELL_PUBLIC_KEY ?? "",
      agentId,
      phoneNumber,
      configured: Boolean(process.env.NEXT_PUBLIC_RETELL_PUBLIC_KEY && agentId),
      outbound: Boolean(process.env.RETELL_API_KEY && process.env.RETELL_FROM_NUMBER && agentId),
    },
    integrations: {
      database: { mode: databaseMode(), source: connectionSource(), warning: databaseWarning() },
      lawmatics: { mode: lawmatics().mode, credentialsPresent: lawmaticsConfigured() },
      sms: { mode: smsMode(), credentialsPresent: smsConfigured() },
      esign: { mode: esignMode() },
    },
  });
}
