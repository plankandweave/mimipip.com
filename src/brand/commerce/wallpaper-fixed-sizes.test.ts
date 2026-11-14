import test from 'node:test';
import assert from 'node:assert/strict';
import { priceCart } from './checkout';
import { priceLine, refused, WALLPAPER_FIXED_SIZES } from './prices';
import printMap from './print-map.json';

test('website print orders use the approved self-adhesive material', () => {
  for (const [slug, item] of Object.entries(printMap)) {
    assert.equal(item.material, 'self_adhesive', slug);
    if ('materialSlug' in item) assert.equal(item.materialSlug, 'self-adhesive-vinyl', slug);
  }
});

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

test('all eleven Hush and Wander designs have production artwork and can be priced from collection cart selections', () => {
  const entries=Object.entries(printMap).filter(([slug])=>slug.startsWith('hush-and-wander-'));
  assert.equal(entries.length,11);
  for(const [slug,art] of entries) {
    assert.match(art.art,/\/nursery-worlds\/print-art\/.*\.png$/);
    for(const [widthFt,heightFt] of WALLPAPER_FIXED_SIZES) {
      const input={slug,qty:2,widthCm:widthFt*30.48,heightCm:heightFt*30.48,fixedSize:true};
      const priced=priceLine(input,'IN');
      assert.ok(!refused(priced),slug);
      const cart=priceCart([input],'IN');
      assert.ok(!('refused' in cart),slug);
      assert.equal(cart.totalMinor,priced.lineMinor,slug);
    }
    for(const country of ['IN','US']) {
      const input={slug,qty:1,widthCm:240,heightCm:270};
      const cart=priceCart([input],country);
      assert.ok(!('refused' in cart),slug+' '+country);
      assert.ok(cart.totalMinor>0,slug);
    }
  }
});
