// The link to the cloud (Supabase): sign-in, pilots and comms. The URL and the anon key are public by
// design — what anyone may read or write is decided by the database's own rules (supabase/schema.sql).
// The library is only fetched when it is needed: a signed-in visitor, a sign-in link, or COMMS opened.
import type { SupabaseClient } from "@supabase/supabase-js";

export const CLOUD_URL = "https://muuaqquhqgthkfzlqkvq.supabase.co";
export const CLOUD_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11dWFxcXVocWd0aGtmemxxa3ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI3NzIwNjIsImV4cCI6MjEwODM0ODA2Mn0.AksqrtNhZsdUJTMj04UDPpsXezaWqsIlK6w_4mAfFYk";
const TOKEN_KEY = "sb-muuaqquhqgthkfzlqkvq-auth-token";

let client: Promise<SupabaseClient> | null = null;
export function cloud() {
  return (client ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(CLOUD_URL, CLOUD_KEY, { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } })));
}
/** a session saved in this browser, or a sign-in link just opened: worth waking the cloud for */
export function cloudWanted() {
  let saved = false;
  try { saved = !!localStorage.getItem(TOKEN_KEY); } catch { /* storage blocked */ }
  return saved || new URLSearchParams(location.search).has("code") || new URLSearchParams(location.search).has("error_description");
}
