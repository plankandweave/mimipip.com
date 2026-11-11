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

import { gstSplit } from '../../lib/gst';
test('multiple invoice lines reconcile with CGST and SGST at the paise boundary', () => {
 const q=gstInvoice([{label:'One',incl:1000},{label:'Two',incl:1000}]);
 assert.deepEqual(q.taxableLines.map(l=>l.taxable),[847.46,847.46]);
 assert.equal(q.taxableSubtotal,1694.92);
 assert.equal(q.gst,305.08);
 assert.deepEqual(gstSplit(q.gst,'27','27'),{intra:true,cgst:152.54,sgst:152.54,igst:0,total:305.08});
 assert.deepEqual(gstSplit(30.51,'27','27'),{intra:true,cgst:15.26,sgst:15.25,igst:0,total:30.51});
 assert.deepEqual(gstSplit(30.51,'27','29'),{intra:false,cgst:0,sgst:0,igst:30.51,total:30.51});
});
