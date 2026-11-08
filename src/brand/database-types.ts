import type { SupabaseClient as Client } from '@supabase/supabase-js';
/** Native helpers share the explicitly selected Mimi Pip schema. */
export type SupabaseClient = Client<any, any, 'mimipip'>;
