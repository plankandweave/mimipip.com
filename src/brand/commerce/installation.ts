import {areaSqFt,installationTotal,INSTALL_RATE_EX_GST,INSTALL_MIN_SQFT} from '@/lib/pricing';
import {resolveInstallEligibility} from '@/lib/install-cities';
/** Same existing Zyvorah rate, area rounding and coverage; no browser price is trusted. */
export function pricedInstallation(raw:unknown,widthCm:number,heightCm:number,qty:number,countryCode:string){
 if(raw==null)return undefined;
 const input=raw as {ratePerSqft?:unknown;total?:unknown};
 if(countryCode!=='IN')throw new Error('Installation is available only in selected Indian cities. Remove installation before ordering overseas.');
 if(input.ratePerSqft!==INSTALL_RATE_EX_GST || typeof input.total!=='number' || !Number.isFinite(input.total) || input.total<=0)throw new Error('Please select installation again to see its current price.');
 const area=areaSqFt(widthCm,heightCm);
 if(area<INSTALL_MIN_SQFT)throw new Error(`Installation starts at ${INSTALL_MIN_SQFT} sq ft.`);
 return {ratePerSqft:INSTALL_RATE_EX_GST,total:installationTotal(area,qty)};
}
export function installationAddressAllowed(countryCode:string,postcode:string){
 return countryCode==='IN' && resolveInstallEligibility({pincode:postcode}).serviceable;
}
