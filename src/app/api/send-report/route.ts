import { requireIdentity } from "../../../../cursor/identity";

export const runtime = "nodejs";

type Body = {
  recipients: string[];
  subject: string;
  eventName: string;
  pdfBase64: string;
  filename?: string;
};

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const recipients = (body.recipients || [])
    .map((e) => e.trim())
    .filter((e) => e && isEmail(e));

  if (recipients.length === 0) {
    return Response.json(
      { ok: false, error: "Add at least one valid recipient email." },
      { status: 400 }
    );
  }

  if (!body.pdfBase64 || typeof body.pdfBase64 !== "string") {
    return Response.json({ ok: false, error: "Missing PDF attachment." }, { status: 400 });
  }

  // Bound size to avoid unbounded paid API spend
  if (body.pdfBase64.length > 4_500_000) {
    return Response.json({ ok: false, error: "PDF too large to email." }, { status: 413 });
  }

  const filename =
    body.filename ||
    `event-log-${(body.eventName || "night")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "night"}.pdf`;

  const subject =
    body.subject ||
    `Event Log — ${body.eventName || "Night report"}`;

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
        `Event Log report for: ${body.eventName || "Untitled event"}`,
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
  return Response.json({ ok: true, mode: "sent", id: data.id || null });
}

export async function GET(request: Request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;

  const configured = Boolean(
    process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL
  );
  return Response.json({
    configured,
    mode: configured ? "live" : "fallback",
  });
}
