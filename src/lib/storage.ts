"use client";

import {
  AppData,
  AppSettings,
  createEmptyData,
  EventLog,
  normalizeEvent,
} from "./types";

const DATA_KEY = "event-log:data:v2";
const LEGACY_NIGHT = "event-log:night:v1";
const LEGACY_SETTINGS = "event-log:settings:v1";

export function loadData(): AppData {
  if (typeof window === "undefined") return createEmptyData();
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      return {
        events: Array.isArray(parsed.events)
          ? parsed.events.map((e) => normalizeEvent(e as EventLog))
          : [],
        settings: {
          recipients: Array.isArray(parsed.settings?.recipients)
            ? parsed.settings.recipients.filter((e) => typeof e === "string")
            : [],
        },
      };
    }

    // One-time migrate from v1 single-night storage if present
    const legacyNight = localStorage.getItem(LEGACY_NIGHT);
    const legacySettings = localStorage.getItem(LEGACY_SETTINGS);
    if (legacyNight || legacySettings) {
      const data = createEmptyData();
      if (legacySettings) {
        try {
          const s = JSON.parse(legacySettings) as AppSettings;
          data.settings.recipients = Array.isArray(s.recipients)
            ? s.recipients
            : [];
        } catch {
          /* ignore */
        }
      }
      saveData(data);
      return data;
    }
    return createEmptyData();
  } catch {
    return createEmptyData();
  }
}

export function saveData(data: AppData): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

export function upsertEvent(data: AppData, event: EventLog): AppData {
  const idx = data.events.findIndex((e) => e.id === event.id);
  const events =
    idx === -1
      ? [event, ...data.events]
      : data.events.map((e, i) => (i === idx ? event : e));
  return { ...data, events };
}

export function deleteEvent(data: AppData, id: string): AppData {
  return { ...data, events: data.events.filter((e) => e.id !== id) };
}

export function saveSettings(data: AppData, settings: AppSettings): AppData {
  return { ...data, settings };
}
