# 07 — Despliegue: una EC2, Docker Compose, Caddy

Consecuencia de `ADR-009`. Una sola instancia, operable por una persona sin equipo de
infraestructura (D-04). Todo lo que sigue está escrito para poder ejecutarse siguiendo la
receta, sin decisiones de diseño pendientes en el momento del despliegue.

## 1. Qué corre en la instancia

```
docker compose services:
├── caddy      # TLS automático, reverse proxy, sirve apps/web como estáticos
├── api        # NestJS, puerto interno 3000
├── worker     # procesa jobs de pg-boss, mismo build que api, entrypoint distinto
└── postgres   # PostgreSQL 16, volumen EBS dedicado
```

Sin Redis (`ADR-012`). Sin RDS por ahora (`ADR-009`) — la aplicación sólo conoce una
`DATABASE_URL`, así que migrar a RDS el día que la plataforma cobre dinero real de terceros
es cambiar una variable de entorno, no un rediseño.

## 2. Tamaño e infraestructura AWS

- **Instancia**: `t3.small` para arrancar (2 vCPU, 2 GB RAM) — suficiente para el cliente
  cero. Se escala verticalmente primero (más simple que escalar horizontalmente con estado en
  contenedor); escalar horizontalmente sólo si `apps/api` deja de ser stateful respecto a
  sesión, lo cual hoy no es el caso (`ADR-005`).
- **Volumen**: EBS dedicado para el volumen de datos de Postgres, con snapshots diarios
  automáticos de EBS además del `pg_dump` (dos mecanismos de respaldo independientes).
- **Red**: Security Group abre sólo 80/443 al público y 22 restringido a la IP de quien
  administra. Sin puertos de base de datos expuestos a internet, nunca.
- **Cuenta AWS**: ya existe (confirmado 2026-08-10). Falta: región definitiva, IAM del
  usuario/rol que despliega, y salir del sandbox de SES (`ADR-008` — trámite de 1-2 días, se
  hace en la semana 1, no al final).
- **Dominio**: pendiente (`docs/09` T-04). Bloquea el despliegue público, no el desarrollo —
  Caddy puede servir localmente y en staging con un dominio temporal o IP mientras se resuelve.

## 3. Caddy

Certificados TLS automáticos sin certbot ni cron de renovación (`ADR-009`). Un `Caddyfile`
mínimo por entorno:

```
lospinos.<dominio> {
  reverse_proxy /api/* api:3000
  root * /srv/web
  file_server
  try_files {path} /index.html   # SPA fallback
}
```

Cuando exista más de un club con subdominio propio (`specs/140`), Caddy resuelve el
certificado por host automáticamente sin configuración adicional por cliente.

## 4. Variables de entorno y secretos

**Nunca en el repositorio, ni siquiera temporalmente** (`docs/10` §8). Viven en un archivo
`.env` en la instancia, fuera de control de versiones, con permisos restringidos al usuario
que corre Docker. Mínimo necesario:

```
DATABASE_URL=
SESSION_SECRET=
WOMPI_PUBLIC_KEY=       # pendiente Q-02b
WOMPI_PRIVATE_KEY=      # pendiente Q-02b
WOMPI_EVENTS_SECRET=    # pendiente Q-02b
SES_ACCESS_KEY_ID=
SES_SECRET_ACCESS_KEY=
SES_REGION=
SENTRY_DSN=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
```

## 5. Backups

- `pg_dump` cifrado, diario, subido a S3, retención 30 días.
- Snapshot diario de EBS como segunda capa (recupera el volumen completo si `pg_dump` mismo
  falló silenciosamente).
- **Restauración probada mensualmente** (`ADR-009`, `docs/10` §5 — primer lunes del mes): se
  restaura el backup en una instancia efímera y se verifica que los datos están. Un backup
  no verificado no es un backup — es una suposición.

## 6. CI/CD

GitHub Actions:

```
on: push a main
1. install (pnpm) → lint → typecheck → test:cov → check:arch → check:isolation
2. build de apps/api, apps/worker, apps/web
3. migración: aplica `up` contra Postgres real de CI, luego `down`, luego `up` otra vez
4. si todo pasa: build y push de imágenes; despliegue por SSH a la EC2
   (docker compose pull && docker compose up -d, migración real aplicada antes del swap)
```

Ningún gate se desactiva para que un despliegue urgente pase (`CLAUDE.md` regla de oro 12,
`docs/10` §6 — "nunca desactivar un gate de CI para sacar algo urgente").

## 7. Rollback

```
./infra/rollback.sh <tag-anterior>
```

Vuelve a la imagen anterior en menos de dos minutos (`docs/10` §6). Es el primer paso ante
cualquier incidente, **antes** del diagnóstico — diagnosticar con el sistema roto en
producción no ayuda a nadie que esté usándolo en ese momento.

## 8. Observabilidad

- **Logs**: Pino en formato JSON, con `requestId` en cada línea — el mismo que ve el usuario
  en un mensaje de error (`docs/03` §2).
- **Errores**: Sentry, con el `requestId` como tag para poder ir del reclamo a la traza
  exacta (`docs/10` §6 punto 3).
- **Salud**: `/api/health` (el proceso responde) y `/api/ready` (además, la base de datos
  responde). Un fallo de `ready` es la primera pista de un incidente de datos/disco.

## 9. Entornos

| Entorno | Propósito | Datos |
|---|---|---|
| Local | desarrollo con `pnpm dev` | Postgres en Docker local, `pnpm db:seed` |
| Staging | demo al club antes de cada fase, uso real de Daniel desde su celular cada viernes | copia sanitizada o seed extendido, nunca datos reales de personas sin anonimizar |
| Producción | Los Pinos / Cuatro Soles | datos reales |

Nunca se prueba una migración nueva directamente en producción — siempre primero contra
staging con el mismo Postgres 16 y las mismas extensiones.
