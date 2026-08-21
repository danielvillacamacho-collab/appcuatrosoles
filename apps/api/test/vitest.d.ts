declare module "vitest" {
  export interface ProvidedContext {
    /** URL del PostgreSQL efímero que levanta `test/global-setup.ts`. */
    /** La que usa la aplicación: el rol **sin privilegios** `polo_app` (T-007). */
    databaseUrl: string;
    /** La del dueño de las tablas. Sólo para comprobar lo que el rol de aplicación no puede. */
    databaseUrlAdmin: string;
  }
}

export {};
