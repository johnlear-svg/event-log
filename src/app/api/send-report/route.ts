import { requireIdentity } from "../../../../cursor/identity";

export const runtime = "nodejs";

type Body = {
  recipients?: string[];
  subject?: string;
  eventName?: string;
  pdfBase64?: string;
  filename?: string;
};

const MAX_PDF_BASE64_CHARS = 3_000_000; // ~2.2MB binary
const MAX_RECIPIENTS = 20;
const MAX_SUBJECT_LEN = 200;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

/** In-memory send rate limits keyed by identity (best-effort on serverless). */
const sendAttempts = new Map<string, number[]>();

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseAllowlist(): string[] {
  const raw = process.env.EVENT_LOG_EMAIL_RECIPIENTS || "";
  const seen = new Set<string>();
  const list: string[] = [];
  for (const part of raw.split(",")) {
    const email = part.trim().toLowerCase();
    if (!email || !isEmail(email) || seen.has(email)) continue;
    seen.add(email);
    list.push(email);
  }
  return list;
}

function sanitizeFilename(raw: string | undefined, eventName: string): string | null {
  const fallback = `event-log-${(eventName || "night")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "night"}.pdf`;

  const candidate = (raw && raw.trim()) || fallback;
  // Only a simple basename ending in .pdf — no paths or odd chars
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,118}\.pdf$/.test(candidate)) {
    return null;
  }
  if (candidate.includes("..") || candidate.includes("/") || candidate.includes("\\")) {
    return null;
  }
  return candidate;
}

function sanitizeSubject(raw: string | undefined, eventName: string): string {
  const base =
    (raw && raw.trim()) ||
    `Event Log — ${eventName || "Night report"}`;
  return base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, MAX_SUBJECT_LEN);
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const prior = (sendAttempts.get(key) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  if (prior.length >= RATE_LIMIT_MAX) {
    sendAttempts.set(key, prior);
    return false;
  }
  prior.push(now);
  sendAttempts.set(key, prior);
  return true;
}

export async function POST(request: Request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return Response.json(
      {
        ok: false,
        mode: "fallback",
        error:
          "Email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.",
      },
      { status: 503 }
    );
  }

  const allowlist = parseAllowlist();
  if (allowlist.length === 0) {
    return Response.json(
      {
        ok: false,
        mode: "fallback",
        error:
          "No allowed recipients configured. Set EVENT_LOG_EMAIL_RECIPIENTS.",
      },
      { status: 503 }
    );
  }

  const rateKey = identity.sub || identity.email || "anonymous";
  if (!checkRateLimit(rateKey)) {
    return Response.json(
      { ok: false, error: "Too many send attempts. Try again later." },
      { status: 429 }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const requested = (body.recipients || [])
    .map((e) => (typeof e === "string" ? e.trim().toLowerCase() : ""))
    .filter((e) => e && isEmail(e));

  if (requested.length === 0) {
    return Response.json(
      { ok: false, error: "Add at least one valid recipient email." },
      { status: 400 }
    );
  }
  if (requested.length > MAX_RECIPIENTS) {
    return Response.json(
      { ok: false, error: "Too many recipients." },
      { status: 400 }
    );
  }

  const allowSet = new Set(allowlist);
  const unknown = requested.filter((e) => !allowSet.has(e));
  if (unknown.length > 0) {
    return Response.json(
      {
        ok: false,
        error: "One or more recipients are not on the server allowlist.",
        rejected: unknown,
      },
      { status: 403 }
    );
  }

  const recipients = requested.filter((e) => allowSet.has(e));

  if (!body.pdfBase64 || typeof body.pdfBase64 !== "string") {
    return Response.json({ ok: false, error: "Missing PDF attachment." }, { status: 400 });
  }

  // Expect raw base64 only (no data-URL prefix)
  if (body.pdfBase64.includes(",") || !/^[A-Za-z0-9+/=\r\n]+$/.test(body.pdfBase64)) {
    return Response.json(
      { ok: false, error: "PDF must be raw base64, not a data URL." },
      { status: 400 }
    );
  }

  if (body.pdfBase64.length > MAX_PDF_BASE64_CHARS) {
    return Response.json({ ok: false, error: "PDF too large to email." }, { status: 413 });
  }

  const eventName =
    typeof body.eventName === "string" ? body.eventName.slice(0, 120) : "";
  const filename = sanitizeFilename(
    typeof body.filename === "string" ? body.filename : undefined,
    eventName
  );
  if (!filename) {
    return Response.json({ ok: false, error: "Invalid PDF filename." }, { status: 400 });
  }

  const subject = sanitizeSubject(
    typeof body.subject === "string" ? body.subject : undefined,
    eventName
  );

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      text: [
        `Event Log report for: ${eventName || "Untitled event"}`,
        "",
        "The full duty-manager log is attached as a PDF.",
        "",
        `Sent by ${identity.email || identity.name || "duty manager"} via Event Log.`,
      ].join("\n"),
      attachments: [
        {
          filename,
          content: body.pdfBase64,
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Resend error", res.status, detail.slice(0, 200));
    return Response.json(
      {
        ok: false,
        error: "Mail provider rejected the send. Check RESEND_FROM_EMAIL and domain.",
      },
      { status: 502 }
    );
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return Response.json({
    ok: true,
    mode: "sent",
    id: data.id || null,
    recipients,
  });
}

export async function GET(request: Request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;

  const allowlist = parseAllowlist();
  const configured = Boolean(
    process.env.RESEND_API_KEY &&
      process.env.RESEND_FROM_EMAIL &&
      allowlist.length > 0
  );
  return Response.json({
    configured,
    mode: configured ? "live" : "fallback",
    allowlist,
  });
}
