declare module "vitest" {
  export interface ProvidedContext {
    /** URL del PostgreSQL efímero que levanta `test/global-setup.ts`. */
    databaseUrl: string;
  }
}

export {};
