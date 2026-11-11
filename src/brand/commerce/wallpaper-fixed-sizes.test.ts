import test from 'node:test';
import assert from 'node:assert/strict';
import { priceCart } from './checkout';
import { priceLine, refused, WALLPAPER_FIXED_SIZES } from './prices';

test('fixed self-adhesive sizes use actual area at ₹200 per sq ft', () => {
  const expected = [120000, 270000, 480000];
  WALLPAPER_FIXED_SIZES.forEach(([widthFt, heightFt], index) => {
    const line = { slug: 'almond-blossom', qty: 1, widthCm: widthFt * 30.48, heightCm: heightFt * 30.48, fixedSize: true };
    const priced = priceLine(line, 'IN');
    assert.ok(!refused(priced));
    assert.equal(priced.unitMinor, expected[index]);
    const cart = priceCart([{ ...line, unitMinor: 1 }], 'IN');
    assert.ok(!('refused' in cart));
    assert.equal(cart.totalMinor, expected[index]);
  });
});

test('custom wallpaper retains the 20 sq ft minimum and fixed-size claims are validated', () => {
  const small = { slug: 'almond-blossom', qty: 1, widthCm: 2 * 30.48, heightCm: 3 * 30.48 };
  const custom = priceLine(small, 'IN');
  assert.ok(!refused(custom));
  assert.equal(custom.unitMinor, 400000);
  assert.ok(refused(priceLine({ ...small, widthCm: 2.1 * 30.48, fixedSize: true }, 'IN')));
  assert.ok(refused(priceLine({ ...small, fixedSize: true }, 'ABROAD')));
});
