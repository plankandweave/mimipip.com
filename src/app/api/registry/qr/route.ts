import QRCode from "qrcode";
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex",
    "Referrer-Policy": "no-referrer",
  };
  if (!/^[a-f0-9]{32}$/.test(code))
    return new Response("Registry not found.", { status: 404, headers });
  const svg = await QRCode.toString("https://mimipip.com/registry/" + code, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 4,
    width: 240,
  });
  return new Response(svg, {
    headers: {
      ...headers,
      "Content-Type": "image/svg+xml",
      "Content-Disposition": 'attachment; filename="mimi-pip-registry-qr.svg"',
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
