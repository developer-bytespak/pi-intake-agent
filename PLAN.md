# Job 3: AI Client Intake Agent for a Personal Injury Law Firm

Stack: Retell AI + Twilio + n8n, writing into Lawmatics.
Deliverable for now: a demo that wins the build, not the production system.
Budget in the listing: $3,000 to $10,000 build, $95 to $175 an hour, 3 to 6 weeks.
Success metric in the listing: speed to lead under 10 seconds.

---

## 0. The pitch in one paragraph

Personal injury firms win the case that signs first. Leads call at night and
fill in forms at midnight, and whichever firm is on the phone in the next ten
seconds usually signs them. This agent answers every call on the first ring,
calls every web form back within seconds, asks the four questions a paralegal
would ask, applies the firm's own rules (Florida's two year deadline, prior
counsel, liability, treatment), runs a conflict check, opens the contact and
the matter in Lawmatics at the right pipeline stage with the source tagged,
sends the retainer for e-signature by text and email, and puts a callback on
an attorney's desk with a due time. Every disclosure and consent is written to
an audit trail with the script version, which is the TCPA and recording
compliance the listing asks for.

## 1. What the demo does, and what stands in

| Piece | Demo | Production |
|---|---|---|
| Voice | Retell, browser call from the page, and a Retell number for phone and outbound | Retell on a Twilio SIP trunk |
| Web form to call | Retell outbound call API, triggered by the form, stopwatch in the UI | Same, plus a Twilio SMS first if the lead does not answer |
| Lawmatics | A mock that mirrors contacts, matters, stages, tags and tasks, with a live REST client behind one variable | The firm's Lawmatics token, pipeline stage ids mapped in `LAWMATICS_STAGE_MAP` |
| SMS and email | Composed and shown on screen | Twilio and the firm's mail |
| E-sign | Envelope prepared and shown | Lawmatics e-sign or DocuSign |
| n8n | API routes in the demo | The same steps as n8n workflows, exported with the proposal |
| Case management sync | Not in the demo | Lawmatics to Clio or Filevine via their native sync |

## 2. The conversation

Opening with both disclosures, classification from the caller's own words,
four qualifying questions one at a time, the firm's rules, a conflict check
before anything is created, contact and matter, fixed wording text consent,
retainer, attorney callback, read back. Global paths for a person, billing,
spam and silence. A warm transfer with a private one line handoff and a
callback fallback when nobody picks up.

Hard rules in the global prompt: no case values, no advice, contingency
sentence only, no other client ever mentioned, minimal personal data, both
disclosures every time, texts only after consent with the exact script.

## 3. The rules the firm can argue with

`demo/lib/config.ts`, function `qualify()`:

- Referral categories first (medical malpractice, workplace injury).
- Past the deadline: declined, gently, with an offer of a second opinion call.
- Already represented: declined.
- Caller at fault with no other party: declined.
- Shared fault, out of state, deadline within 90 days, or a low score: attorney review.
- Otherwise qualified, and the retainer goes out on the call.

Score: base 40, plus 25 for treatment, plus 20 for another party at fault,
plus 10 for a police report, minus 20 out of state, minus 10 no treatment.

## 4. Demo scenes

1. Strong car accident lead, after hours. Qualified, retainer sent, attorney tasked, texts composed. The matter card fills while the caller talks.
2. Web form to phone call. Own mobile in the form, phone rings within seconds, stopwatch stops on answer.
3. Past the deadline. Let down gently, nothing created, callback offered.
4. Already has a lawyer. Declined, nothing created.
5. Conflict hit. Adverse party is an existing client. Held for a person, conflict review task, agent says nothing about why.
6. Workplace injury. Referral, name and number taken for the partner firm.
7. "What is my case worth?" Never answered with a number.
8. Person, billing, spam, silence.

## 5. What to buy

A Retell phone number, about $2 a month, so the form dials back for real.
Everything else is on free tiers already in use.

## 6. After the sale

Lawmatics token and stage ids, Twilio number and toll free verification,
e-sign provider, the firm's real intake script folded into the questions,
their referral partners, and the monthly QA call log review the retainer pays for.
