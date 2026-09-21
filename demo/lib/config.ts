/**
 * DEMO BRANDING AND INTAKE RULES.
 *
 * This is the only file to edit when pointing the demo at a real firm. Swap
 * the firm, the intake staff, the case types the firm takes, the qualifying
 * questions and the deadline table, and everything else follows.
 *
 * Setting: a personal injury firm in Tampa, Florida. Florida is chosen on
 * purpose: it is a two party consent state for call recording, and its
 * negligence deadline is two years, so both compliance rules get exercised
 * in every demo call.
 */

export const FIRM = {
  name: "Harbor Point Injury Law",
  shortName: "Harbor Point",
  tagline: "Every injured caller reaches a person, day or night",
  /** The number the agent gives out. Replaced by the real number at go live. */
  mainNumber: "(813) 555-0142",
  city: "Tampa",
  state: "FL",
  stateName: "Florida",
  timezone: "America/New_York",
  /** Florida requires every party's consent before a call is recorded. */
  recordingConsent: "two-party" as const,
};

/** Office hours. Outside these the after hours script and the on call rota apply. */
export const BUSINESS_HOURS = {
  weekdayOpenHour: 8.5,
  weekdayCloseHour: 17.5,
  saturdayOpenHour: 9,
  saturdayCloseHour: 13,
  sundayClosed: true,
};

export type StaffTone = "gold" | "teal" | "violet" | "slate";

export type Staff = {
  id: string;
  name: string;
  firstName: string;
  role: "intake" | "attorney";
  title: string;
  /** Day of week this person carries the after hours intake phone, 0 is Sunday. */
  onCallDays: number[];
  tone: StaffTone;
};

export const STAFF: Staff[] = [
  { id: "st_whitlock", name: "Dana Whitlock", firstName: "Dana", role: "intake", title: "Intake specialist", onCallDays: [1, 3, 5], tone: "gold" },
  { id: "st_ferreira", name: "Luis Ferreira", firstName: "Luis", role: "intake", title: "Intake specialist", onCallDays: [0, 2, 4, 6], tone: "teal" },
  { id: "st_castellano", name: "Maya Castellano", firstName: "Maya", role: "attorney", title: "Managing attorney", onCallDays: [], tone: "violet" },
  { id: "st_okoro", name: "Ben Okoro", firstName: "Ben", role: "attorney", title: "Attorney", onCallDays: [], tone: "slate" },
];

/**
 * The case types the firm takes, and the ones it refers out. A caller with
 * a matter the firm does not handle is thanked and referred, never signed.
 */
export type CaseType = {
  id: string;
  name: string;
  /** Spoken back to the caller, lower case, mid sentence. */
  spoken: string;
  keywords: string[];
  /** Years from the incident to the filing deadline in Florida. */
  deadlineYears: number;
  /** False for work the firm refers out. */
  accepted: boolean;
  /** Typical fee value of a signed case, for the board only. Never spoken. */
  typicalFee: number;
};

