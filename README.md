# AI client intake agent for a personal injury firm

A client facing demo for Job 3: a voice and web form intake agent for a
personal injury law firm, built on Retell AI, writing into Lawmatics, with an
attorney callback and an e-sign retainer at the end of every qualified lead.

The invented firm is **Harbor Point Injury Law** in Tampa, Florida. Florida is
chosen on purpose: two party consent for call recording and a two year
negligence deadline, so both compliance rules get exercised on every call.

## What the screen shows

One page, three columns, fed by a single poll of `/api/state`.

| Column | Panel | What it proves |
|---|---|---|
| Left | **Intake**, with a Call tab and a Web form tab | The agent answers on the first ring and runs the intake script. The web form dials the lead back within seconds. |
| Middle | **Matter** | The Lawmatics file being built while the caller is still on the line: fields, score, flags, pipeline stage. Under it, the firm's intake pipeline. |
| Middle | **Follow up** | Attorney callback tasks with due times, the texts, emails and e-sign envelope, and the consent trail with script versions. |
| Right | **Speed to lead** | The stopwatch, and the night's numbers: after hours calls, qualified, retainers sent, fee value opened. |
| Right | **Pipeline** | Ten steps, each with a timing, from signature verification to the confirmation text. |

## Running it

```bash
cd demo
cp .env.example .env.local     # fill in the Retell keys
npm install
npm run dev                    # http://localhost:3000
```

With no environment at all the demo runs on an embedded Postgres (PGlite), the
Lawmatics mock, preview texts, and a web form that records and tasks instead
of dialing. Each of those flips to the real thing with one variable.

```bash
npm test               # walks five scenes through the pipeline against PGlite
npm run validate:flow  # checks the conversation flow against Retell's rules
npm run push:retell    # creates or updates the flow and the agent in Retell
```

## The agent

`demo/retell/demo-flow.json` is the conversation flow: disclosures in the
opening line, classification, four qualifying questions, the firm's rules,
a conflict check, contact and matter creation, TCPA text consent with fixed
wording, retainer e-sign, attorney callback, and a warm transfer with a
callback fallback. `demo/retell/demo-agent.json` is the agent on top of it.

Nine tools, all served by `demo/app/api/retell/tool/route.ts` with the Retell
signature verified on every call:

`classify_intake`, `qualify_lead`, `conflict_check`, `create_matter`,
`record_sms_consent`, `send_retainer`, `schedule_callback`, `confirm_lead`,
`take_message`.

## Where the rules live

`demo/lib/config.ts` is the only file to edit for a real firm: the firm, the
staff and their on call days, the case types the firm takes and refers out,
the qualifying questions, the deadline table, the consent scripts and the
speed target. `qualify()` in the same file is the intake decision, written so
an intake manager can read it and argue with it.

## Deploying

Vercel, with a Neon Postgres attached as `DATABASE_URL`. Then
`DEMO_HOST=<your host> npm run push:retell`, paste the printed agent id into
`NEXT_PUBLIC_RETELL_AGENT_ID`, and redeploy. Buy a phone number in Retell,
bind it to the agent, and set `RETELL_FROM_NUMBER` to turn the web form into
a real callback.
