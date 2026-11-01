import { NextResponse } from "next/server";

// Installer applications are reviewed in the Magnitude OS since 1 October
// 2026 (os.magnitudegroup.in/installer-applications), beside the installer
// registry those approvals feed. The public form, /become-an-installer, and
// its intake (/api/installer/apply) stay here — applying is the website's job;
// reviewing identity and liveness is the OS's. The applications table and the
// private installer-apps bucket stay in this database; the OS reads them with
// the service key.
const OS_BASE = (process.env.OS_BASE_URL ?? "https://os.magnitudegroup.in").replace(/\/$/, "");

export function GET() {
  return NextResponse.redirect(`${OS_BASE}/installer-applications`, 308);
}