export const CASE_TYPES: CaseType[] = [
  { id: "auto", name: "Motor vehicle accident", spoken: "a car accident", keywords: ["car accident", "car crash", "rear ended", "rear-ended", "hit my car", "hit by a car", "truck", "motorcycle", "uber", "lyft", "t-boned", "collision", "crash", "wreck", "accident on"], deadlineYears: 2, accepted: true, typicalFee: 18000 },
  { id: "premises", name: "Slip and fall", spoken: "a fall on someone else's property", keywords: ["slip", "slipped", "fell", "fall", "tripped", "wet floor", "parking lot", "stairs", "grocery store", "walmart", "publix"], deadlineYears: 2, accepted: true, typicalFee: 12000 },
  { id: "dog_bite", name: "Dog bite", spoken: "a dog bite", keywords: ["dog bit", "dog bite", "bitten", "attacked by a dog", "dog attack"], deadlineYears: 2, accepted: true, typicalFee: 9000 },
  { id: "wrongful_death", name: "Wrongful death", spoken: "the loss of a family member", keywords: ["passed away", "died", "killed", "wrongful death", "lost my"], deadlineYears: 2, accepted: true, typicalFee: 60000 },
  { id: "product", name: "Defective product", spoken: "an injury from a product", keywords: ["defective", "product", "exploded", "caught fire", "recall", "malfunction"], deadlineYears: 2, accepted: true, typicalFee: 25000 },
  { id: "med_mal", name: "Medical malpractice", spoken: "a medical mistake", keywords: ["surgeon", "surgery went wrong", "misdiagnos", "hospital mistake", "doctor mistake", "malpractice", "wrong medication"], deadlineYears: 2, accepted: false, typicalFee: 0 },
  { id: "workers_comp", name: "Workplace injury", spoken: "an injury at work", keywords: ["at work", "on the job", "workers comp", "workman", "forklift", "warehouse", "my employer"], deadlineYears: 2, accepted: false, typicalFee: 0 },
  { id: "other", name: "Other injury", spoken: "an injury", keywords: [], deadlineYears: 2, accepted: true, typicalFee: 8000 },
];

/** Where a lead came from, shown as a tag on the matter in Lawmatics. */
export type LeadSource = "phone" | "phone_after_hours" | "web_form";

export const SOURCE_LABEL: Record<LeadSource, string> = {
  phone: "Phone",
  phone_after_hours: "After hours call",
  web_form: "Web form",
};

/** The firm's intake pipeline, in Lawmatics terms. */
export type Stage = "new_lead" | "qualified" | "attorney_review" | "retainer_sent" | "signed" | "referred" | "declined";

export const STAGES: { id: Stage; name: string }[] = [
  { id: "new_lead", name: "New lead" },
  { id: "qualified", name: "Qualified" },
  { id: "attorney_review", name: "Attorney review" },
  { id: "retainer_sent", name: "Retainer sent" },
  { id: "signed", name: "Signed" },
];

export const STAGE_LABEL: Record<Stage, string> = {
  new_lead: "New lead",
  qualified: "Qualified",
  attorney_review: "Attorney review",
  retainer_sent: "Retainer sent",
  signed: "Signed",
  referred: "Referred out",
  declined: "Declined",
};

/**
 * The questions a good intake specialist asks, per case type, in order.
 * The agent reads them one at a time. Nothing here asks for a social
 * security number, a date of birth, a card, or medical records.
 */
export const QUALIFYING_QUESTIONS: Record<string, string[]> = {
  auto: [
    "When did the accident happen?",
    "Were you hurt, and have you seen a doctor or been to the emergency room?",
    "Who do you think was at fault, and did the police come out and write a report?",
    "Have you already spoken to a lawyer about this, or signed anything with one?",
  ],
  premises: [
    "When did the fall happen, and where were you?",
    "Were you hurt, and have you had any medical treatment?",
    "Did you report it to the business or the property owner at the time?",
    "Have you already spoken to a lawyer about this?",
  ],
  dog_bite: [
    "When did it happen?",
    "Have you had medical treatment for the bite?",
    "Do you know who owns the dog?",
    "Have you already spoken to a lawyer about this?",
  ],
  wrongful_death: [
    "I am very sorry. When did this happen?",
    "What is your relationship to the person who passed?",
    "Have you or the family spoken to a lawyer about this yet?",
  ],
  product: [
    "When did it happen?",
    "What was the product, and do you still have it?",
    "Have you had medical treatment?",
    "Have you already spoken to a lawyer about this?",
  ],
  med_mal: ["When did the treatment in question happen?"],
  workers_comp: ["When did it happen, and has your employer been told?"],
  other: [
    "When did it happen?",
    "Were you hurt, and have you had medical treatment?",
    "Who do you believe was responsible?",
    "Have you already spoken to a lawyer about this?",
  ],
};

