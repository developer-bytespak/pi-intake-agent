/**
 * Turning what a caller said about when it happened into a date.
 *
 * The model is asked for YYYY-MM-DD, but a real call hands over "last
 * Tuesday", "about three weeks ago", "March 3rd" or "the fourteenth of June
 * 2024". The filing deadline decision depends on this, so the parser is
 * forgiving and the result carries how sure it is.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, couple: 2, few: 3, several: 3,
};

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export type ParsedDate = { date: Date; iso: string; precision: "day" | "month" | "approx" } | null;

function local(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseIncidentDate(raw: unknown, now: Date = new Date()): ParsedDate {
  const s = String(raw ?? "").trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!s) return null;

  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const d = local(+m[1], +m[2], +m[3]);
    return { date: d, iso: iso(d), precision: "day" };
  }

  m = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const d = local(y, +m[1], +m[2]);
    return { date: d, iso: iso(d), precision: "day" };
  }

  if (/\b(today|this morning|this afternoon|tonight|earlier today)\b/.test(s)) {
    return { date: now, iso: iso(now), precision: "day" };
  }
  if (/\byesterday\b/.test(s)) {
    const d = new Date(now); d.setDate(d.getDate() - 1);
    return { date: d, iso: iso(d), precision: "day" };
  }

  // "three weeks ago", "about 2 months ago", "a year ago", "last month".
  m = s.match(/(\d+|[a-z]+)\s+(day|week|month|year)s?\s+ago/);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? +m[1] : WORD_NUMBERS[m[1]];
    if (n !== undefined) {
      const d = new Date(now);
      if (m[2] === "day") d.setDate(d.getDate() - n);
      if (m[2] === "week") d.setDate(d.getDate() - 7 * n);
      if (m[2] === "month") d.setMonth(d.getMonth() - n);
      if (m[2] === "year") d.setFullYear(d.getFullYear() - n);
      return { date: d, iso: iso(d), precision: "approx" };
    }
  }
  m = s.match(/\blast\s+(week|month|year)\b/);
  if (m) {
    const d = new Date(now);
    if (m[1] === "week") d.setDate(d.getDate() - 7);
    if (m[1] === "month") d.setMonth(d.getMonth() - 1);
    if (m[1] === "year") d.setFullYear(d.getFullYear() - 1);
    return { date: d, iso: iso(d), precision: "approx" };
  }

  // "last tuesday", "on friday".
  m = s.match(/\b(last\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (m) {
    const target = DAYS.indexOf(m[2]);
    const d = new Date(now);
    let back = (d.getDay() - target + 7) % 7;
    if (back === 0) back = 7;
    d.setDate(d.getDate() - back);
    return { date: d, iso: iso(d), precision: "day" };
  }

  // "march 3rd", "3 march 2025", "the 14th of june 2024", "june 2024".
  const words = s.replace(/(\d+)(st|nd|rd|th)\b/g, "$1").replace(/\bof\b/g, " ").split(" ");
  let month: number | undefined;
  let day: number | undefined;
  let year: number | undefined;
  for (const w of words) {
    if (MONTHS[w] !== undefined) month = MONTHS[w];
    else if (/^(19|20)\d{2}$/.test(w)) year = +w;
    else if (/^\d{1,2}$/.test(w) && day === undefined) day = +w;
  }
  if (month) {
    const y = year ?? (month > now.getMonth() + 1 ? now.getFullYear() - 1 : now.getFullYear());
    const d = local(y, month, day ?? 15);
    return { date: d, iso: iso(d), precision: day ? "day" : "month" };
  }

  return null;
}

/** "yes", "yeah, I went to the ER" and "no, not yet" become a three way answer. */
export function yesNo(raw: unknown): "yes" | "no" | "unknown" {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (/^(no|nope|not yet|never|haven't|havent|no i)/.test(s) || /\b(no|not yet|haven't|havent|never)\b/.test(s) && !/\byes\b/.test(s)) return "no";
  if (/\b(yes|yeah|yep|i did|i have|went to|saw a|been to|er\b|emergency room|urgent care|hospital|doctor|chiropract)/.test(s)) return "yes";
  return "unknown";
}

export function faultFrom(raw: unknown): "other" | "self" | "shared" | "unknown" {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (/\b(both|shared|partly|partially|50|fifty|we both)\b/.test(s)) return "shared";
  if (/\b(my fault|i was at fault|i caused|i hit|i ran|me\b)/.test(s) && !/\b(not my|wasn't my|wasnt my|other|they|he|she|driver)\b/.test(s)) return "self";
  if (/\b(other|they|he|she|the driver|truck|store|owner|company|not my|wasn't my|wasnt my|ran a red|rear ended|hit me|their)\b/.test(s)) return "other";
  return "unknown";
}
