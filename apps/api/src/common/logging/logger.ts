import pino from "pino";

/**
 * Logger único del proceso (`docs/07` §9). Escribe JSON a stdout: en EC2 lo recoge journald, y
 * cada línea trae el `requestId` con el que se busca una traza completa.
 *
 * `redact` no es decorativo: un log con la cookie de sesión de alguien es una sesión robada por el
 * canal más aburrido posible, y una contraseña en texto en el journal es un incidente de datos
 * personales (`docs/06` §5). Se prefiere prohibir campos por nombre a confiar en que nadie los
 * loguee por accidente.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "*.password",
      "*.passwordHash",
      "*.token",
    ],
    censor: "[oculto]",
  },
});
