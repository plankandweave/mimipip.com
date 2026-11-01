import { fileSection } from "@/lib/briefing";
export async function fileCustomerServiceSection() {
  try {
    const key=process.env.ZYVORAH_WEBHOOK_TOKEN;
    if(!key) throw Error("OS connection unavailable");
    const response=await fetch(`${(process.env.OS_BASE_URL ?? 'https://os.magnitudegroup.in').replace(/\/$/,'')}/api/zyvorah/customer-service/brief`,{headers:{'x-zyvorah-token':key},signal:AbortSignal.timeout(8000),cache:'no-store'});
    if(!response.ok) throw Error(`OS customer-service source returned ${response.status}`);
    const brief=await response.json();
    return fileSection({key:'customer-service',status:brief.status==='amber'?'amber':'info',headline:brief.headline,bodyHtml:brief.bodyHtml,observedAt:brief.observedAt,source:'OS customer-service cases and linked founder tasks'});
  } catch {
    return fileSection({key:'customer-service',status:'red',headline:'Customer-service cases could not be checked. Open OS to review pending decisions.',bodyHtml:'<p>The live customer-service source was unavailable. This does not mean there are no pending cases.</p>',observedAt:new Date().toISOString(),source:'Live OS customer-service request failed'});
  }
}
