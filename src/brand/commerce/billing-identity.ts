import {gstinChecksumOk,STATE_CODES} from '@/lib/gst';
export type BillingIdentity={gstin:string;legalName:string};
const states=new Set(Object.values(STATE_CODES));
/** Syntax checks only. This does not claim a live registration or verify its owner. */
export function checkedBillingIdentity(raw:unknown,countryCode:string):BillingIdentity|undefined {
 if(raw==null)return undefined;
 if(countryCode!=='IN')throw new Error('Business GST invoices are available for delivery within India.');
 if(typeof raw!=='object'||Array.isArray(raw))throw new Error('Check your business invoice details.');
 const input=raw as Record<string,unknown>;
 if(Object.keys(input).some(k=>!['gstin','legalName'].includes(k)) || typeof input.gstin!=='string'||typeof input.legalName!=='string')throw new Error('Enter the GSTIN and registered business name.');
 const gstin=input.gstin.trim().toUpperCase(),legalName=input.legalName.replace(/\s+/g,' ').trim();
 if(!gstinChecksumOk(gstin)||!states.has(gstin.slice(0,2)))throw new Error('Please check the GSTIN, including its final character.');
 if(legalName.length<2||legalName.length>200||/[\p{Cc}\p{Cf}]/u.test(legalName))throw new Error('Enter the registered business name as it should appear on your invoice.');
 return {gstin,legalName};
}
