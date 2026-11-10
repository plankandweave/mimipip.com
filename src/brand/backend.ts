/** Shared Magnitude infrastructure, separate application data. Never default to public. */
export const MIMIPIP_SCHEMA = 'mimipip' as const;
export const MAGNITUDE_BACKEND_ORIGIN = 'https://qrtznwnhuzkpynjetygg.supabase.co';

export function backendUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (value !== MAGNITUDE_BACKEND_ORIGIN) throw new Error('MimiPip backend configuration does not match the approved Magnitude service.');
  return value;
}
export function backendPublicKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) throw new Error('MimiPip public backend key is missing.');
  return value;
}