/** Consent and disclosure scripts, with a version so the audit can prove which one ran. */
export const SCRIPTS = {
  version: "v1.0",
  recordingDisclosure: "This call is recorded, and you're speaking with an automated intake assistant.",
  smsConsent:
    "Would you like a text with your case reference and a link to sign the retainer on your phone? Message and data rates may apply, and you can reply STOP at any time.",
  tcpaForm:
    "By submitting, you agree that Harbor Point Injury Law may call and text this number about your inquiry, including with automated technology. Consent is not a condition of hiring the firm.",
};

/** The number the listing measures the whole build by. */
export const SPEED_TARGET_SECONDS = 10;

/** How close to the filing deadline is close enough to escalate to an attorney today. */
export const DEADLINE_ESCALATION_DAYS = 90;

export function caseTypeById(id: string): CaseType | undefined {
  return CASE_TYPES.find((c) => c.id === id);
}

export function staffById(id: string): Staff | undefined {
  return STAFF.find((s) => s.id === id);
}

/** Classifies a caller's own words into a case type. Never a legal opinion, just routing. */
export function classify(text: string): CaseType {
  const haystack = String(text ?? "").toLowerCase();
  // Referral categories first, so "hurt at work in a car" routes to the specialist.
  for (const type of CASE_TYPES.filter((c) => !c.accepted)) {
    if (type.keywords.some((k) => haystack.includes(k))) return type;
  }
  for (const type of CASE_TYPES.filter((c) => c.accepted && c.id !== "other")) {
    if (type.keywords.some((k) => haystack.includes(k))) return type;
  }
  return caseTypeById("other")!;
}

/** Whoever is carrying the after hours intake phone on a given date. */
export function onCallIntake(when: Date = new Date()): Staff {
  const day = when.getDay();
  return STAFF.find((s) => s.role === "intake" && s.onCallDays.includes(day)) ?? STAFF[0];
}

/** The attorney a qualified matter is assigned to for review. */
export function reviewingAttorney(): Staff {
  return STAFF.find((s) => s.role === "attorney") ?? STAFF[2];
}

export function isAfterHours(when: Date = new Date()): boolean {
  // Demos usually happen in the afternoon, but the story is an after hours
  // lead. This lets you show the night intake scene at two in the afternoon.
  if (process.env.DEMO_FORCE_AFTER_HOURS === "true") return true;
  if (process.env.DEMO_FORCE_AFTER_HOURS === "false") return false;

  const day = when.getDay();
  const hour = when.getHours() + when.getMinutes() / 60;
  if (day === 0) return BUSINESS_HOURS.sundayClosed;
  if (day === 6) return hour < BUSINESS_HOURS.saturdayOpenHour || hour >= BUSINESS_HOURS.saturdayCloseHour;
  return hour < BUSINESS_HOURS.weekdayOpenHour || hour >= BUSINESS_HOURS.weekdayCloseHour;
}

/* ------------------------------------------------------------------ */
/* Qualification. The part a generic receptionist does not do.          */
/* ------------------------------------------------------------------ */

export type Qualification = {
  status: "qualified" | "review" | "disqualified" | "referral";
  /** 0 to 100, how strong the intake looks. Shown on the matter card, never spoken. */
  score: number;
  /** Plain sentences an intake manager can read. */
  reasons: string[];
  /** Short flags for the matter card. */
  flags: string[];
  /** Days until the filing deadline, negative when it has passed. */
  daysToDeadline: number | null;
  stage: Stage;
};

export type QualifyInput = {
  caseType: CaseType;
  incidentDate: Date | null;
  treated: "yes" | "no" | "unknown";
  fault: "other" | "self" | "shared" | "unknown";
  policeReport: boolean | null;
  priorCounsel: "yes" | "no" | "unknown";
  incidentState: string | null;
  now?: Date;
};

const DAY_MS = 86_400_000;

