import { Injectable, RequestMethod, type OnApplicationBootstrap } from "@nestjs/common";
import { METHOD_METADATA } from "@nestjs/common/constants.js";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { PERMISO_REQUERIDO, RUTA_PUBLICA } from "./require-permission.js";

/** Los verbos que cambian datos. Un `GET` no necesita declarar permiso; todo lo demás, sí. */
const VERBOS_MUTANTES: ReadonlySet<RequestMethod> = new Set([
  RequestMethod.POST,
  RequestMethod.PUT,
  RequestMethod.PATCH,
  RequestMethod.DELETE,
]);

/**
 * Impide que la aplicación arranque si alguna ruta mutante no declaró su permiso
 * (`ADR-014` punto 4, `memory/constitution.md` P-13).
 *
 * **Por qué al arrancar y no en una revisión de código.** Este proyecto lo escribe una sola
 * persona con un agente y sin otro ingeniero revisando cada diff (`docs/09` D-04). Una ruta
 * mutante sin `@RequirePermission()` no se ve rota: responde `200`, pasa sus tests, y queda
 * abierta a cualquiera con sesión — un jugador borrando usuarios, por ejemplo. La única
 * verificación que no depende de que alguien se acuerde es la que rompe el arranque.
 *
 * Falla **con la lista completa** de rutas ofensoras y no con la primera: si hay tres, el objetivo
 * es que se arreglen las tres, no que se descubran de a una por despliegue.
 *
 * La única salida es `@RutaPublica("motivo")`, que exige escribir por qué. Sin ese motivo, esto
 * sería una formalidad que cualquiera saltaría olvidándose de declarar el permiso.
 */
@Injectable()
export class PermissionsDeclaredService implements OnApplicationBootstrap {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap(): void {
    const sinDeclarar = this.rutasMutantesSinPermiso();

    if (sinDeclarar.length > 0) {
      throw new Error(
        `Rutas mutantes sin @RequirePermission(): ${sinDeclarar.join(", ")}. ` +
          "Toda ruta que cambia datos declara su permiso (ADR-014 punto 4). Si de verdad debe " +
          "ser accesible sin permiso, dilo explícitamente en la ruta y documenta por qué.",
      );
    }
  }

  private rutasMutantesSinPermiso(): string[] {
    const ofensoras: string[] = [];

    for (const wrapper of this.discovery.getControllers()) {
      const controlador: unknown = wrapper.instance;

      if (controlador === null || typeof controlador !== "object") {
        continue;
      }

      const prototipo: object = Object.getPrototypeOf(controlador);
      const nombre = controlador.constructor.name;

      for (const metodo of this.scanner.getAllMethodNames(prototipo)) {
        const manejador: unknown = (prototipo as Record<string, unknown>)[metodo];

        if (typeof manejador !== "function") {
          continue;
        }

        const verbo = this.reflector.get<RequestMethod | undefined>(METHOD_METADATA, manejador);

        if (verbo === undefined || !VERBOS_MUTANTES.has(verbo)) {
          continue;
        }

        // `getAllAndOverride` acepta el decorador puesto en el método **o** en el controlador
        // entero: un controlador de administración puede declararlo una vez para todas sus rutas.
        const permiso = this.reflector.getAllAndOverride<unknown>(PERMISO_REQUERIDO, [
          manejador,
          controlador.constructor,
        ]);

        if (permiso !== undefined) {
          continue;
        }

        // Una ruta puede declararse pública **con su motivo escrito** (`@RutaPublica`). Un motivo
        // vacío no cuenta: la excusa tiene que poder leerse en la revisión.
        const razon = this.reflector.getAllAndOverride<unknown>(RUTA_PUBLICA, [
          manejador,
          controlador.constructor,
        ]);

        if (typeof razon === "string" && razon.trim().length > 0) {
          continue;
        }

        ofensoras.push(`${nombre}.${metodo}`);
      }
    }

    return ofensoras;
  }
}
