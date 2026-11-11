import test from 'node:test';
import assert from 'node:assert/strict';
import { exGst, gstInvoice } from '../../lib/pricing';
test('GST-inclusive samples and wallpaper keep paise without changing selling prices', () => {
 assert.equal(exGst(200),169.49);
 assert.equal(exGst(14400),12203.39);
 const invoice=gstInvoice([{label:'Wallpaper',incl:14392.64},{label:'Sample',incl:200}]);
 assert.equal(invoice.total,14592.64);
 assert.equal(invoice.taxableSubtotal,12366.64);
 assert.equal(invoice.gst,2226);
 assert.equal(Math.round((invoice.taxableSubtotal+invoice.gst)*100),1459264);
});
