"use client";

import { jsPDF } from "jspdf";
import { EventLog, formatTime24, LICENSING_WORDING } from "./types";

function wrapText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  for (const line of lines) {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

export function buildEventLogPdf(event: EventLog): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 18;
  const maxWidth = 210 - margin * 2;
  let y = 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Event Log", margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text("Luna Springs · Operations", margin, y);
  y += 8;
  const closedLabel = event.submittedAt
    ? `Submitted ${new Date(event.submittedAt).toLocaleString()} · Manager: ${event.managerName || "—"}`
    : "Draft report";
  doc.text(closedLabel, margin, y);
  doc.setTextColor(0);
  y += 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Event", margin, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  y = wrapText(doc, `Event name: ${event.eventName || "—"}`, margin, y, maxWidth, 6);
  y = wrapText(doc, `Event date: ${event.eventDate || "—"}`, margin, y, maxWidth, 6);
  y = wrapText(doc, `Risk level: ${event.riskLevel || "—"}`, margin, y, maxWidth, 6);
  y = wrapText(doc, `Tickets sold: ${event.ticketsSold || "—"}`, margin, y, maxWidth, 6);
  y = wrapText(doc, `Attendance: ${event.attendance || "—"}`, margin, y, maxWidth, 6);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Licensing conditions", margin, y);
  y += 8;

  for (const cond of event.licensing) {
    if (y > 265) {
      doc.addPage();
      y = 20;
    }
    const answer =
      cond.answer === "yes" ? "Yes" : cond.answer === "no" ? "No" : "Unset";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    y = wrapText(
      doc,
      `(${cond.key}) ${LICENSING_WORDING[cond.key]} — ${answer}`,
      margin,
      y,
      maxWidth,
      5.5
    );
    if (cond.comments.trim()) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(60);
      y = wrapText(doc, `  Comments: ${cond.comments.trim()}`, margin, y, maxWidth, 5);
      doc.setTextColor(0);
    }
    y += 3;
  }

  if (event.closeComments.trim()) {
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Close comments", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    y = wrapText(doc, event.closeComments.trim(), margin, y, maxWidth, 5.5);
    y += 4;
  }

  if (y > 250) {
    doc.addPage();
    y = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Timed report", margin, y);
  y += 8;

  const sorted = [...event.entries].sort((a, b) => {
    if (a.time === b.time) return a.createdAt - b.createdAt;
    return a.time.localeCompare(b.time);
  });

  if (sorted.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.text("No entries logged.", margin, y);
  } else {
    for (const entry of sorted) {
      if (y > 275) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(formatTime24(entry.time), margin, y);
      doc.setFont("helvetica", "normal");
      const title = entry.label || entry.type;
      const line = `${title}${entry.comments ? ` — ${entry.comments}` : ""}`;
      y = wrapText(doc, line, margin + 16, y, maxWidth - 16, 5.5);
      y += 3;
    }
  }

  return doc;
}

export function downloadPdf(event: EventLog, filename?: string): void {
  const doc = buildEventLogPdf(event);
  const name =
    filename ||
    `event-log-${(event.eventName || "night")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "night"}.pdf`;
  doc.save(name);
}

export function pdfBase64(event: EventLog): string {
  const dataUri = buildEventLogPdf(event).output("datauristring");
  return dataUri.split(",")[1] || "";
}
