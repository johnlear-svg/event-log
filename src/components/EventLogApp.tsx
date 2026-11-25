"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  deleteEvent,
  loadData,
  saveData,
  upsertEvent,
} from "@/lib/storage";
import { downloadPdf, pdfBase64 } from "@/lib/pdf";
import {
  AppData,
  createDraftEvent,
  EventLog,
  formatEventDate,
  formatTime24,
  LICENSING_WORDING,
  LicensingKey,
  LOG_TYPES,
  LogType,
  newId,
  nowTime,
  RiskLevel,
  todayDate,
} from "@/lib/types";

type View =
  | { name: "dashboard" }
  | { name: "setup" }
  | { name: "live"; eventId: string }
  | { name: "close"; eventId: string }
  | { name: "previous" }
  | { name: "drafts" }
  | { name: "settings" };

type EmailMode = "unknown" | "live" | "fallback";

export default function EventLogApp() {
  const [data, setData] = useState<AppData | null>(null);
  const [view, setView] = useState<View>({ name: "dashboard" });
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [emailMode, setEmailMode] = useState<EmailMode>("unknown");
  const [busy, setBusy] = useState(false);

  // Setup form
  const [setupName, setSetupName] = useState("");
  const [setupDate, setSetupDate] = useState(todayDate());
  const [setupRisk, setSetupRisk] = useState<RiskLevel | "">("");
  const [setupTickets, setSetupTickets] = useState("");

  // Live composer
  const [draftTime, setDraftTime] = useState(nowTime());
  const [draftType, setDraftType] = useState<LogType | "">("");
  const [draftOtherLabel, setDraftOtherLabel] = useState("");
  const [draftComments, setDraftComments] = useState("");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // Settings
  const [recipientDraft, setRecipientDraft] = useState("");

  useEffect(() => {
    setData(loadData());
    fetch("/api/send-report")
      .then((r) => r.json())
      .then((d: { mode?: string }) =>
        setEmailMode(d.mode === "live" ? "live" : "fallback")
      )
      .catch(() => setEmailMode("fallback"));
  }, []);

  useEffect(() => {
    if (!data) return;
    saveData(data);
  }, [data]);

  const drafts = useMemo(
    () =>
      (data?.events || [])
        .filter((e) => e.status === "draft")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [data]
  );

  const previous = useMemo(
    () =>
      (data?.events || [])
        .filter((e) => e.status === "submitted")
        .sort((a, b) => {
          const byDate = (b.eventDate || "").localeCompare(a.eventDate || "");
          if (byDate !== 0) return byDate;
          return (b.submittedAt || b.updatedAt).localeCompare(
            a.submittedAt || a.updatedAt
          );
        }),
    [data]
  );

  if (!data) {
    return (
      <div className="app-shell fade-in">
        <p className="ops-eyebrow">Luna Springs · Operations</p>
        <h1 className="ops-title">Event Log</h1>
        <p className="ops-sub">Loading…</p>
      </div>
    );
  }

  const store = data;

  function patchData(updater: (prev: AppData) => AppData) {
    setData((prev) => (prev ? updater(prev) : prev));
  }

  function getEvent(id: string): EventLog | undefined {
    return store.events.find((e) => e.id === id);
  }

  function touchEvent(event: EventLog): EventLog {
    return { ...event, updatedAt: new Date().toISOString() };
  }

  function resetComposer() {
    setDraftTime(nowTime());
    setDraftType("");
    setDraftOtherLabel("");
    setDraftComments("");
    setEditingEntryId(null);
  }

  function startSetup() {
    setSetupName("");
    setSetupDate(todayDate());
    setSetupRisk("");
    setSetupTickets("");
    setStatusMsg(null);
    setView({ name: "setup" });
  }

  function submitSetup(e?: FormEvent) {
    e?.preventDefault();
    if (!setupName.trim()) {
      setStatusMsg("Enter an event name.");
      return;
    }
    if (!setupDate) {
      setStatusMsg("Select an event date.");
      return;
    }
    if (!setupRisk) {
      setStatusMsg("Select a risk level.");
      return;
    }
    const event = createDraftEvent({
      eventName: setupName.trim(),
      eventDate: setupDate,
      riskLevel: setupRisk,
      ticketsSold: setupTickets.replace(/[^\d]/g, ""),
    });
    patchData((prev) => upsertEvent(prev, event));
    resetComposer();
    setStatusMsg(null);
    setView({ name: "live", eventId: event.id });
  }

  function openLive(eventId: string) {
    resetComposer();
    setStatusMsg(null);
    setView({ name: "live", eventId });
  }

  function startEditEntry(eventId: string, entryId: string) {
    const event = getEvent(eventId);
    const entry = event?.entries.find((e) => e.id === entryId);
    if (!entry) return;
    setEditingEntryId(entry.id);
    setDraftTime(formatTime24(entry.time));
    setDraftType(entry.type);
    setDraftOtherLabel(entry.type === "Other" ? entry.label : "");
    setDraftComments(entry.comments);
    setStatusMsg(null);
  }

  function addLogEntry(eventId: string) {
    const event = getEvent(eventId);
    if (!event) return;
    if (!draftType) {
      setStatusMsg("Pick a log type.");
      return;
    }
    const time = formatTime24(draftTime || nowTime());
    const comments = draftComments.trim();
    let label: string = draftType;
    if (draftType === "Other") {
      label = draftOtherLabel.trim();
      if (!label) {
        setStatusMsg("Enter a name for this log entry.");
        return;
      }
    }
    const needsComments = ["Incident", "Medical", "Ejection"].includes(draftType);
    if (needsComments && !comments) {
      setStatusMsg(`Add comments for ${draftType}.`);
      return;
    }

    let nextEntries;
    if (editingEntryId) {
      nextEntries = event.entries.map((e) =>
        e.id === editingEntryId
          ? { ...e, time, type: draftType, label, comments }
          : e
      );
    } else {
      nextEntries = [
        ...event.entries,
        {
          id: newId(),
          time,
          type: draftType,
          label,
          comments,
          createdAt: Date.now(),
        },
      ];
    }

    const next = touchEvent({ ...event, entries: nextEntries });
    patchData((prev) => upsertEvent(prev, next));
    resetComposer();
    setStatusMsg(null);
  }

  function removeLogEntry(eventId: string, entryId: string) {
    const event = getEvent(eventId);
    if (!event) return;
    const next = touchEvent({
      ...event,
      entries: event.entries.filter((e) => e.id !== entryId),
    });
    patchData((prev) => upsertEvent(prev, next));
    if (editingEntryId === entryId) resetComposer();
  }

  function updateCloseField(
    eventId: string,
    patch: Partial<EventLog> | ((ev: EventLog) => EventLog)
  ) {
    const event = getEvent(eventId);
    if (!event) return;
    const next =
      typeof patch === "function"
        ? touchEvent(patch(event))
        : touchEvent({ ...event, ...patch });
    patchData((prev) => upsertEvent(prev, next));
  }

  function setLicensing(
    eventId: string,
    key: LicensingKey,
    answer: "yes" | "no"
  ) {
    updateCloseField(eventId, (ev) => ({
      ...ev,
      licensing: ev.licensing.map((c) =>
        c.key === key ? { ...c, answer } : c
      ),
    }));
  }

  function setLicensingComments(
    eventId: string,
    key: LicensingKey,
    comments: string
  ) {
    updateCloseField(eventId, (ev) => ({
      ...ev,
      licensing: ev.licensing.map((c) =>
        c.key === key ? { ...c, comments } : c
      ),
    }));
  }

  function addRecipient(e?: FormEvent) {
    e?.preventDefault();
    const email = recipientDraft.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatusMsg("Enter a valid email.");
      return;
    }
    if (store.settings.recipients.includes(email)) {
      setRecipientDraft("");
      return;
    }
    patchData((prev) => ({
      ...prev,
      settings: { recipients: [...prev.settings.recipients, email] },
    }));
    setRecipientDraft("");
  }

  function removeRecipient(email: string) {
    patchData((prev) => ({
      ...prev,
      settings: {
        recipients: prev.settings.recipients.filter((r) => r !== email),
      },
    }));
  }

  function openMailto(event: EventLog, filename: string) {
    const to = store.settings.recipients.join(",");
    const subject = encodeURIComponent(
      `Event Log — ${event.eventName || "Night report"}`
    );
    const body = encodeURIComponent(
      [
        `Please find the Event Log PDF attached (${filename}).`,
        "",
        `Event: ${event.eventName || "—"}`,
        `Manager: ${event.managerName || "—"}`,
        `Risk: ${event.riskLevel || "—"}`,
        `Attendance: ${event.attendance || "—"}`,
        "",
        "Note: Live email is not configured. Attach the downloaded PDF manually.",
      ].join("\n")
    );
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  async function submitClose(eventId: string) {
    const event = getEvent(eventId);
    if (!event) return;

    if (!event.managerName.trim()) {
      setStatusMsg("Manager name is required to close.");
      return;
    }
    const unset = event.licensing.filter((c) => c.answer === null);
    if (unset.length > 0) {
      setStatusMsg("Answer all licensing conditions (a–h).");
      return;
    }
    if (store.settings.recipients.length === 0) {
      setStatusMsg("Add at least one recipient in Settings before sending.");
      return;
    }

    setBusy(true);
    setStatusMsg(null);

    const closed: EventLog = {
      ...event,
      status: "submitted",
      managerName: event.managerName.trim(),
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    patchData((prev) => upsertEvent(prev, closed));

    const filename = `event-log-${(closed.eventName || "night")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "night"}.pdf`;
    const base64 = pdfBase64(closed);
    const recipients = store.settings.recipients;

    try {
      const res = await fetch("/api/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients,
          eventName: closed.eventName,
          subject: `Event Log — ${closed.eventName || "Night report"}`,
          pdfBase64: base64,
          filename,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && payload.ok) {
        setStatusMsg(`Closed & emailed to ${recipients.join(", ")}.`);
      } else {
        downloadPdf(closed, filename);
        openMailto(closed, filename);
        setStatusMsg(
          `Closed. Fallback: PDF downloaded + mailto opened (${payload.error || "email not configured"}).`
        );
        setEmailMode("fallback");
      }
    } catch {
      downloadPdf(closed, filename);
      openMailto(closed, filename);
      setStatusMsg("Closed. Fallback: PDF downloaded + mailto opened.");
      setEmailMode("fallback");
    } finally {
      setBusy(false);
      setView({ name: "previous" });
    }
  }

  function confirmDeleteDraft(id: string) {
    if (!window.confirm("Delete this draft log?")) return;
    patchData((prev) => deleteEvent(prev, id));
    setStatusMsg("Draft deleted.");
  }

  /* ——— Views ——— */

  if (view.name === "dashboard") {
    return (
      <div className="app-shell fade-in">
        <p className="ops-eyebrow">Luna Springs · Operations</p>
        <h1 className="ops-title">Event Log</h1>

        {statusMsg && <div className="banner banner-info">{statusMsg}</div>}

        <div className="dash-actions">
          <button type="button" className="dash-card" onClick={startSetup}>
            <div>
              <strong>New Event Log</strong>
            </div>
          </button>
          <button
            type="button"
            className="dash-card"
            onClick={() => {
              setStatusMsg(null);
              setView({ name: "previous" });
            }}
          >
            <div>
              <strong>Previous Event Logs</strong>
              <span>
                {previous.length === 0
                  ? "None yet"
                  : `${previous.length} submitted`}
              </span>
            </div>
          </button>
          <button
            type="button"
            className="dash-card"
            onClick={() => {
              setStatusMsg(null);
              setView({ name: "drafts" });
            }}
          >
            <div>
              <strong>Unfinished logs</strong>
              <span>
                {drafts.length === 0
                  ? "None open"
                  : `${drafts.length} open`}
              </span>
            </div>
          </button>
        </div>

        <div className="btn-row">
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setView({ name: "settings" })}
          >
            Recipients
          </button>
        </div>
      </div>
    );
  }

  if (view.name === "setup") {
    return (
      <div className="app-shell fade-in">
        <div className="topbar">
          <div>
            <p className="ops-eyebrow">Luna Springs · Operations</p>
            <h1 className="ops-title">New Event Log</h1>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setView({ name: "dashboard" })}
          >
            Back
          </button>
        </div>

        {statusMsg && <div className="banner banner-warn">{statusMsg}</div>}

        <form className="panel" onSubmit={submitSetup}>
          <div className="field">
            <label htmlFor="event-name">Event name</label>
            <input
              id="event-name"
              value={setupName}
              onChange={(e) => setSetupName(e.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="field">
            <label htmlFor="event-date">Event date</label>
            <input
              id="event-date"
              type="date"
              value={setupDate}
              onChange={(e) => setSetupDate(e.target.value)}
            />
          </div>

          <div className="field">
            <label>Risk level</label>
            <div className="risk-row">
              {(["Low", "Medium", "High"] as RiskLevel[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  className="risk-chip"
                  data-level={level}
                  data-active={setupRisk === level}
                  onClick={() => setSetupRisk(level)}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="tickets">Tickets sold</label>
            <input
              id="tickets"
              inputMode="numeric"
              value={setupTickets}
              onChange={(e) =>
                setSetupTickets(e.target.value.replace(/[^\d]/g, ""))
              }
              placeholder="0"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block">
            Open live log
          </button>
        </form>
      </div>
    );
  }

  if (view.name === "drafts") {
    return (
      <div className="app-shell fade-in">
        <div className="topbar">
          <div>
            <p className="ops-eyebrow">Luna Springs · Operations</p>
            <h1 className="ops-title">Unfinished logs</h1>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setView({ name: "dashboard" })}
          >
            Back
          </button>
        </div>

        {statusMsg && <div className="banner banner-info">{statusMsg}</div>}

        <div className="panel">
          {drafts.length === 0 ? (
            <p className="empty">No unfinished logs — start a new event log.</p>
          ) : (
            <ul className="list">
              {drafts.map((ev) => (
                <li className="list-row" key={ev.id}>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      textAlign: "left",
                      minHeight: 0,
                    }}
                    onClick={() => openLive(ev.id)}
                  >
                    <p className="list-meta">
                      {formatEventDate(ev.eventDate || ev.updatedAt.slice(0, 10))}
                    </p>
                    <p className="list-title">{ev.eventName || "Untitled"}</p>
                    <p className="list-sub">
                      {ev.riskLevel || "Risk unset"} · {ev.entries.length}{" "}
                      entries
                    </p>
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-small"
                    onClick={() => confirmDeleteDraft(ev.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  if (view.name === "previous") {
    return (
      <div className="app-shell fade-in">
        <div className="topbar">
          <div>
            <p className="ops-eyebrow">Luna Springs · Operations</p>
            <h1 className="ops-title">Previous Event Logs</h1>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setView({ name: "dashboard" })}
          >
            Back
          </button>
        </div>

        {statusMsg && <div className="banner banner-ok">{statusMsg}</div>}

        <div className="panel">
          {previous.length === 0 ? (
            <p className="empty">No submitted logs yet.</p>
          ) : (
            <ul className="list">
              {previous.map((ev) => (
                <li className="list-row" key={ev.id}>
                  <div>
                    <p className="list-meta">
                      {formatEventDate(ev.eventDate)}
                    </p>
                    <p className="list-title">{ev.eventName || "Untitled"}</p>
                    <p className="list-sub">
                      Manager: {ev.managerName || "—"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => {
                      downloadPdf(ev);
                      setStatusMsg(`PDF downloaded for ${ev.eventName}.`);
                    }}
                  >
                    PDF
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  if (view.name === "settings") {
    return (
      <div className="app-shell fade-in">
        <div className="topbar">
          <div>
            <p className="ops-eyebrow">Luna Springs · Operations</p>
            <h1 className="ops-title">Recipients</h1>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setView({ name: "dashboard" })}
          >
            Back
          </button>
        </div>

        <div
          className={`banner ${emailMode === "live" ? "banner-ok" : "banner-warn"}`}
        >
          {emailMode === "live"
            ? "Live email configured (Resend)."
            : "Fallback mode: PDF download + mailto until RESEND_API_KEY / RESEND_FROM_EMAIL are set."}
        </div>

        {statusMsg && <div className="banner banner-info">{statusMsg}</div>}

        <div className="panel">
          <ul className="list">
            {store.settings.recipients.length === 0 && (
              <li className="empty">No recipients yet.</li>
            )}
            {store.settings.recipients.map((email) => (
              <li className="list-row" key={email}>
                <p className="list-title" style={{ fontFamily: "inherit" }}>
                  {email}
                </p>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => removeRecipient(email)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={addRecipient}>
            <div className="field">
              <label htmlFor="recipient">Add email</label>
              <input
                id="recipient"
                type="email"
                value={recipientDraft}
                onChange={(e) => setRecipientDraft(e.target.value)}
                placeholder="ops@venue.example"
              />
            </div>
            <button type="submit" className="btn btn-primary btn-small">
              Add
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (view.name === "live" || view.name === "close") {
    const event = getEvent(view.eventId);
    if (!event) {
      return (
        <div className="app-shell">
          <p className="empty">Event not found.</p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setView({ name: "dashboard" })}
          >
            Dashboard
          </button>
        </div>
      );
    }

    const sorted = [...event.entries].sort((a, b) => {
      if (a.time === b.time) return a.createdAt - b.createdAt;
      return a.time.localeCompare(b.time);
    });

    if (view.name === "close") {
      return (
        <div className="app-shell fade-in">
          <div className="topbar">
            <div>
              <p className="ops-eyebrow">Luna Springs · Operations</p>
              <h1 className="ops-title">Close event</h1>
              <p className="ops-sub" style={{ marginBottom: 0 }}>
                {event.eventName}
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => setView({ name: "live", eventId: event.id })}
              disabled={busy}
            >
              Back
            </button>
          </div>

          {statusMsg && <div className="banner banner-warn">{statusMsg}</div>}

          <div
            className={`banner ${emailMode === "live" ? "banner-ok" : "banner-warn"}`}
          >
            {emailMode === "live"
              ? "Live email configured."
              : "Fallback: PDF download + mailto if Resend is unset."}
          </div>

          <div className="panel">
            <h2 className="panel-title">Licensing conditions</h2>
            {event.licensing.map((cond) => (
              <div className="license-item" key={cond.key}>
                <div className="license-head">
                  <p className="license-label">
                    <span className="license-key">({cond.key})</span>
                    {LICENSING_WORDING[cond.key]}
                  </p>
                  <div className="yn">
                    <button
                      type="button"
                      data-active={cond.answer === "yes" ? "yes" : undefined}
                      onClick={() => setLicensing(event.id, cond.key, "yes")}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      data-active={cond.answer === "no" ? "no" : undefined}
                      onClick={() => setLicensing(event.id, cond.key, "no")}
                    >
                      No
                    </button>
                  </div>
                </div>
                <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
                  <label htmlFor={`lic-c-${cond.key}`}>Comments</label>
                  <textarea
                    id={`lic-c-${cond.key}`}
                    value={cond.comments}
                    onChange={(e) =>
                      setLicensingComments(event.id, cond.key, e.target.value)
                    }
                    placeholder="Optional notes for this condition"
                    rows={2}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="field">
              <label htmlFor="close-comments">Overall close comments</label>
              <textarea
                id="close-comments"
                value={event.closeComments}
                onChange={(e) =>
                  updateCloseField(event.id, { closeComments: e.target.value })
                }
                placeholder="Anything else for the night report"
                rows={3}
              />
            </div>
            <div className="field">
              <label htmlFor="attendance">Attendance (turned up)</label>
              <input
                id="attendance"
                inputMode="numeric"
                value={event.attendance}
                onChange={(e) =>
                  updateCloseField(event.id, {
                    attendance: e.target.value.replace(/[^\d]/g, ""),
                  })
                }
                placeholder="e.g. 312"
              />
            </div>
            <div className="field">
              <label htmlFor="manager">Manager name (required)</label>
              <input
                id="manager"
                value={event.managerName}
                onChange={(e) =>
                  updateCloseField(event.id, { managerName: e.target.value })
                }
                placeholder="Duty manager full name"
                autoComplete="name"
              />
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={busy}
              onClick={() => submitClose(event.id)}
            >
              {busy ? "Saving…" : "Save Event and Email PDF"}
            </button>
          </div>
        </div>
      );
    }

    // Live log
    return (
      <div className="app-shell fade-in">
        <div className="topbar">
          <div>
            <p className="ops-eyebrow">Luna Springs · Operations</p>
            <h1 className="ops-title">{event.eventName || "Live log"}</h1>
            <p className="ops-sub" style={{ marginBottom: 0 }}>
              {event.riskLevel || "Risk unset"}
              {event.ticketsSold ? ` · ${event.ticketsSold} tickets` : ""}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setView({ name: "dashboard" })}
          >
            Home
          </button>
        </div>

        {statusMsg && <div className="banner banner-info">{statusMsg}</div>}

        <div className="panel">
          <h2 className="panel-title">Log entries</h2>
          {sorted.length === 0 ? (
            <p className="empty">No entries yet — add one below.</p>
          ) : (
            <ul className="list">
              {sorted.map((entry) => (
                <li className="log-item" key={entry.id}>
                  <div className="log-time">{formatTime24(entry.time)}</div>
                  <div>
                    <p className="log-type">{entry.label || entry.type}</p>
                    {entry.comments ? (
                      <p className="log-comments">{entry.comments}</p>
                    ) : null}
                  </div>
                  <div className="log-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Edit entry"
                      onClick={() => startEditEntry(event.id, entry.id)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Delete entry"
                      onClick={() => removeLogEntry(event.id, entry.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <h2 className="panel-title">
            {editingEntryId ? "Edit log" : "Add log"}
          </h2>
          <div className="quick-grid" role="group" aria-label="Log types">
            {LOG_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className="quick-btn"
                data-active={draftType === type}
                onClick={() => {
                  setDraftType(type);
                  if (!editingEntryId) setDraftTime(nowTime());
                  if (type !== "Other") setDraftOtherLabel("");
                }}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="composer-row">
            <input
              className="control"
              type="time"
              step={60}
              value={draftTime}
              onChange={(e) => setDraftTime(formatTime24(e.target.value))}
              aria-label="Entry time (24-hour)"
            />
            {draftType === "Other" ? (
              <input
                className="control"
                id="other-label"
                value={draftOtherLabel}
                onChange={(e) => setDraftOtherLabel(e.target.value)}
                aria-label="Custom log name"
              />
            ) : (
              <input
                className="control"
                value={draftType}
                readOnly
                aria-label="Selected type"
              />
            )}
          </div>

          <div className="field">
            <label htmlFor="comments">Comments</label>
            <textarea
              id="comments"
              value={draftComments}
              onChange={(e) => setDraftComments(e.target.value)}
              rows={3}
            />
          </div>

          <div className="btn-row">
            <button
              type="button"
              className="btn btn-primary"
              id="add-entry-btn"
              onClick={() => addLogEntry(event.id)}
            >
              {editingEntryId ? "Save changes" : "Add entry"}
            </button>
            {editingEntryId && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={resetComposer}
              >
                Cancel edit
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setStatusMsg(null);
                setView({ name: "close", eventId: event.id });
              }}
            >
              Close event
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
