import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { Clock } from "@polo/domain";
import { AppModule } from "../../src/app.module.js";
import { PasswordService } from "../../src/auth/password.service.js";
import { CLOCK } from "../../src/common/clock/clock.module.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { BASE_DOMAIN } from "../../src/tenant/base-domain.js";
import { ClubDirectory } from "../../src/tenant/club-directory.js";
import { configurarApp } from "../../src/configure-app.js";
import { etiqueta } from "../db.js";

const BASE = "polo.test";
const CONTRASENA = "la-contrasena-correcta-9";

/** Reloj movible: escribir «pasaron 16 minutos» sin esperarlos (P-08, igual que en T-220). */
class RelojMovible implements Clock {
  constructor(private instante: Date) {}

  now(): Date {
    return this.instante;
  }

  avanzar(ms: number): void {
    this.instante = new Date(this.instante.getTime() + ms);
  }
}

const UN_MINUTO = 60_000;

describe("Bloqueo por intentos fallidos (T-032, docs/08 §9)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reloj: RelojMovible;
  let club: { id: string; slug: string };

  async function crearCuenta(): Promise<string> {
    const marca = etiqueta("bloqueo");
    const persona = await prisma.person.create({
      data: { clubId: club.id, fullName: "Persona que se equivoca" },
    });
    const cuenta = await prisma.userAccount.create({
      data: {
        personId: persona.id,
        email: `${marca}@ejemplo.test`,
        passwordHash: await app.get(PasswordService).hash(CONTRASENA),
        status: "active",
      },
    });

    return cuenta.email;
  }

  function entrar(email: string, password: string): request.Test {
    return request(app.getHttpServer())
      .post("/api/auth/login")
      .set("Host", `${club.slug}.${BASE}`)
      .send({ email, password });
  }

  async function fallar(email: string, veces: number): Promise<void> {
    for (let i = 0; i < veces; i += 1) {
      await entrar(email, "contrasena-equivocada");
    }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");
    reloj = new RelojMovible(new Date("2026-08-11T12:00:00.000Z"));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BASE_DOMAIN)
      .useValue(BASE)
      .overrideProvider(CLOCK)
      .useValue(reloj)
      .compile();

    app = configurarApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);

    const slug = etiqueta("bloqueo").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
    const creado = await prisma.club.create({ data: { slug, name: "Club con bloqueo" } });
    club = { id: creado.id, slug: creado.slug };
    app.get(ClubDirectory).invalidate();
  });

  afterAll(async () => {
    await app.close();
  });

  it("al quinto intento fallido bloquea, y ni la contraseña correcta abre la puerta", async () => {
    const email = await crearCuenta();

    await fallar(email, 4);
    // Al cuarto, todavía entra: el umbral son cinco (`docs/08` §9).
    expect((await entrar(email, CONTRASENA)).status).toBe(200);

    await fallar(email, 5);
    const bloqueada = await entrar(email, CONTRASENA);

    expect(bloqueada.status).toBe(401);
    expect(bloqueada.body.error.code).toBe("ACCOUNT_LOCKED");
  });

  it("a quien NO sabe la contraseña no se le dice que está bloqueada", async () => {
    // `docs/06` §2: el bloqueo no puede revelar nada a quien está probando correos — si lo hiciera,
    // bloquear cuentas ajenas sería una forma de averiguar cuáles existen.
    const email = await crearCuenta();
    await fallar(email, 5);

    const respuesta = await entrar(email, "sigo-sin-saberla");

    expect(respuesta.body.error.code).toBe("CREDENTIALS_INVALID");
  });

  it("pasado el tiempo configurado, desbloquea sola", async () => {
    const email = await crearCuenta();
    await fallar(email, 5);

    expect((await entrar(email, CONTRASENA)).body.error.code).toBe("ACCOUNT_LOCKED");

    reloj.avanzar(16 * UN_MINUTO);

    expect((await entrar(email, CONTRASENA)).status).toBe(200);
  });

  it("entrar bien borra el contador: cuatro errores sueltos no bloquean a nadie", async () => {
    const email = await crearCuenta();

    await fallar(email, 4);
    await entrar(email, CONTRASENA);
    await fallar(email, 4);

    // Ocho fallos en total, pero nunca cinco seguidos.
    expect((await entrar(email, CONTRASENA)).status).toBe(200);
  });

  it("el umbral sale de la configuración, no de una constante (P-04)", async () => {
    // Es el primer consumidor real del catálogo de T-212: bajar el umbral a 2 cambia el
    // comportamiento sin desplegar nada.
    await prisma.setting.create({
      data: {
        scope: "platform",
        scopeId: null,
        key: "auth.failed_login_lockout_threshold",
        value: 2,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
    });

    const email = await crearCuenta();
    await fallar(email, 2);

    expect((await entrar(email, CONTRASENA)).body.error.code).toBe("ACCOUNT_LOCKED");

    // Se deja como estaba para no condicionar a los demás tests del archivo.
    await prisma.setting.deleteMany({
      where: { scope: "platform", key: "auth.failed_login_lockout_threshold" },
    });
  });

  it("una cuenta bloqueada no queda bloqueada para siempre por seguir intentando", async () => {
    // Cada intento fallido durante el bloqueo suma, pero la ventana se cuenta desde el último:
    // lo que importa es que al pasar el tiempo vuelva a entrar, no que se castigue la insistencia.
    const email = await crearCuenta();
    await fallar(email, 5);
    await fallar(email, 3);

    reloj.avanzar(16 * UN_MINUTO);

    expect((await entrar(email, CONTRASENA)).status).toBe(200);
  });
});
