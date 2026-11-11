/** Pure presentation shared by the storefront, mail worker and printable cards. */
export const GIFT_CARD_STYLES = [
  { id: 'blue-daisy', label: 'Blue Daisy', description: 'A little bloom of blue.' },
  { id: 'little-sunshine', label: 'Little Sunshine', description: 'A warm little ray of joy.' },
  { id: 'coral-ribbon', label: 'Coral Ribbon', description: 'All wrapped up with love.' },
] as const;
export type GiftCardStyle = typeof GIFT_CARD_STYLES[number]['id'];
export type GiftCardCurrency = 'INR' | 'USD';
export const GIFT_CARD_OCCASIONS = [
  'Baby shower', 'Newborn', '1st birthday', '2nd birthday', '3rd birthday',
  '4th birthday', '5th birthday', '6th birthday', '7th birthday', '8th birthday',
  '9th birthday', '10th birthday', '11th birthday', '12th birthday',
] as const;
export const GIFT_CARD_INR_PRESETS = [1001, 2001, 5001, 10001, 20001] as const;

export interface GiftCardPresentationData {
  style: GiftCardStyle;
  recipientName: string;
  senderName: string;
  occasion: string;
  /** Major currency units, never minor-unit paise/cents. */
  amount: number;
  currency: GiftCardCurrency;
  message?: string;
  code?: string | null;
  status: 'preview' | 'pending' | 'active';
  issuedAt?: string | number | null;
  expiresAt?: string | number | null;
}

export interface GiftCardRenderOptions {
  mode: 'card' | 'email' | 'print';
  assetBaseUrl?: string;
  /** Optional protected, server-rendered image for clients that block web fonts. */
  cardImageUrl?: string;
  printUrl?: string;
}

export const escapeGiftCardHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function formatGiftCardAmount(amount: number, currency: GiftCardCurrency): string {
  if (!Number.isFinite(amount) || amount <= 0) return `${currency === 'USD' ? '$' : '₹'}—`;
  const value = new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'en-IN', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2,
  }).format(amount);
  return `${currency === 'USD' ? '$' : '₹'}${value}`;
}

function baseUrl(value = 'https://mimipip.com'): string {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid artwork origin');
  return url.origin;
}

function safeLink(value: string): string {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid gift-card link');
  return escapeGiftCardHtml(url.href);
}

