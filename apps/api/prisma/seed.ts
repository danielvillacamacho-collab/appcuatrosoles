import { pathToFileURL } from "node:url";
import argon2 from "argon2";
import { PrismaClient, type RoleName } from "@prisma/client";

/**
 * Datos de ejemplo para desarrollo (`pnpm db:seed`).
 *
 * **Es un club ficticio, a propósito.** Nada aquí se llama Los Pinos ni Cuatro Soles, y
 * ninguna tarifa es real: la plataforma es un producto para clubes de polo, y hardcodear el
 * cliente cero en el código es el primer paso para no poder venderlo (CLAUDE.md, contexto de
 * negocio). Los datos reales se cargan por la interfaz de administración.
 *
 * **Idempotente**: correrlo dos veces no duplica nada. Es requisito de T-006, y también lo que
 * lo hace útil — un seed que hay que borrar antes de volver a correr no se usa.
 */

/** El club de ejemplo. Desde T-202 es una fila real de `club`, no un identificador suelto. */
export const CLUB_ID = "club-demo";
/** Subdominio del club de ejemplo: en desarrollo se entra por `club-demo.localhost`. */
const CLUB_SLUG = "club-demo";

/**
 * Contraseña de las cuentas de ejemplo. No es un secreto: son cuentas de un club ficticio en
 * una base de datos de desarrollo. Aun así, el seed se niega a correr en producción (abajo),
 * porque crear cuentas con una contraseña conocida sí sería un problema si eso pasara.
 */
const CONTRASENA_DEMO = process.env.SEED_PASSWORD ?? "demo1234";

interface PersonaDemo {
  email: string;
  fullName: string;
  role: RoleName;
  categoria: string;
}

const PERSONAS: PersonaDemo[] = [
  {
    email: "admin@club-demo.test",
    fullName: "Administradora del club",
    role: "club_admin",
    categoria: "partner",
  },
  {
    email: "comisario@club-demo.test",
    fullName: "Comisario de polo",
    role: "commissioner",
    categoria: "partner",
  },
  {
    email: "jugador@club-demo.test",
    fullName: "Jugador de ejemplo",
    role: "player",
    categoria: "student",
  },
];

/**
 * Categorías del catálogo estándar. Las cuotas son valores de relleno redondos y evidentemente
 * ficticios, en centavos (P-02): las reales las define el club.
 */
const CATEGORIAS = [
  { code: "student", name: "Estudiante", monthlyFeeCents: 0n, rights: { requiere_aptitud: true } },
  {
    code: "temporary_member",
    name: "Miembro temporal",
    monthlyFeeCents: 10000000n,
    rights: { puede_postular_practicas: true },
  },
  {
    code: "permanent_member",
    name: "Miembro permanente",
    monthlyFeeCents: 20000000n,
    rights: { puede_postular_practicas: true, puede_reservar_taqueo: true },
  },
  {
    code: "partner",
    name: "Socio",
    monthlyFeeCents: 30000000n,
    rights: {
      puede_postular_practicas: true,
      puede_inscribir_copas: true,
      puede_reservar_taqueo: true,
    },
  },
  {
    code: "guest",
    name: "Invitado",
    monthlyFeeCents: 0n,
    rights: { puede_inscribir_copas: true },
  },
];

/**
 * Siembra el club de ejemplo. Recibe el cliente en vez de crearlo para que un test pueda
 * llamarla dos veces contra su propia base y comprobar la idempotencia de verdad, en lugar de
 * dejarla verificada a mano.
 */
