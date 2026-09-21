/**
 * Outbound texts, emails and e-sign links.
 *
 * Twilio and the e-sign provider are not connected yet, so every message is
 * written to the database with status queued and rendered in the demo. The
 * conversation, the pipeline and the panel all behave exactly as they will
 * once the providers are live, which means adding them changes one function
 * each and nothing else.
 *
 * To send texts for real set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and
 * TWILIO_FROM_NUMBER.
 */

import { q } from "./db";

export type MessageTarget = "lead" | "attorney" | "intake";
export type Channel = "sms" | "email" | "esign";

export function smsConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

export function smsMode(): "preview" | "twilio" {
  return smsConfigured() ? "twilio" : "preview";
}

export function esignMode(): "preview" | "live" {
  return process.env.ESIGN_API_KEY ? "live" : "preview";
}

async function sendViaTwilio(to: string, body: string): Promise<{ sid: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const token = process.env.TWILIO_AUTH_TOKEN as string;
  const from = process.env.TWILIO_FROM_NUMBER as string;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  const json = (await res.json()) as { sid?: string; message?: string };
  if (!res.ok) throw new Error(json.message || `Twilio returned ${res.status}`);
  return { sid: json.sid ?? "" };
}

/**
 * Queues a message, and sends it when the provider is configured. Never
 * throws into the call: a text that fails must not take down the matter that
 * earned it.
 */
export async function sendMessage(args: {
  callId?: string | null;
  matterId?: string | null;
  to: string;
  label: MessageTarget;
  channel: Channel;
  subject?: string;
  body: string;
}): Promise<{ id: number; status: "queued" | "sent" | "failed" }> {
  const provider = args.channel === "sms" ? smsMode() : args.channel === "esign" ? esignMode() : "preview";

  const rows = await q<{ id: number }>(
    `insert into outbound_messages (call_id, matter_id, to_address, to_label, channel, subject, body, provider, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'queued') returning id`,
    [args.callId ?? null, args.matterId ?? null, args.to, args.label, args.channel, args.subject ?? null, args.body, provider],
  );
  const id = rows[0]?.id ?? 0;

  if (args.channel === "sms" && provider === "twilio") {
    try {
      const { sid } = await sendViaTwilio(args.to, args.body);
      await q(`update outbound_messages set status = 'sent', provider_id = $2 where id = $1`, [id, sid]);
      return { id, status: "sent" };
    } catch (err) {
      await q(`update outbound_messages set status = 'failed', error = $2 where id = $1`, [
        id,
        err instanceof Error ? err.message : "unknown error",
      ]);
      return { id, status: "failed" };
    }
  }

  return { id, status: "queued" };
}

/** A stable looking e-sign link for the demo. The real one comes from the provider. */
export function retainerLink(matterReference: string): string {
  const host = process.env.DEMO_HOST || process.env.VERCEL_URL || "harborpoint.example";
  return `https://${host.replace(/^https?:\/\//, "")}/sign/${matterReference.toLowerCase()}`;
}
