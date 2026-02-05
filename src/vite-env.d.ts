/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Global version constants defined in vite.config.ts
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
