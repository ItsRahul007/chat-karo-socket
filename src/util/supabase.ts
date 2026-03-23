import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// The Service Role Key gives this backend full admin access & bypasses RLS
export const supabase = createClient(supabaseUrl, supabaseServiceKey);
