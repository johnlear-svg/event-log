// Plain JS twin of identity.dev.ts so Turbopack can resolve `./identity.dev.js`
// imported by cursor/identity.ts. Keep values aligned with identity.dev.ts.

export const DEV_VIEWER = {
  sub: "user:dev",
  email: "dev@example.com",
  name: "Dev Viewer",
  teamId: 1,
  teamRole: "admin",
};
