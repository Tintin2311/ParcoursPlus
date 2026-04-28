// src/supabaseClient.ts
import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ⚠️ On FORCE le même projet que ParcoursPlus-vite (aucun override par .env)
const SUPABASE_URL = "https://aswhubzprehjnunbpkwc.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzd2h1YnpwcmVoam51bmJwa3djIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIwMDg5ODcsImV4cCI6MjA2NzU4NDk4N30.rNsW9i0jxtOxHYsoagVXjqz_yMHmVmKumf8c8LKuB0Q";

// Stockage compatible Expo (web + natif)
const storage =
  typeof window !== "undefined" && "localStorage" in window
    ? {
        getItem: (k: string) => window.localStorage.getItem(k),
        setItem: (k: string, v: string) => window.localStorage.setItem(k, v),
        removeItem: (k: string) => window.localStorage.removeItem(k),
      }
    : AsyncStorage;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage,
    storageKey: "sb-parcoursplus-auth-token",
  },
});

// Petit ping de debug au démarrage
(async () => {
  try {
    console.log("[Supabase] URL chargée =", SUPABASE_URL);
    const { error } = await supabase.from("professeurs").select("user_id").limit(1);
    if (error) console.warn("[Supabase ping] erreur:", error);
  } catch (e) {
    console.warn("[Supabase ping] exception:", e);
  }
})();
