import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://aswhubzprehjnunbpkwc.supabase.co"; // Remplace par ton URL
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzd2h1YnpwcmVoam51bmJwa3djIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMDg5ODcsImV4cCI6MjA2NzU4NDk4N30.rNsW9i0jxtOxHYsoagVXjqz_yMHmVmKumf8c8LKuB0Q"; // Remplace par ta clé

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
