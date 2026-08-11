import "reflect-metadata";
import { Controller, Delete, Get, Module, Patch, Post } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";
import { PermissionsDeclaredService } from "../permissions-declared.service.js";
import { RequirePermission } from "../require-permission.js";
import type { INestApplication } from "@nestjs/common";

@Controller("bien")
class ControladorQueDeclara {
  @Get()
  listar(): string[] {
    return [];
  }

  @Post()
  @RequirePermission("user.create")
  crear(): void {}

  @Patch(":id")
  @RequirePermission("user.edit")
  editar(): void {}

  @Delete(":id")
  @RequirePermission("user.archive")
  archivar(): void {}
}

@Controller("olvidadizo")
class ControladorQueOlvida {
  @Get()
  listar(): string[] {
    return [];
  }

  @Post()
  crear(): void {}
}

/** Declara el permiso una sola vez para todas sus rutas: es un uso legítimo, no una trampa. */
@Controller("declara-en-la-clase")
@RequirePermission("user.suspend")
class ControladorQueDeclaraEnLaClase {
  @Post("suspender")
  suspender(): void {}

  @Post("reactivar")
  reactivar(): void {}
}

async function arrancarCon(...controllers: unknown[]): Promise<INestApplication> {
  @Module({
    imports: [DiscoveryModule],
    controllers: controllers as never[],
    providers: [PermissionsDeclaredService],
  })
  class ModuloDePrueba {}

  const moduleRef = await Test.createTestingModule({ imports: [ModuloDePrueba] }).compile();
  const app = moduleRef.createNestApplication();

  await app.init();

  return app;
}

describe("PermissionsDeclaredService (ADR-014 punto 4, P-13)", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("una ruta mutante sin @RequirePermission() impide arrancar la aplicación", async () => {
    // Éste es el criterio de verificación literal de T-022: no que responda 403, sino que la
    // aplicación no arranque. Una ruta mutante abierta responde 200 y pasa sus tests; el único
    // control que no depende de que alguien se acuerde es el que rompe el despliegue.
    await expect(arrancarCon(ControladorQueOlvida)).rejects.toThrow(/ControladorQueOlvida.crear/);
  });

  it("el mensaje dice exactamente qué ruta falta, para que se pueda arreglar sin buscar", async () => {
    await expect(arrancarCon(ControladorQueOlvida)).rejects.toThrow(/@RequirePermission/);
  });

  it("arranca cuando todas las rutas mutantes lo declaran", async () => {
    app = await arrancarCon(ControladorQueDeclara);

    expect(app).toBeDefined();
  });

  it("un GET no necesita declarar permiso: leer no cambia nada", async () => {
    // `ControladorQueDeclara` tiene un GET sin decorador y arranca igual — si el chequeo fuera
    // sobre todas las rutas, cada listado tendría que inventarse un permiso.
    app = await arrancarCon(ControladorQueDeclara);

    expect(app).toBeDefined();
  });

  it("declararlo en el controlador vale para todas sus rutas", async () => {
    app = await arrancarCon(ControladorQueDeclaraEnLaClase);

    expect(app).toBeDefined();
  });

  it("informa todas las rutas ofensoras, no sólo la primera", async () => {
    @Controller("otro-olvidadizo")
    class OtroControladorQueOlvida {
      @Delete(":id")
      borrar(): void {}
    }

    // Si fallara con la primera, arreglarla revelaría la siguiente: tres despliegues para tres
    // rutas. La lista completa se arregla de una vez.
    await expect(arrancarCon(ControladorQueOlvida, OtroControladorQueOlvida)).rejects.toThrow(
      /ControladorQueOlvida\.crear.*OtroControladorQueOlvida\.borrar/s,
    );
  });
});
