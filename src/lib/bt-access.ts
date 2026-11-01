export const BT_ALLOWED_EMAIL = "roheena@plankandweave.com";
export const BT_SESSION_COOKIE = "zyvorah_bt_session";
export const BT_SESSION_SECONDS = 60 * 60 * 12;

type BtSession = { email: string; exp: number };

function bytesToBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function base64UrlToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function keyFor(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createBtSession(secret: string): Promise<string> {
  const session: BtSession = {
    email: BT_ALLOWED_EMAIL,
    exp: Math.floor(Date.now() / 1000) + BT_SESSION_SECONDS,
  };
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(session)));
  const signature = await crypto.subtle.sign("HMAC", await keyFor(secret), new TextEncoder().encode(payload));
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyBtSession(value: string | undefined, secret: string | undefined): Promise<boolean> {
  if (!value || !secret) return false;
  const [payload, suppliedSignature, extra] = value.split(".");
  if (!payload || !suppliedSignature || extra) return false;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await keyFor(secret),
      base64UrlToBytes(suppliedSignature).buffer as ArrayBuffer,
      new TextEncoder().encode(payload),
    );
    if (!valid) return false;
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<BtSession>;
    return (
      session.email === BT_ALLOWED_EMAIL &&
      typeof session.exp === "number" &&
      session.exp > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}
