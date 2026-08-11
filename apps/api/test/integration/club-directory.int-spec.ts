import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import type { Clock } from "@polo/domain";
import { CLOCK } from "../../src/common/clock/clock.module.js";
import { PrismaModule } from "../../src/common/prisma/prisma.module.js";
import { PrismaService } from "../../src/common/prisma/prisma.service.js";
import { ClubDirectory } from "../../src/tenant/club-directory.js";
import { ClubRepository } from "../../src/tenant/club.repository.js";
import { crearClubDePrueba } from "../db.js";

/** Reloj movible: es lo que permite escribir «pasaron 61 segundos» sin esperarlos. */
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

describe("ClubDirectory (T-220)", () => {
  let directorio: ClubDirectory;
  let repositorio: ClubRepository;
  let prisma: PrismaService;
  let reloj: RelojMovible;

  beforeAll(async () => {
    process.env.DATABASE_URL = inject("databaseUrl");
    reloj = new RelojMovible(new Date("2026-08-11T12:00:00.000Z"));

    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule],
      providers: [ClubRepository, ClubDirectory, { provide: CLOCK, useValue: reloj }],
    }).compile();

    await moduleRef.init();
    directorio = moduleRef.get(ClubDirectory);
    repositorio = moduleRef.get(ClubRepository);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    directorio.invalidate();
    vi.restoreAllMocks();
  });

  it("dos lecturas seguidas hacen una sola consulta (criterio de T-220)", async () => {
    const espia = vi.spyOn(repositorio, "findAll");

    await directorio.all();
    await directorio.all();

    expect(espia).toHaveBeenCalledTimes(1);
  });

  it("tras invalidar, vuelve a consultar", async () => {
    await directorio.all();
    const espia = vi.spyOn(repositorio, "findAll");

    directorio.invalidate();
    await directorio.all();

    expect(espia).toHaveBeenCalledTimes(1);
  });

  it("un club creado después no aparece hasta invalidar — por eso la invalidación es obligatoria", async () => {
    // Es el corazón de R-020-04 visto al revés: si un club nuevo no aparece sin invalidar, un club
    // suspendido tampoco desaparece. Quien cambia el estado de un club, invalida.
    const antes = await directorio.all();
    const nuevoId = await crearClubDePrueba(prisma, "aparece-luego");

    expect((await directorio.all()).map((club) => club.id)).toEqual(antes.map((club) => club.id));

    directorio.invalidate();

    expect((await directorio.all()).map((club) => club.id)).toContain(nuevoId);
  });

  it("pasado el minuto de vida útil, vuelve a consultar sola", async () => {
    await directorio.all();
    const espia = vi.spyOn(repositorio, "findAll");

    reloj.avanzar(UN_MINUTO - 1);
    await directorio.all();
    expect(espia).toHaveBeenCalledTimes(0);

    reloj.avanzar(2);
    await directorio.all();
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it("veinte solicitudes simultáneas con la caché fría hacen una sola consulta", async () => {
    // El arranque de un proceso es exactamente este momento. Sin deduplicar la carga en curso,
    // cada solicitud dispara la suya y la base recibe veinte consultas idénticas de golpe.
    const espia = vi.spyOn(repositorio, "findAll");

    await Promise.all(Array.from({ length: 20 }, async () => directorio.all()));

    expect(espia).toHaveBeenCalledTimes(1);
  });

  it("si la base falla, no se sirve la copia vieja: falla la solicitud", async () => {
    // Servir la copia vieja mantendría el sitio en pie, y es tentador. Pero esa copia puede
    // contener un club que acaba de ser suspendido, y servirlo es el único error que este
    // componente no puede cometer.
    await directorio.all();
    const espia = vi.spyOn(repositorio, "findAll").mockRejectedValue(new Error("base caída"));

    directorio.invalidate();
    await expect(directorio.all()).rejects.toThrow("base caída");

    // Y tampoco queda una carga en curso pegada que envenene la siguiente lectura.
    espia.mockRestore();
    await expect(directorio.all()).resolves.toEqual(expect.any(Array));
  });

  it("trae los clubes suspendidos, no sólo los activos", async () => {
    // `resolveTenant` los necesita para distinguir en el log un club que dejó de pagar de un
    // intento a ciegas — aunque la respuesta al cliente sea idéntica en los dos casos.
    const suspendidoId = await crearClubDePrueba(prisma, "suspendido");
    await prisma.club.update({ where: { id: suspendidoId }, data: { status: "suspended" } });

    directorio.invalidate();
    const clubes = await directorio.all();

    expect(clubes.find((club) => club.id === suspendidoId)?.status).toBe("suspended");
  });
});
