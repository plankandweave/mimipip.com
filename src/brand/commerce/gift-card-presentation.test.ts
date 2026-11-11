import test from 'node:test';
import assert from 'node:assert/strict';
import { GIFT_CARD_STYLES, GIFT_CARD_OCCASIONS, formatGiftCardAmount, renderGiftCardHtml, type GiftCardPresentationData } from './gift-card-presentation';

const gift: GiftCardPresentationData = { style: 'blue-daisy', recipientName: 'Asha & Dev', senderName: 'Maya', occasion: 'Baby shower / डोहाळजेवण', amount: 21000, currency: 'INR', status: 'preview' };

test('personalization is escaped and an unactivated code never leaks into any renderer', () => {
  const hostile = { ...gift, recipientName: '<img src=x onerror="alert(1)">', message: '<script>bad()</script>', code: 'PRIVATE-ACTIVE-CODE' };
  for (const mode of ['card', 'email', 'print'] as const) {
    const html = renderGiftCardHtml(hostile, { mode });
    assert.ok(!html.includes('<img src=x'));
    assert.ok(!html.includes('<script>bad()'));
    assert.ok(!html.includes('PRIVATE-ACTIVE-CODE'));
    assert.ok(html.includes('Pending activation'));
  }
  assert.throws(() => renderGiftCardHtml(gift, { mode: 'email', cardImageUrl: 'javascript:alert(1)' }));
});

test('all three supplied artworks work independently with every occasion through age12', () => {
  assert.equal(GIFT_CARD_STYLES.length, 3);
  assert.equal(GIFT_CARD_OCCASIONS.length, 14);
  assert.ok(GIFT_CARD_OCCASIONS.includes('12th birthday'));
  for (const style of GIFT_CARD_STYLES) for (const occasion of GIFT_CARD_OCCASIONS) {
    const html = renderGiftCardHtml({ ...gift, style: style.id, occasion }, { mode: 'card' });
    assert.ok(html.includes(`/gift-cards/${style.id}.jpg`));
    assert.ok(html.includes(occasion));
    assert.ok(html.includes('mimipip.com'));
    assert.ok(!html.includes('Georgia'));
  }
});

test('currency, bilingual text, dates and proof status are honest', () => {
  assert.equal(formatGiftCardAmount(21000, 'INR'), '₹21,000');
  assert.equal(formatGiftCardAmount(50.5, 'USD'), '$50.50');
  const pending = renderGiftCardHtml(gift, { mode: 'email' });
  assert.ok(pending.includes('डोहाळजेवण'));
  assert.ok(pending.includes('PROOF FOR REVIEW · NOT SENT · NOT ACTIVATED'));
  assert.ok(!pending.includes('Valid until'));
  assert.ok(!pending.includes('Gifted on'));
  const active = renderGiftCardHtml({ ...gift, status: 'active', code: 'SAFE-CODE', issuedAt: '2026-11-11', expiresAt: '2027-11-11' }, { mode: 'print' });
  assert.ok(active.includes('SAFE-CODE'));
  assert.ok(active.includes('11 Nov 2026'));
  assert.ok(active.includes('11 Nov 2027'));
  assert.ok(!active.includes('Pending activation'));
});
