// The raw RFC 5322 message the founder sender hands to the Gmail API.
//
// Pure, so a test can read back what will leave her mailbox. Until 6 October
// 2026 the message was multipart/alternative (text + HTML) and nothing more;
// a quotation leaves with its PDFs on it, so the alternative part now sits
// inside a multipart/mixed envelope when there are attachments, which is the
// shape every mail client expects (and the only one Gmail shows attachments
// for).

export type MailAttachment = {
  filename: string;
  /** "application/pdf" */
  contentType: string;
  content: Uint8Array;
};

export type MimeInput = {
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  text: string;
  inReplyTo?: string | null;
  attachments?: MailAttachment[];
};

/** RFC 2047 for a header with non-ASCII (₹, em dashes, Indic names). */
export const encodeHeader = (s: string) =>
  /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;

/** Base64 folded to 76 columns, as MIME bodies are. */
function b64(bytes: Uint8Array | string): string {
  const raw = (typeof bytes === "string" ? Buffer.from(bytes, "utf8") : Buffer.from(bytes)).toString("base64");
  return raw.replace(/(.{76})/g, "$1\r\n");
}

/** A filename safe inside a quoted header parameter. */
const safeName = (s: string) => s.replace(/["\r\n\\]/g, "_");

export function buildMime(m: MimeInput, ids: { alt: string; mixed: string }): string {
  const alt = [
    `--${ids.alt}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64(m.text),
    `--${ids.alt}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64(m.html),
    `--${ids.alt}--`,
  ];
  const head = [
    `From: ${m.from}`,
    `To: ${m.to.join(", ")}`,
    ...(m.cc.length ? [`Cc: ${m.cc.join(", ")}`] : []),
    `Subject: ${encodeHeader(m.subject)}`,
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`, `References: ${m.inReplyTo}`] : []),
    "MIME-Version: 1.0",
  ];
  const attachments = m.attachments ?? [];
  if (!attachments.length) {
    return [...head, `Content-Type: multipart/alternative; boundary="${ids.alt}"`, "", ...alt].join("\r\n");
  }
  const parts = [
    ...head,
    `Content-Type: multipart/mixed; boundary="${ids.mixed}"`,
    "",
    `--${ids.mixed}`,
    `Content-Type: multipart/alternative; boundary="${ids.alt}"`,
    "",
    ...alt,
  ];
  for (const a of attachments) {
    const name = safeName(a.filename);
    parts.push(
      `--${ids.mixed}`,
      `Content-Type: ${a.contentType}; name="${name}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${name}"`,
      "",
      b64(a.content),
    );
  }
  parts.push(`--${ids.mixed}--`);
  return parts.join("\r\n");
}