export async function sembrarClubDemo(
  prisma: PrismaClient,
  opciones: { silencioso?: boolean } = {},
): Promise<void> {
  const log = (mensaje: string): void => {
    if (!opciones.silencioso) console.log(mensaje);
  };

  log(`Sembrando el club de ejemplo «${CLUB_ID}»…`);

  // ── El club ─────────────────────────────────────────────────────────────────
  // Va primero porque desde T-202 todo lo demás tiene llave foránea hacia él: sin esta fila, el
  // seed falla en la primera categoría. Se crea `active` y con su slug propio, a diferencia de
  // los clubes que la migración de T-202 haya creado para datos huérfanos, que quedan suspendidos.
  await prisma.club.upsert({
    where: { id: CLUB_ID },
    create: { id: CLUB_ID, slug: CLUB_SLUG, name: "Club de ejemplo", status: "active" },
    update: { slug: CLUB_SLUG, name: "Club de ejemplo", status: "active" },
  });
  log(`  1 club (${CLUB_SLUG})`);

  // ── Categorías de membresía ─────────────────────────────────────────────────
  // `upsert` sobre (club_id, code), que es único: correrlo de nuevo actualiza en vez de duplicar.
  for (const categoria of CATEGORIAS) {
    await prisma.membershipCategory.upsert({
      where: { clubId_code: { clubId: CLUB_ID, code: categoria.code } },
      create: { clubId: CLUB_ID, ...categoria },
      update: { name: categoria.name, rights: categoria.rights },
    });
  }
  log(`  ${CATEGORIAS.length} categorías de membresía`);

  // ── Versión del waiver ──────────────────────────────────────────────────────
  // Sin un waiver publicado nadie puede postularse a una práctica ni reservar una clase
  // (R-010-12), así que un seed sin él no sirve para probar nada.
  await prisma.waiverVersion.upsert({
    where: { clubId_version: { clubId: CLUB_ID, version: 1 } },
    create: {
      clubId: CLUB_ID,
      version: 1,
      body: "Texto de ejemplo de la exención de responsabilidad. El club define el suyo.",
      publishedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    update: {},
  });
  log("  1 versión del waiver");

  // ── Personas, cuentas y roles ───────────────────────────────────────────────
  const passwordHash = await argon2.hash(CONTRASENA_DEMO, { type: argon2.argon2id });

  for (const persona of PERSONAS) {
    const registro = await prisma.person.upsert({
      where: { clubId_email: { clubId: CLUB_ID, email: persona.email } },
      create: { clubId: CLUB_ID, fullName: persona.fullName, email: persona.email },
      update: { fullName: persona.fullName },
    });

    const cuenta = await prisma.userAccount.upsert({
      where: { email: persona.email },
      create: {
        personId: registro.id,
        email: persona.email,
        passwordHash,
        status: "active",
        emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      // No se reescribe el hash en cada corrida: si alguien cambió su contraseña en
      // desarrollo, el seed no debería deshacerlo.
      update: { status: "active" },
    });

    // El rol no se puede hacer con `upsert`: su unicidad es un índice **parcial** (sólo sobre
    // las asignaciones no revocadas) y Prisma no sabe apuntar a eso. Se busca y se crea.
    const yaTiene = await prisma.roleAssignment.findFirst({
      where: {
        userAccountId: cuenta.id,
        role: persona.role,
        scope: "club",
        scopeId: CLUB_ID,
        revokedAt: null,
      },
    });
    if (!yaTiene) {
      await prisma.roleAssignment.create({
        data: {
          userAccountId: cuenta.id,
          role: persona.role,
          scope: "club",
          scopeId: CLUB_ID,
          // El primer administrador se otorga el rol a sí mismo: por definición no hay nadie
          // antes que él. De ahí en adelante, quien otorga siempre es otra cuenta.
          grantedById: cuenta.id,
        },
      });
    }

    // Membresía vigente. Igual que el rol: la unicidad real es el `EXCLUDE` de solapamiento
    // (T-003), no una clave que `upsert` pueda usar.
    const categoria = await prisma.membershipCategory.findUniqueOrThrow({
      where: { clubId_code: { clubId: CLUB_ID, code: persona.categoria } },
    });
    const yaTieneMembresia = await prisma.membershipAssignment.findFirst({
      where: { personId: registro.id, effectiveTo: null },
    });
    if (!yaTieneMembresia) {
      await prisma.membershipAssignment.create({
        data: {
          clubId: CLUB_ID,
          personId: registro.id,
          membershipCategoryId: categoria.id,
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
          assignedById: cuenta.id,
        },
      });
    }

    log(`  ${persona.fullName} (${persona.role}) — ${persona.email}`);
  }

  log(`\nListo. Contraseña de todas las cuentas de ejemplo: ${CONTRASENA_DEMO}`);
}

/**
 * Punto de entrada de línea de comandos (`pnpm db:seed`). Sólo corre si el archivo se invoca
 * directamente; al importarlo desde un test no hace nada por su cuenta.
 */
async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "true") {
    throw new Error(
      "El seed crea cuentas con una contraseña conocida y no debe correr en producción. " +
        "Si de verdad hace falta, exporta SEED_ALLOW_PRODUCTION=true.",
    );
  }

  const prisma = new PrismaClient();
  try {
    await sembrarClubDemo(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
