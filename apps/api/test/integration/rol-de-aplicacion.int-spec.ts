import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { etiqueta } from "../db.js";

/**
 * T-007 — El rol de aplicación no puede lo que no debe.
 *
 * **La suite entera ya corre con este rol** (`test/global-setup.ts`), así que si le faltara un
 * permiso necesario no fallaría este archivo: fallarían los tests de la funcionalidad afectada. Lo
 * que se comprueba acá es lo contrario — que le sobren permisos es lo que ningún otro test vería,
 * porque un permiso de más nunca rompe nada hasta el día que alguien lo usa.
 *
 * Y se comprueba **por qué** falla, no sólo que falla. La constitución (P-07) pide dos capas
 * independientes sobre la auditoría, y un test que sólo mire «dio error» no distingue si están las
 * dos o si quedó una sola sosteniendo todo.
 */
describe("El rol de aplicación (T-007)", () => {
  /** Como se conecta la aplicación: `polo_app`, que no es dueño de nada. */
  let aplicacion: PrismaClient;
  /** Como corren las migraciones: el dueño de las tablas. */
  let duenio: PrismaClient;

  /** El código de PostgreSQL, que es lo que distingue una capa de la otra. */
  function codigoDe(error: unknown): string {
    const mensaje = error instanceof Error ? error.message : String(error);
    const conCodigo = mensaje.match(/Code: `(\w+)`/u);

    if (conCodigo?.[1] !== undefined) {
      return conCodigo[1];
    }

    return mensaje.includes("permission denied") ? "42501" : "desconocido";
  }

  async function falla(consulta: string, cliente = aplicacion): Promise<string> {
    try {
      await cliente.$executeRawUnsafe(consulta);
    } catch (error) {
      return codigoDe(error);
    }

    throw new Error(`La consulta no falló y debía: ${consulta}`);
  }

  beforeAll(() => {
    aplicacion = new PrismaClient({ datasources: { db: { url: inject("databaseUrl") } } });
    duenio = new PrismaClient({ datasources: { db: { url: inject("databaseUrlAdmin") } } });
  });

  afterAll(async () => {
    await Promise.all([aplicacion.$disconnect(), duenio.$disconnect()]);
  });

  it("se conecta con un rol que NO es el dueño de las tablas", async () => {
    // Si esto fallara, todo lo demás de este archivo pasaría por casualidad: el dueño se salta
    // cualquier comprobación de permisos, así que un `REVOKE` contra él no hace absolutamente nada.
    const [quienSoy] = await aplicacion.$queryRawUnsafe<{ current_user: string }[]>(
      "SELECT current_user",
    );

    expect(quienSoy?.current_user).toBe("polo_app");
  });

  describe("la auditoría es append-only, POR PERMISOS", () => {
    it("no puede modificarla, y el rechazo es 42501 y no el disparador", async () => {
      // **Ésta es la comprobación que pide T-007.** Hasta ahora la promesa la sostenía sólo el
      // disparador; si mañana alguien lo borrara por error, sin esta capa la auditoría quedaría
      // editable y nadie se enteraría.
      expect(await falla("UPDATE audit_log SET action = 'alterado'")).toBe("42501");
    });

    it("ni borrarla", async () => {
      expect(await falla("DELETE FROM audit_log")).toBe("42501");
    });

    it("ni vaciarla: TRUNCATE no dispara los disparadores de DELETE", async () => {
      expect(await falla("TRUNCATE audit_log")).toBe("42501");
    });

    it("pero SÍ puede escribir en ella: sin eso no habría auditoría", async () => {
      await aplicacion.$executeRawUnsafe(
        `INSERT INTO audit_log (id, action, entity_type, entity_id, request_id)
         VALUES (gen_random_uuid()::text, 'prueba.t007', 'x', 'y', 'req-t007')`,
      );

      const [cuantos] = await aplicacion.$queryRawUnsafe<{ n: bigint }[]>(
        "SELECT count(*) AS n FROM audit_log WHERE action = 'prueba.t007'",
      );

      expect(Number(cuantos?.n ?? 0)).toBeGreaterThan(0);
    });

    it("y las DOS capas están: al dueño lo para el disparador, no los permisos", async () => {
      // La prueba de que son independientes. El dueño se salta los permisos —por eso el `REVOKE`
      // no bastaba— y aun así no puede: lo detiene el disparador, con su propio código de error.
      expect(await falla("UPDATE audit_log SET action = 'x'", duenio)).not.toBe("42501");
    });
  });

  describe("el historial de handicaps también (`specs/030` R-030-10)", () => {
    it("no se puede modificar", async () => {
      expect(await falla("UPDATE handicap_history SET reason = 'alterado'")).toBe("42501");
    });

    it("ni borrar", async () => {
      expect(await falla("DELETE FROM handicap_history")).toBe("42501");
    });

    it("y al dueño lo para el disparador", async () => {
      expect(await falla("UPDATE handicap_history SET reason = 'x'", duenio)).not.toBe("42501");
    });
  });

  describe("lo que una aplicación no tiene por qué poder", () => {
    it("no crea tablas", async () => {
      expect(await falla("CREATE TABLE colada (x int)")).toBe("42501");
    });

    it("no borra el disparador que la limita", async () => {
      // Sin esto la segunda capa sería decorativa: bastaría con quitar el disparador para volver a
      // tener la auditoría editable.
      expect(await falla("DROP TRIGGER audit_log_no_update ON audit_log")).toBe("42501");
    });

    it("no borra tablas", async () => {
      expect(await falla("DROP TABLE audit_log")).toBe("42501");
    });
  });

  describe("lo que sí necesita para trabajar", () => {
    it("lee y escribe las tablas normales", async () => {
      const club = await aplicacion.club.create({
        data: { slug: `rol-${etiqueta("s")}`.toLowerCase().slice(0, 40), name: "Club del rol" },
      });

      await aplicacion.club.update({ where: { id: club.id }, data: { name: "Renombrado" } });
      await aplicacion.club.delete({ where: { id: club.id } });

      expect(await aplicacion.club.count({ where: { id: club.id } })).toBe(0);
    });
  });

  it("NINGUNA tabla append-only le dejó permisos de escritura", async () => {
    // **La red para las que vengan.** Los privilegios por defecto le otorgan escritura a toda tabla
    // nueva, que es lo que hace mantenible el esquema — y significa que una tabla append-only
    // futura nacería editable si nadie se acuerda de revocarle los permisos. Este test se acuerda.
    const conDisparador = await duenio.$queryRawUnsafe<{ tabla: string }[]>(`
      SELECT DISTINCT c.relname AS tabla
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND t.tgname LIKE '%_no_update'
    `);

    expect(conDisparador.length).toBeGreaterThan(0);

    for (const { tabla } of conDisparador) {
      const permisos = await duenio.$queryRawUnsafe<{ privilege_type: string }[]>(
        `SELECT privilege_type FROM information_schema.table_privileges
         WHERE grantee = 'polo_app' AND table_name = $1`,
        tabla,
      );
      const escritura = permisos
        .map((fila) => fila.privilege_type)
        .filter((tipo) => tipo === "UPDATE" || tipo === "DELETE" || tipo === "TRUNCATE");

      expect(escritura, `${tabla} es append-only y le quedaron permisos de escritura`).toEqual([]);
    }
  });
});
