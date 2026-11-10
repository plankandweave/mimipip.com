import type { SupabaseClient as Client } from '@supabase/supabase-js';
/** Native helpers share the explicitly selected MimiPip schema. */
export type SupabaseClient = Client<any, any, 'mimipip'>;
