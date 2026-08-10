import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { configurarApp } from "./configure-app.js";

/**
 * docs/07-deployment-ec2.md §8 — el proceso escucha en el puerto interno 3000;
 * Caddy hace el reverse proxy y TLS. El tenant se resuelve por subdominio antes de llegar
 * aquí (docs/01-architecture.md §2), no en este archivo.
 */
async function bootstrap(): Promise<void> {
  // El mismo montaje que usan los tests (`configure-app.ts`): filtro de errores y `requestId`.
  const app = configurarApp(await NestFactory.create(AppModule));
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

void bootstrap();
