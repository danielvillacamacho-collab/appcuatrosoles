import "reflect-metadata";
import { readFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import type { INestApplication } from "@nestjs/common";
import type { Clock } from "@polo/domain";
import { AppModule } from "../../src/app.module.js";
import { CLOCK } from "../../src/common/clock/clock.module.js";
import { MAILER, type Mailer } from "../../src/common/mailer/mailer.port.js";
import { OutboxProcessor } from "../../src/common/outbox/outbox.processor.js";
import { OutboxRepository } from "../../src/common/outbox/outbox.repository.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { configurarApp } from "../../src/configure-app.js";
import { etiqueta } from "../db.js";

/**
 * El límite del procesador va alto a propósito: los demás archivos de la suite comparten la base y
 * encolan sus propias invitaciones, así que con el límite por defecto este test podía quedarse sin
 * llegar a su mensaje. Es un detalle del arnés, no del componente.
 */
describe("Bandeja de salida transaccional (T-026, P-11)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let repositorio: OutboxRepository;
  let procesador: OutboxProcessor;
  const carpeta = resolve("./.correos-de-prueba");

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");
    process.env.MAIL_DIR = carpeta;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configurarApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    repositorio = app.get(OutboxRepository);
    procesador = app.get(OutboxProcessor);
  });

  afterAll(async () => {
    await app.close();
    await rm(carpeta, { recursive: true, force: true });
  });

  async function encolarInvitacion(email: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await repositorio.encolar(tx, {
        tipo: "identity.send-invitation",
        payload: { email, fullName: "Persona invitada", link: "https://club.test/invitacion/abc" },
      });
    });
  }

  describe("lo que hace transaccional a la bandeja (P-11)", () => {
    it("si la transacción se revierte, el mensaje se va con ella", async () => {
      // Es la mitad que justifica la tabla: sin ella, encolar en una cola externa dejaría un correo
      // anunciando algo que nunca ocurrió.
      const email = `${etiqueta("revertido")}@ejemplo.test`;

      await expect(
        prisma.$transaction(async (tx) => {
          await repositorio.encolar(tx, {
            tipo: "identity.send-invitation",
            payload: { email },
          });

          throw new Error("algo falló después de encolar");
        }),
      ).rejects.toThrow();

      const encolados = await prisma.outboxMessage.count({
        where: { payload: { path: ["email"], equals: email } },
      });
      expect(encolados).toBe(0);
    });

    it("si la transacción cierra bien, el mensaje queda pendiente aunque nadie lo haya enviado", async () => {
      // La otra mitad: si el proceso muere entre el COMMIT y el envío, la invitación no se pierde.
      const email = `${etiqueta("pendiente")}@ejemplo.test`;
      await encolarInvitacion(email);

      const mensaje = await prisma.outboxMessage.findFirstOrThrow({
        where: { payload: { path: ["email"], equals: email } },
      });

      expect(mensaje.sentAt).toBeNull();
      expect(mensaje.attempts).toBe(0);
    });
  });

  describe("el envío", () => {
    it("procesa lo pendiente y escribe el correo donde se puede abrir", async () => {
      const email = `${etiqueta("enviado")}@ejemplo.test`;
      await encolarInvitacion(email);

      await procesador.procesarPendientes(500);

      const archivos = await readdir(carpeta);
      const suyo = archivos.find((nombre) => nombre.includes(email));

      expect(suyo).toBeDefined();

      const contenido = await readFile(join(carpeta, suyo ?? ""), "utf8");
      expect(contenido).toContain("https://club.test/invitacion/abc");
      expect(contenido).toContain("Persona invitada");
    });

    it("un mensaje se envía UNA sola vez, aunque el procesador corra de nuevo", async () => {
      const email = `${etiqueta("unavez")}@ejemplo.test`;
      await encolarInvitacion(email);

      await procesador.procesarPendientes(500);
      const despuesDelPrimero = (await readdir(carpeta)).filter((n) => n.includes(email)).length;
      await procesador.procesarPendientes(500);
      const despuesDelSegundo = (await readdir(carpeta)).filter((n) => n.includes(email)).length;

      expect(despuesDelPrimero).toBe(1);
      expect(despuesDelSegundo).toBe(1);
    });

    it("un envío fallido vuelve a la cola con espera, y guarda el motivo", async () => {
      const email = `${etiqueta("falla")}@ejemplo.test`;
      await encolarInvitacion(email);

      const mailer = app.get<Mailer>(MAILER);
      const espia = vi.spyOn(mailer, "enviar").mockRejectedValueOnce(new Error("SMTP caído"));

      await procesador.procesarPendientes(500);

      const mensaje = await prisma.outboxMessage.findFirstOrThrow({
        where: { payload: { path: ["email"], equals: email } },
      });

      expect(mensaje.sentAt).toBeNull();
      expect(mensaje.attempts).toBe(1);
      expect(mensaje.lastError).toContain("SMTP caído");
      // Y no se reintenta de inmediato: la espera crece con cada intento.
      expect(mensaje.availableAt.getTime()).toBeGreaterThan(app.get<Clock>(CLOCK).now().getTime());

      espia.mockRestore();
    });

    it("un tipo desconocido no manda un correo vacío: falla y queda registrado", async () => {
      // Preferimos un mensaje atascado con su motivo en `last_error` a uno que llega sin sentido.
      await prisma.outboxMessage.create({
        data: { type: "identity.enviar-algo-que-no-existe", payload: { email: "x@y.test" } },
      });

      await procesador.procesarPendientes(500);

      const mensaje = await prisma.outboxMessage.findFirstOrThrow({
        where: { type: "identity.enviar-algo-que-no-existe" },
      });

      expect(mensaje.sentAt).toBeNull();
      expect(mensaje.lastError).toContain("desconocido");
    });
  });

  it("el correo va también en texto plano: sólo-HTML cae en spam con más facilidad", async () => {
    const email = `${etiqueta("texto")}@ejemplo.test`;
    const mailer = app.get<Mailer>(MAILER);
    const espia = vi.spyOn(mailer, "enviar");

    await encolarInvitacion(email);
    await procesador.procesarPendientes(500);

    const enviado = espia.mock.calls.find((llamada) => llamada[0].para === email)?.[0];

    expect(enviado?.texto).toContain("https://club.test/invitacion/abc");
    expect(enviado?.texto).not.toContain("<a href");

    espia.mockRestore();
  });
});
