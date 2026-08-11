import { Injectable } from "@nestjs/common";
import argon2 from "argon2";

/**
 * Parámetros de Argon2id (`docs/06` §2, riesgo de configuración de `plan.md` §7).
 *
 * **Se fijan explícitamente y no se dejan al default de la librería**: el default cambia entre
 * versiones, y un `pnpm update` no debería mover el costo de verificar una contraseña sin que
 * nadie lo decida.
 *
 * Los valores son los del perfil recomendado por OWASP para Argon2id (19 MiB, 2 iteraciones,
 * paralelismo 1) — el pensado para servidores modestos, que es lo que hay: una sola instancia en
 * EC2 (`docs/07`). Subir la memoria protege más contra descifrado por fuerza bruta, pero cada
 * verificación la reserva: veinte inicios de sesión simultáneos son veinte veces esa cifra. Con
 * 19 MiB son ~380 MiB en el peor caso, que la máquina aguanta.
 *
 * Cuándo revisarlos: en la primera auditoría externa (`docs/10` §4) y cada vez que cambie el
 * tamaño de la máquina. Están juntos y con este comentario para que esa revisión sea mirar un
 * archivo.
 */
const PARAMETROS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class PasswordService {
  async hash(contrasena: string): Promise<string> {
    return argon2.hash(contrasena, PARAMETROS);
  }

  /**
   * Verifica una contraseña contra su hash.
   *
   * **Nunca lanza.** Un hash corrupto, vacío o de otro algoritmo hace que `argon2.verify` lance, y
   * una excepción aquí saldría como `500` — distinguible desde afuera de un `401`, y por lo tanto
   * una forma de averiguar qué cuentas tienen contraseña utilizable. Las cuentas invitadas tienen
   * exactamente eso: un hash que no es un hash (ver `create-club.ts`). Se responde «no coincide».
   */
  async verificar(hash: string, contrasena: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, contrasena);
    } catch {
      return false;
    }
  }
}
