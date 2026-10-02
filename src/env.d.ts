/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional deployment title override, see `.env.example`. */
  readonly VITE_APP_TITLE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
