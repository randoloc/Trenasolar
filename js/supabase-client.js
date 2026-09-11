import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js?v=10";

// Si las credenciales todavía son las de ejemplo, no intentamos conectar:
// evita que todo el sitio se caiga en silencio y en su lugar avisamos con claridad.
export const isConfigured =
  SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("PEGA_AQUI") && !SUPABASE_ANON_KEY.includes("PEGA_AQUI");

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
