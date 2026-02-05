// Environment validation - fail fast if misconfigured

interface EnvConfig {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  IS_DEVELOPMENT: boolean;
  IS_PRODUCTION: boolean;
}

function validateEnv(): EnvConfig {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const missing: string[] = [];

  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY');

  if (missing.length > 0 && import.meta.env.PROD) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (missing.length > 0) {
    console.warn(`[ENV] Missing variables (using fallbacks): ${missing.join(', ')}`);
  }

  return {
    SUPABASE_URL: supabaseUrl || 'https://placeholder.supabase.co',
    SUPABASE_ANON_KEY: supabaseAnonKey || 'placeholder-key',
    IS_DEVELOPMENT: import.meta.env.DEV,
    IS_PRODUCTION: import.meta.env.PROD,
  };
}

export const env = validateEnv();
