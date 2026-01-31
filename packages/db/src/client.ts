import { createClient } from '@supabase/supabase-js';
import type { Database } from './types.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL environment variable');
}

// Public client (for client-side use with RLS)
export function createPublicClient() {
    if (!supabaseAnonKey) {
        throw new Error('Missing SUPABASE_ANON_KEY environment variable');
    }
    return createClient<Database>(supabaseUrl!, supabaseAnonKey!);
}

// Service client (for server-side use, bypasses RLS)
export function createServiceClient() {
    if (!supabaseServiceKey) {
        throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
    }
    return createClient<Database>(supabaseUrl!, supabaseServiceKey!, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

// Default export for convenience
export const db = createServiceClient;
