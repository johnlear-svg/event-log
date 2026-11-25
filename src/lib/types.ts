export type RiskLevel = "Low" | "Medium" | "High";

export type LicensingKey = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";

export type LicensingAnswer = "yes" | "no" | null;

export type LogType =
  | "Doors open"
  | "Toilet Check"
  | "Incident"
  | "Medical"
  | "Ejection"
  | "Lights Up"
  | "Venue Clear"
  | "Other";

export const LOG_TYPES: LogType[] = [
  "Doors open",
  "Toilet Check",
  "Incident",
  "Medical",
  "Ejection",
  "Lights Up",
  "Venue Clear",
  "Other",
];

export const LICENSING_WORDING: Record<LicensingKey, string> = {
  a: "all crimes reported to the venue",
  b: "all ejections of patrons",
  c: "any complaints received concerning crime and disorder",
  d: "any incidents of disorder at the premises",
  e: "all seizures of drugs or offensive weapons",
  f: "any faults in the CCTV system, Body Worn Cameras, searching equipment or scanning equipment",
  g: "any refusal of the sale of alcohol",
  h: "any visit by a relevant authority or emergency service",
};

export type LicensingCondition = {
  key: LicensingKey;
  answer: LicensingAnswer;
  comments: string;
};

export type LogEntry = {
  id: string;
  time: string; // HH:MM 24-hour
  type: LogType;
  /** Display title — custom when type is Other */
  label: string;
  comments: string;
  createdAt: number;
};

export type EventStatus = "draft" | "submitted";

export type EventLog = {
  id: string;
  status: EventStatus;
  eventName: string;
  /** Calendar date of the event as YYYY-MM-DD (night stays under this date) */
  eventDate: string;
  riskLevel: RiskLevel | "";
  ticketsSold: string;
  entries: LogEntry[];
  licensing: LicensingCondition[];
  closeComments: string;
  managerName: string;
  attendance: string;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
};

export type AppSettings = {
  recipients: string[];
};

export type AppData = {
  events: EventLog[];
  settings: AppSettings;
};

export function createEmptyLicensing(): LicensingCondition[] {
  return (Object.keys(LICENSING_WORDING) as LicensingKey[]).map((key) => ({
    key,
    answer: null,
    comments: "",
  }));
}

/** Today's date as YYYY-MM-DD in local time */
export function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function createDraftEvent(partial?: {
  eventName?: string;
  eventDate?: string;
  riskLevel?: RiskLevel | "";
  ticketsSold?: string;
}): EventLog {
  const now = new Date().toISOString();
  return {
    id: newId(),
    status: "draft",
    eventName: partial?.eventName ?? "",
    eventDate: partial?.eventDate || todayDate(),
    riskLevel: partial?.riskLevel ?? "",
    ticketsSold: partial?.ticketsSold ?? "",
    entries: [],
    licensing: createEmptyLicensing(),
    closeComments: "",
    managerName: "",
    attendance: "",
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
  };
}

export function createDefaultSettings(): AppSettings {
  return { recipients: [] };
}

export function createEmptyData(): AppData {
  return { events: [], settings: createDefaultSettings() };
}

/** 24-hour HH:MM */
export function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Format YYYY-MM-DD for display */
export function formatEventDate(ymd: string): string {
  if (!ymd) return "—";
  try {
    // Parse as local date (avoid UTC shift)
    const [y, m, d] = ymd.split("-").map(Number);
    if (!y || !m || !d) return ymd;
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return ymd;
  }
}

/** Ensure HH:MM is zero-padded 24h */
export function formatTime24(time: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time || "").trim());
  if (!m) return time || "—";
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

export function normalizeEvent(raw: EventLog): EventLog {
  const eventDate =
    raw.eventDate ||
    (raw.createdAt ? raw.createdAt.slice(0, 10) : todayDate());
  return {
    ...raw,
    eventDate,
    entries: (raw.entries || []).map((e) => ({
      ...e,
      time: formatTime24(e.time),
      label: e.label || e.type || "Log",
      type: e.type || "Other",
    })),
  };
}