export function qualify(input: QualifyInput): Qualification {
  const now = input.now ?? new Date();
  const reasons: string[] = [];
  const flags: string[] = [];
  let score = 40;

  let daysToDeadline: number | null = null;
  if (input.incidentDate) {
    const deadline = new Date(input.incidentDate);
    deadline.setFullYear(deadline.getFullYear() + input.caseType.deadlineYears);
    daysToDeadline = Math.round((deadline.getTime() - now.getTime()) / DAY_MS);
  }

  // 1. Work the firm refers out. Decided before anything else so the caller
  //    is not put through twenty questions for a case we will not take.
  if (!input.caseType.accepted) {
    return {
      status: "referral",
      score: 0,
      reasons: [`${input.caseType.name} is handled by a referral partner, not this firm.`],
      flags: ["Referral"],
      daysToDeadline,
      stage: "referred",
    };
  }

  // 2. The filing deadline. Past it, nothing can be done and it is unkind to pretend.
  if (daysToDeadline !== null && daysToDeadline < 0) {
    return {
      status: "disqualified",
      score: 0,
      reasons: [
        `The incident was ${Math.abs(daysToDeadline)} days past Florida's ${input.caseType.deadlineYears} year filing deadline.`,
      ],
      flags: ["Deadline passed"],
      daysToDeadline,
      stage: "declined",
    };
  }

  // 3. Someone else already represents them. Signing them would be a conflict.
  if (input.priorCounsel === "yes") {
    return {
      status: "disqualified",
      score: 0,
      reasons: ["The caller already has a lawyer on this matter."],
      flags: ["Represented"],
      daysToDeadline,
      stage: "declined",
    };
  }

  // 4. Out of state incidents go to review, the firm is licensed in Florida.
  const state = (input.incidentState ?? "").trim().toUpperCase();
  if (state && state !== FIRM.state && state !== FIRM.stateName.toUpperCase()) {
    flags.push("Out of state");
    reasons.push(`The incident was in ${input.incidentState}, outside Florida. An attorney decides whether to co counsel or refer.`);
    score -= 20;
  }

  // 5. The strength signals a paralegal weighs.
  if (input.treated === "yes") {
    score += 25;
    reasons.push("Medical treatment is documented.");
  } else if (input.treated === "no") {
    score -= 10;
    flags.push("No treatment yet");
    reasons.push("No medical treatment yet. Intake will advise seeing a doctor.");
  }

  if (input.fault === "other") {
    score += 20;
    reasons.push("Another party appears to be at fault.");
  } else if (input.fault === "self") {
    return {
      status: "disqualified",
      score: 0,
      reasons: ["The caller believes they were at fault and no other party is involved."],
      flags: ["No liable party"],
      daysToDeadline,
      stage: "declined",
    };
  } else if (input.fault === "shared") {
    score += 5;
    flags.push("Shared fault");
    reasons.push("Fault may be shared. Florida bars recovery above fifty percent fault, so an attorney reviews.");
  }

  if (input.policeReport) {
    score += 10;
    reasons.push("A police report exists.");
  }

  if (daysToDeadline !== null && daysToDeadline <= DEADLINE_ESCALATION_DAYS) {
    flags.push("Deadline close");
    reasons.push(`Only ${daysToDeadline} days to the filing deadline. Attorney callback today.`);
  }

  score = Math.max(0, Math.min(100, score));

  const needsReview =
    flags.includes("Shared fault") || flags.includes("Out of state") || flags.includes("Deadline close") || score < 55;

  if (needsReview) {
    return { status: "review", score, reasons, flags, daysToDeadline, stage: "attorney_review" };
  }
  return { status: "qualified", score, reasons, flags, daysToDeadline, stage: "qualified" };
}

export const QUALIFICATION_LABEL: Record<Qualification["status"], string> = {
  qualified: "Qualified",
  review: "Attorney review",
  disqualified: "Declined",
  referral: "Referral",
};
