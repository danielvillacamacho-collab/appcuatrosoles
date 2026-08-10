/**
 * Estados posibles de una cuenta de usuario (spec.md HU-010-04, docs/02 §B).
 *
 * El dominio define su **propio vocabulario** y no importa el enum de Prisma: `packages/domain`
 * es TypeScript puro y no conoce la base de datos (P-01). Traducir entre este tipo y el enum
 * persistido es tarea del repositorio, en el borde del sistema. Parece una duplicación de cuatro
 * palabras; lo que compra es que las reglas del polo se puedan probar sin base de datos y que
 * cambiar de ORM no toque una sola regla de negocio.
 */
export const ACCOUNT_STATUSES = ["invited", "active", "suspended", "archived"] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