function imageSource(value: string): string {
  if (/^cid:[A-Za-z0-9._@-]+$/.test(value)) return value;
  if (value.length < 10000000 && /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
  return safeLink(value);
}

function displayDate(value?: string | number | null): string | null {
  if (value == null) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(date);
}

/** The original 994 × 627 artwork is never recoloured, cropped or redrawn. */
export function renderGiftCardFaceHtml(data: GiftCardPresentationData, options: { assetBaseUrl?: string; width?: number } = {}): string {
  const origin = baseUrl(options.assetBaseUrl);
  const style = GIFT_CARD_STYLES.some(s => s.id === data.style) ? data.style : 'blue-daisy';
  const background = `${origin}/brand/mimi-pip/gift-cards/${style}.jpg`;
  const logo = `${origin}/brand/mimi-pip/gift-cards/mimipip-logo.png`;
  const width = Math.max(320, Math.min(994, options.width ?? 994));
  const s = width / 994;
  const px = (n: number) => `${Math.round(n * s * 100) / 100}px`;
  const name = data.recipientName.trim() || 'Someone special';
  const sender = data.senderName.trim() || 'With love';
  const nameSize = Math.min(66, Math.max(20, 1120 / Math.max(17, [...name].length)));
  const senderSize = Math.min(30, Math.max(18, 1240 / Math.max(40, [...sender].length + 5)));
  const active = data.status === 'active' && !!data.code?.trim();
  const date = displayDate(data.issuedAt);
  const expiry = displayDate(data.expiresAt);
  const fields = [
    ...(date ? [['Gifted on', date]] : []),
    ...(expiry ? [['Valid until', expiry]] : []),
    ['Shopping code', active ? data.code!.trim() : 'Pending activation'],
  ];
  const h = escapeGiftCardHtml;
  const row = (height: number, content: string) => `<tr><td height="${Math.round(height * s)}" style="height:${px(height)};padding:0;vertical-align:top">${content}</td></tr>`;
  const rounded = "'MimiDisplay','Arial Rounded MT Bold','MimiDevanagari',Arial,sans-serif";
  const body = "'MimiText','MimiDevanagari',Arial,sans-serif";
  return `<table role="presentation" class="mimi-gift-card" width="${width}" height="${Math.round(627 * s)}" cellpadding="0" cellspacing="0" style="width:${px(994)};height:${px(627)};table-layout:fixed;border-collapse:separate;border-spacing:0;border-radius:${px(36)};overflow:hidden;color:#714414;font-family:${body}"><tr><td background="${background}" style="padding:${px(53)} ${px(65)} ${px(40)};background-color:#fff9ed;background-image:url('${background}');background-size:100% 100%;background-repeat:no-repeat;border-radius:${px(36)}">
    <table role="presentation" width="100%" height="${Math.round(534 * s)}" cellpadding="0" cellspacing="0" style="width:100%;height:${px(534)};table-layout:fixed;border-collapse:collapse">
      ${row(120, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed"><tr><td style="padding-top:${px(21)};vertical-align:top;font-size:${px(25)};line-height:1.35;font-weight:700;font-family:${body}">${h(data.occasion || 'A little joy')}<br><span style="font-size:${px(18)};font-weight:700;letter-spacing:${px(2)}">GIFT CARD</span></td><td width="${Math.round(158 * s)}" style="width:${px(158)};vertical-align:top"><img src="${logo}" width="${Math.round(158 * s)}" height="${Math.round(79 * s)}" alt="MimiPip" style="display:block;width:${px(158)};height:${px(79)};object-fit:contain;border:0"></td></tr></table>`)}
      ${row(90, `<div style="padding-top:${px(22)};font-family:${rounded};font-size:${px(nameSize)};font-weight:600;line-height:1.1;white-space:nowrap">${h(name)}</div>`)}
      ${row(55, `<div style="padding-top:${px(7)};font-family:${rounded};font-size:${px(senderSize)};font-weight:400;line-height:1.25;white-space:nowrap">From ${h(sender)}</div>`)}
      ${row(86, `<div style="padding-top:${px(13)};font-size:${px(39)};font-weight:800;font-family:${body};line-height:1.2">${h(formatGiftCardAmount(data.amount, data.currency))}</div>`)}
      ${row(124, `<table role="presentation" width="77%" cellpadding="0" cellspacing="0" style="width:77%;table-layout:fixed;padding-top:${px(37)}"><tr>${fields.map(([label, value]) => `<td style="vertical-align:top;padding:${px(35)} ${px(14)} 0 0"><div style="font-size:${px(18)};line-height:1.3;color:#65574d">${h(label)}</div><div style="padding-top:${px(9)};font-size:${px(active && label === 'Shopping code' ? 22 : 23)};font-weight:700;line-height:1.3;overflow-wrap:anywhere">${h(value)}</div></td>`).join('')}</tr></table>`)}
      ${row(59, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed"><tr><td style="padding-top:${px(21)};font-size:${px(21)};font-weight:800"><a href="https://mimipip.com" style="color:#714414;text-decoration:none">mimipip.com</a></td><td style="padding-top:${px(22)};text-align:right;font-size:${px(16)};color:#65574d">${active ? 'A little joy, just for you' : 'Preview · not activated'}</td></tr></table>`)}
    </table>
  </td></tr></table>`;
}

export function renderGiftCardHtml(data: GiftCardPresentationData, options: GiftCardRenderOptions): string {
  const origin = baseUrl(options.assetBaseUrl);
  const h = escapeGiftCardHtml;
  const fontCss = `@font-face{font-family:MimiDisplay;src:url('${origin}/fonts/fredoka-variable.ttf') format('truetype');font-weight:300 700;font-display:swap}@font-face{font-family:MimiText;src:url('${origin}/fonts/nunito-variable.ttf') format('truetype');font-weight:200 900;font-display:swap}@font-face{font-family:MimiDevanagari;src:url('${origin}/fonts/NotoDevanagari-400.ttf') format('truetype');font-weight:400;font-display:swap}@font-face{font-family:MimiDevanagari;src:url('${origin}/fonts/NotoDevanagari-700.ttf') format('truetype');font-weight:600 900;font-display:swap}`;
  const active = data.status === 'active' && !!data.code?.trim();
  const title = `${active ? 'A MimiPip gift' : 'MimiPip gift proof'} for ${data.recipientName || 'someone special'}`;
  if (options.mode === 'card') return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${h(title)}</title><style>${fontCss}*{box-sizing:border-box}html,body{margin:0;padding:0;width:994px;height:627px;overflow:hidden}</style></head><body>${renderGiftCardFaceHtml(data, { assetBaseUrl: origin })}</body></html>`;
  const print = options.mode === 'print';
  const style = GIFT_CARD_STYLES.some(s => s.id === data.style) ? data.style : 'blue-daisy';
  const face = print
    ? renderGiftCardFaceHtml(data, { assetBaseUrl: origin, width: 660 })
    : `<img src="${imageSource(options.cardImageUrl || `${origin}/brand/mimi-pip/gift-cards/${style}.jpg`)}" width="640" alt="${h(options.cardImageUrl ? `${data.occasion} gift card for ${data.recipientName}, from ${data.senderName}, ${formatGiftCardAmount(data.amount, data.currency)}` : 'MimiPip gift-card artwork')}" style="display:block;width:100%;max-width:640px;height:auto;border-radius:22px;border:0">`;
  const details = !print ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;width:100%;font-size:15px;line-height:1.6"><tr><td style="padding:4px 18px 4px 0;color:#806345;vertical-align:top;width:95px">For</td><td style="padding:4px 0;font-weight:800">${h(data.recipientName || 'Someone special')}</td></tr><tr><td style="padding:4px 18px 4px 0;color:#806345;vertical-align:top">From</td><td style="padding:4px 0">${h(data.senderName || 'With love')}</td></tr><tr><td style="padding:4px 18px 4px 0;color:#806345;vertical-align:top">Occasion</td><td style="padding:4px 0">${h(data.occasion)}</td></tr><tr><td style="padding:4px 18px 4px 0;color:#806345;vertical-align:top">Gift value</td><td style="padding:4px 0;font-weight:800">${h(formatGiftCardAmount(data.amount, data.currency))}</td></tr><tr><td style="padding:4px 18px 4px 0;color:#806345;vertical-align:top">Code</td><td style="padding:4px 0;font-weight:800;overflow-wrap:anywhere">${h(active ? data.code!.trim() : 'Pending activation')}</td></tr>${displayDate(data.expiresAt) ? `<tr><td style="padding:4px 18px 4px 0;color:#806345;vertical-align:top">Valid until</td><td style="padding:4px 0">${h(displayDate(data.expiresAt))}</td></tr>` : ''}</table>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(title)}</title><style>${fontCss}*{box-sizing:border-box}body{margin:0;background:#fff9ed;color:#714414;font-family:MimiText,MimiDevanagari,Arial,sans-serif}.gift-proof-wrap{width:100%;max-width:${print ? 724 : 704}px;margin:0 auto;padding:32px}.gift-proof-heading{font-family:MimiDisplay,MimiDevanagari,Arial,sans-serif;font-weight:500;font-size:28px;line-height:1.2;margin:0 0 12px}.gift-proof-copy{font-size:16px;line-height:1.6;margin:0 0 24px}.gift-proof-status{border-top:1px solid #ead9bd;margin-top:24px;padding-top:16px;font-size:13px;line-height:1.5}.gift-proof-message{white-space:pre-wrap;font-size:17px;line-height:1.6;margin:24px 0}.gift-proof-button{display:inline-block;border:0;border-radius:99px;background:#ff542b;color:white;padding:12px 20px;text-decoration:none;font-weight:800}.gift-proof-card{width:100%}a{color:#714414}@media(max-width:480px){.gift-proof-wrap{padding:20px}.gift-proof-heading{font-size:25px}}@page{size:A4 portrait;margin:15mm}@media print{body{background:white}.gift-proof-wrap{padding:0;max-width:none}.no-print{display:none!important}.gift-proof-card{break-inside:avoid}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><main class="gift-proof-wrap">${!active && !print ? '<p style="padding:12px 16px;border:1px solid #d7c5a7;border-radius:12px;font-size:12px;font-weight:800;letter-spacing:.6px;margin:0 0 24px">PROOF FOR REVIEW · NOT SENT · NOT ACTIVATED</p>' : ''}<h1 class="gift-proof-heading">${!print || active ? 'A little joy, just for you.' : 'Your MimiPip gift preview'}</h1><p class="gift-proof-copy">${print ? `A MimiPip gift for ${h(data.recipientName || 'you')}, with love from ${h(data.senderName || 'someone special')}.` : `You have received a MimiPip gift card from ${h(data.senderName || 'someone special')}.`}</p><div class="gift-proof-card">${face}</div>${details}${data.message?.trim() ? `<p class="gift-proof-message">${h(data.message.trim())}</p>` : ''}<p class="gift-proof-status">${active ? 'No expiry. Use all or part of your balance at mimipip.com; any remaining balance stays on your card. Keep this card and code safe.' : 'Proof for review only. This gift card has not been activated. A shopping code will appear only after activation.'}</p>${options.printUrl ? `<p><a class="gift-proof-button" href="${safeLink(options.printUrl)}">View printable gift card</a></p>` : ''}${print ? '<p class="no-print"><button class="gift-proof-button" onclick="window.print()">Print or save as PDF</button></p>' : ''}<p style="font-size:13px;line-height:1.5;margin-top:24px"><a href="https://mimipip.com">mimipip.com</a> · <a href="mailto:hello@mimipip.com">hello@mimipip.com</a></p></main></body></html>`;
}
