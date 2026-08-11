import { afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { normalizeSlug, validateSlug } from "@polo/domain";
import { crearClienteDePrueba, etiqueta } from "../db.js";

/**
 * T-201 · Los invariantes de `club`, `organization`, `season` y `setting` viven en la base de
 * datos, no en un servicio (P-09).
 *
 * Cada uno se comprueba **provocando su rechazo**, no asumiéndolo. Un `CHECK` mal escrito —o que
 * alguien quite en una migración futura— no rompe ninguna otra prueba: la aplicación seguiría
 * pasando sus tests mientras la base acepta datos imposibles. Éstos son los únicos tests que se
 * enterarían.
 */
describe("Esquema de club y configuración · invariantes en la base", () => {
  const prisma: PrismaClient = crearClienteDePrueba();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function crearClub(slug: string): Promise<string> {
    const club = await prisma.club.create({ data: { slug, name: `Club ${slug}` } });

    return club.id;
  }

  /** Slugs de prueba: cortos, en minúsculas y únicos, para no chocar con el índice único. */
  function slugDePrueba(): string {
    return etiqueta("c").toLowerCase().replace(/[^a-z0-9-]/g, "-");
  }

  describe("el slug es la frontera de tenant, así que su forma se garantiza", () => {
    it("acepta un slug de letras, números y guiones", async () => {
      const id = await crearClub(slugDePrueba());

      expect(id).toEqual(expect.any(String));
    });

    for (const invalido of [
      "LosPinos", // mayúsculas: el host llega en minúsculas y nunca coincidiría
      "los pinos", // espacio: no es una etiqueta de host válida
      "los.pinos", // punto: sería otro nivel de subdominio, no este club
      "-lospinos", // guion al principio
      "lospinos-", // guion al final
      "los_pinos", // guion bajo: inválido en un nombre de host
      "l", // demasiado corto
    ]) {
      it(`rechaza «${invalido}»`, async () => {
        await expect(prisma.club.create({ data: { slug: invalido, name: "X" } })).rejects.toThrow();
      });
    }

    it("rechaza un slug de más de 63 caracteres — el máximo de una etiqueta de host", async () => {
      await expect(
        prisma.club.create({ data: { slug: "a".repeat(64), name: "X" } }),
      ).rejects.toThrow();
    });

    it("no admite dos clubes con el mismo slug: resolvería a dos tenants distintos", async () => {
      const slug = slugDePrueba();
      await crearClub(slug);

      await expect(prisma.club.create({ data: { slug, name: "Otro" } })).rejects.toThrow();
    });
  });

  describe("la regla del dominio y el CHECK de la base no se contradicen (T-210)", () => {
    // El formato del slug está escrito dos veces: en `packages/domain/tenant/slug.ts` y en el
    // CHECK `club_slug_formato` de la migración T-201. Cada capa protege de algo distinto —la
    // base, de cualquier vía de escritura; el dominio, de aceptar y después fallar—, pero si se
    // separan, el usuario recibe un 500 donde debería recibir un mensaje claro. Esto lo vigila.
    const CANDIDATOS = [
      "lospinos",
      "los-pinos",
      "ab",
      "x1",
      "a".repeat(63),
      "a".repeat(64),
      "a",
      "los pinos",
      "los.pinos",
      "los_pinos",
      "-lospinos",
      "lospinos-",
      "LosPinos",
    ];

    it("todo lo que el dominio acepta, la base lo acepta", async () => {
      const rechazadosPorLaBase: string[] = [];

      for (const candidato of CANDIDATOS) {
        const veredicto = validateSlug(candidato);
        if (!veredicto.ok) continue;

        // Se usa el valor ya normalizado: es lo que la aplicación va a persistir de verdad.
        const slug = `${veredicto.value}-${etiqueta("x").toLowerCase().replace(/[^a-z0-9-]/g, "")}`.slice(0, 63);
        try {
          await prisma.club.create({ data: { slug, name: "Comparación" } });
        } catch {
          rechazadosPorLaBase.push(candidato);
        }
      }

      expect(rechazadosPorLaBase).toEqual([]);
    });

    it("todo lo que la base rechaza por formato, el dominio ya lo había rechazado", async () => {
      const colados: string[] = [];

      for (const candidato of CANDIDATOS) {
        // Se inserta el valor **normalizado**, que es lo que la aplicación persiste: el contrato
        // del dominio es «validá y guardá lo que te devuelvo», no «guardá lo que escribió el
        // usuario». Comparar contra el texto crudo mediría otra cosa.
        const aPersistir = normalizeSlug(candidato);
        let rechazadoPorFormato = false;

        try {
          await prisma.club.create({ data: { slug: aPersistir, name: "Comparación" } });
        } catch (error) {
          // Un choque con el índice único significa que el formato **sí** pasó: el motor llegó
          // hasta la unicidad. Sólo cuenta el rechazo por la restricción de formato.
          const codigo = (error as { code?: string }).code;
          rechazadoPorFormato = codigo !== "P2002";
        }

        if (rechazadoPorFormato && validateSlug(candidato).ok) colados.push(candidato);
      }

      expect(colados).toEqual([]);
    });
  });

  describe("una temporada tiene fechas coherentes y no se solapa con otra del mismo club", () => {
    it("rechaza una temporada que termina antes de empezar", async () => {
      const clubId = await crearClub(slugDePrueba());

      await expect(
        prisma.season.create({
          data: {
            clubId,
            name: "Al revés",
            startsOn: new Date("2026-12-31"),
            endsOn: new Date("2026-01-01"),
          },
        }),
      ).rejects.toThrow();
    });

    it("rechaza dos temporadas solapadas del mismo club (R-020-06)", async () => {
      const clubId = await crearClub(slugDePrueba());

      await prisma.season.create({
        data: {
          clubId,
          name: "Primera",
          startsOn: new Date("2026-01-01"),
          endsOn: new Date("2026-06-30"),
        },
      });

      await expect(
        prisma.season.create({
          data: {
            clubId,
            name: "Solapada",
            startsOn: new Date("2026-06-01"),
            endsOn: new Date("2026-12-31"),
          },
        }),
      ).rejects.toThrow();
    });

    it("rechaza el solapamiento de un solo día: el último día todavía pertenece a la temporada", async () => {
      // El rango es cerrado en ambos extremos a propósito. Con el rango semiabierto por defecto,
      // dos temporadas que comparten el día de cierre pasarían sin ser detectadas, y ese día
      // quedaría contando para dos temporadas a la vez en toda estadística.
      const clubId = await crearClub(slugDePrueba());

      await prisma.season.create({
        data: {
          clubId,
          name: "Primera",
          startsOn: new Date("2026-01-01"),
          endsOn: new Date("2026-06-30"),
        },
      });

      await expect(
        prisma.season.create({
          data: {
            clubId,
            name: "Empieza el mismo día que cierra la anterior",
            startsOn: new Date("2026-06-30"),
            endsOn: new Date("2026-12-31"),
          },
        }),
      ).rejects.toThrow();
    });

    it("permite temporadas consecutivas: la siguiente empieza al día siguiente", async () => {
      const clubId = await crearClub(slugDePrueba());

      await prisma.season.create({
        data: {
          clubId,
          name: "Primera",
          startsOn: new Date("2026-01-01"),
          endsOn: new Date("2026-06-30"),
        },
      });
      const segunda = await prisma.season.create({
        data: {
          clubId,
          name: "Segunda",
          startsOn: new Date("2026-07-01"),
          endsOn: new Date("2026-12-31"),
        },
      });

      expect(segunda.id).toEqual(expect.any(String));
    });

    it("dos clubes distintos sí pueden tener temporadas en las mismas fechas (P-05)", async () => {
      // La restricción es por club. Si fuera global, el segundo club de la plataforma no podría
      // abrir su temporada — un aislamiento roto por el lado menos obvio.
      const unClub = await crearClub(slugDePrueba());
      const otroClub = await crearClub(slugDePrueba());
      const fechas = { startsOn: new Date("2026-01-01"), endsOn: new Date("2026-12-31") };

      await prisma.season.create({ data: { clubId: unClub, name: "2026", ...fechas } });
      const laOtra = await prisma.season.create({
        data: { clubId: otroClub, name: "2026", ...fechas },
      });

      expect(laOtra.id).toEqual(expect.any(String));
    });
  });

  describe("un valor de configuración tiene ámbito coherente y no se duplica", () => {
    const AHORA = new Date("2026-08-11T00:00:00.000Z");

    it("acepta un valor de plataforma sin identificador de ámbito", async () => {
      const fila = await prisma.setting.create({
        data: {
          scope: "platform",
          scopeId: null,
          key: etiqueta("clave"),
          value: { minutos: 15 },
          effectiveFrom: AHORA,
        },
      });

      expect(fila.id).toEqual(expect.any(String));
    });

    it("rechaza un valor de plataforma CON identificador de ámbito", async () => {
      await expect(
        prisma.setting.create({
          data: {
            scope: "platform",
            scopeId: "un-club",
            key: etiqueta("clave"),
            value: true,
            effectiveFrom: AHORA,
          },
        }),
      ).rejects.toThrow();
    });

    it("rechaza un valor de club SIN identificador de ámbito", async () => {
      await expect(
        prisma.setting.create({
          data: {
            scope: "club",
            scopeId: null,
            key: etiqueta("clave"),
            value: true,
            effectiveFrom: AHORA,
          },
        }),
      ).rejects.toThrow();
    });

    it("no admite dos valores de club para la misma clave y la misma vigencia", async () => {
      const clubId = await crearClub(slugDePrueba());
      const key = etiqueta("clave");

      await prisma.setting.create({
        data: { scope: "club", scopeId: clubId, key, value: 1, effectiveFrom: AHORA },
      });

      await expect(
        prisma.setting.create({
          data: { scope: "club", scopeId: clubId, key, value: 2, effectiveFrom: AHORA },
        }),
      ).rejects.toThrow();
    });

    it("tampoco de PLATAFORMA, donde el índice normal no alcanzaba por culpa del NULL", async () => {
      // El índice único que genera Prisma incluye `scope_id`, y PostgreSQL considera distintos dos
      // NULL: sin un índice parcial aparte, la plataforma admitiría dos valores para la misma
      // clave y vigencia, y «el valor vigente» dejaría de ser una respuesta.
      const key = etiqueta("clave");

      await prisma.setting.create({
        data: { scope: "platform", scopeId: null, key, value: 1, effectiveFrom: AHORA },
      });

      await expect(
        prisma.setting.create({
          data: { scope: "platform", scopeId: null, key, value: 2, effectiveFrom: AHORA },
        }),
      ).rejects.toThrow();
    });

    it("sí admite el mismo valor con otra vigencia: así se guarda la historia (R-020-08)", async () => {
      const clubId = await crearClub(slugDePrueba());
      const key = etiqueta("clave");

      await prisma.setting.create({
        data: { scope: "club", scopeId: clubId, key, value: 1, effectiveFrom: AHORA },
      });
      const nuevo = await prisma.setting.create({
        data: {
          scope: "club",
          scopeId: clubId,
          key,
          value: 2,
          effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
        },
      });

      expect(nuevo.id).toEqual(expect.any(String));
      expect(await prisma.setting.count({ where: { scope: "club", scopeId: clubId, key } })).toBe(2);
    });
  });

  describe("nada se borra en cascada por accidente (P-06)", () => {
    it("no se puede borrar un club que tiene organizaciones", async () => {
      const clubId = await crearClub(slugDePrueba());
      await prisma.organization.create({
        data: { clubId, name: "Cuatro Soles", type: "school" },
      });

      await expect(prisma.club.delete({ where: { id: clubId } })).rejects.toThrow();
    });

    it("no se puede borrar un club que tiene temporadas", async () => {
      const clubId = await crearClub(slugDePrueba());
      await prisma.season.create({
        data: {
          clubId,
          name: "2026",
          startsOn: new Date("2026-01-01"),
          endsOn: new Date("2026-12-31"),
        },
      });

      await expect(prisma.club.delete({ where: { id: clubId } })).rejects.toThrow();
    });

    it("dos organizaciones del mismo club no repiten nombre, pero dos clubes sí pueden usarlo", async () => {
      const unClub = await crearClub(slugDePrueba());
      const otroClub = await crearClub(slugDePrueba());

      await prisma.organization.create({ data: { clubId: unClub, name: "Escuela", type: "school" } });
      await expect(
        prisma.organization.create({ data: { clubId: unClub, name: "Escuela", type: "school" } }),
      ).rejects.toThrow();

      const enOtroClub = await prisma.organization.create({
        data: { clubId: otroClub, name: "Escuela", type: "school" },
      });
      expect(enOtroClub.id).toEqual(expect.any(String));
    });
  });
});
