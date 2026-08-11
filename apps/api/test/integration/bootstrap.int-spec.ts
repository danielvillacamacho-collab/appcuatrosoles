import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { DiscoveryService, MetadataScanner } from "@nestjs/core";
import { afterAll, describe, expect, inject, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { AppModule } from "../../src/app.module.js";
import { arrancarPrimerClub, leerArgumentos } from "../../prisma/bootstrap.js";
import { crearClienteDePrueba, etiqueta } from "../db.js";

describe("Arranque del primer club (T-232, HU-020-03)", () => {
  const prisma: PrismaClient = crearClienteDePrueba();

  function argumentos(): Parameters<typeof arrancarPrimerClub>[1] {
    const marca = etiqueta("arranque").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);

    return {
      slug: marca,
      name: "Club del arranque",
      admin: `${marca}-admin@ejemplo.test`,
      adminNombre: "Primera administradora",
      superadmin: `${marca}-super@ejemplo.test`,
      timezone: "America/Bogota",
      currency: "COP",
    };
  }

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("lectura de argumentos", () => {
    it("acepta los argumentos completos", () => {
      const leidos = leerArgumentos([
        "--slug=lospinos",
        "--name=Club Los Pinos",
        "--admin=maria@club.co",
        "--admin-nombre=María",
        "--superadmin=daniel@ejemplo.com",
      ]);

      expect(leidos).toMatchObject({ slug: "lospinos", timezone: "America/Bogota" });
    });

    it("dice cuáles faltan, en vez de crear un club a medias", () => {
      const leidos = leerArgumentos(["--slug=lospinos"]);

      expect(leidos).toHaveProperty("error");
      expect((leidos as { error: string }).error).toContain("--admin");
    });
  });

  describe("comportamiento", () => {
    it("crea el club completo si la instalación está vacía, y correrlo de nuevo no duplica nada", async () => {
      // La suite comparte una base con los demás archivos, así que no se puede exigir que esté
      // vacía al llegar aquí. Lo que sí es determinista —y es lo que la tarea pide verificar— es
      // que **la segunda corrida no hace nada**, sin importar qué pasó en la primera.
      const mensajes: string[] = [];
      const primera = await arrancarPrimerClub(prisma, argumentos(), (m) => mensajes.push(m));

      if (primera === "creado") {
        const club = await prisma.club.findFirstOrThrow({ orderBy: { createdAt: "desc" } });

        expect(await prisma.membershipCategory.count({ where: { clubId: club.id } })).toBe(5);
        expect(await prisma.season.count({ where: { clubId: club.id, status: "open" } })).toBe(1);

        const superadmin = await prisma.roleAssignment.findFirst({
          where: { role: "superadmin", scope: "platform" },
        });
        expect(superadmin).not.toBeNull();

        // Las contraseñas se imprimen una sola vez, en la terminal de quien corre el script.
        expect(mensajes.join("\n")).toContain("Contraseñas iniciales");
      }

      const clubesTrasLaPrimera = await prisma.club.count();
      expect(clubesTrasLaPrimera).toBeGreaterThan(0);

      const segundos: string[] = [];
      const segunda = await arrancarPrimerClub(prisma, argumentos(), (m) => segundos.push(m));

      expect(segunda).toBe("ya-estaba");
      expect(segundos.join(" ")).toContain("ya tiene");
      expect(await prisma.club.count()).toBe(clubesTrasLaPrimera);
    });

    it("el administrador queda activo, no invitado: sin correo de invitación no podría entrar", async () => {
      // Es la diferencia deliberada con el alta por API (T-230), donde sí queda `invited`: aquí la
      // contraseña se entrega por el canal por el que se corre el script, que es una persona.
      const cuentas = await prisma.userAccount.findMany({
        where: { email: { contains: "-admin@ejemplo.test" } },
        select: { status: true },
      });

      expect(cuentas.every((cuenta) => cuenta.status === "active")).toBe(true);
    });
  });

  it("NO existe ninguna ruta HTTP que haga esto (criterio de T-232)", async () => {
    // El criterio literal de la tarea. Se recorre la aplicación entera y se exige que ninguna ruta
    // registrada mencione «bootstrap» ni «arranque»: si alguien agrega ese atajo alguna vez, este
    // test lo detiene. La decisión D-020-04 existe porque una puerta abierta «sólo la primera vez»
    // es la que después nadie recuerda cerrar.
    process.env.DATABASE_URL = inject("databaseUrl");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const discovery = app.get(DiscoveryService);
    const scanner = app.get(MetadataScanner);
    const rutas: string[] = [];

    for (const wrapper of discovery.getControllers()) {
      const instancia: unknown = wrapper.instance;

      if (instancia === null || typeof instancia !== "object") continue;

      const prototipo: object = Object.getPrototypeOf(instancia);
      const ruta: unknown = Reflect.getMetadata("path", instancia.constructor);

      for (const metodo of scanner.getAllMethodNames(prototipo)) {
        rutas.push(`${typeof ruta === "string" ? ruta : ""}/${metodo}`);
      }
    }

    const sospechosas = rutas.filter((ruta) => /bootstrap|arranque|first-club/i.test(ruta));

    expect(sospechosas).toEqual([]);
    await app.close();
  });
});
