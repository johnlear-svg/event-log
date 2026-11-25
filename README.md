# Event Log

Luna Springs · Operations — duty-manager event logs.

## Flow

1. **Dashboard** — New Event Log · Previous · Drafts (with count badge)
2. **Setup** — Event name, risk level, tickets sold → opens live log (draft)
3. **Live log** — timed entries with quick-adds + comments
4. **Close** — licensing a–h, comments, manager name → Previous + PDF email

Data: browser `localStorage` multi-event store (`event-log:data:v2`).

## Style

Matches `luna-police-licensing` tokens: Syne + Manrope, brass/ink/paper palette.
See Project store `internal/luna-licensing-style-tokens.md`.

## Email

`POST /api/send-report` via Resend when `RESEND_API_KEY` + `RESEND_FROM_EMAIL` are set.
Otherwise: PDF download + mailto fallback (labeled in UI).

## Develop

```bash
npm install
npm run dev -- -H 127.0.0.1 -p 3000
```
