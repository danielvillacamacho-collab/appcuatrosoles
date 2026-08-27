# 07 — Despliegue: una EC2, Docker Compose, Caddy

Consecuencia de `ADR-009`. Una sola instancia, operable por una persona sin equipo de
infraestructura (D-04). Todo lo que sigue está escrito para poder ejecutarse siguiendo la
receta, sin decisiones de diseño pendientes en el momento del despliegue.

## 1. Qué corre en la instancia

```
infra/docker-compose.prod.yml:
├── caddy      # TLS automático, reverse proxy, y la SPA compilada DENTRO de la imagen
├── api        # NestJS, puerto interno 3000
└── postgres   # PostgreSQL 16, sobre el volumen EBS dedicado
```

> **No hay servicio `worker` todavía.** Lo hubo declarado en el compose, corriendo un
> `dist/worker.js` que **nunca existió**: la bandeja de salida la vacía hoy un temporizador dentro
> del propio proceso del API (`OutboxScheduler`). El worker aparte entra con `pg-boss` (`ADR-012`).
> Un servicio declarado que no puede arrancar es un contenedor reiniciándose en bucle y un
> despliegue que parece roto.

> **La SPA va dentro de la imagen de Caddy**, no en un volumen del servidor. Así el frontend es un
> artefacto único y con versión: desplegar es cambiar una etiqueta y volver atrás es cambiarla de
> vuelta. Con un volumen, el HTML y el JavaScript pueden quedar de versiones distintas a mitad de
> una copia — una pantalla en blanco que nadie sabe explicar.

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
- **Dominio**: `cuatrosoles.co` (decidido 2026-08-11, `docs/09` T-04). El ambiente de desarrollo
  vive bajo `*.dev.cuatrosoles.co`. Las instrucciones para montarlo están en
  `docs/11-brief-infraestructura-dev.md`, escritas para pasárselas a un equipo de infraestructura.
- **Certificado comodín**: el club se resuelve por subdominio (`ADR-013`), así que hace falta un
  certificado para `*.dev.cuatrosoles.co`. Let's Encrypt **no emite comodines por validación HTTP**:
  hay que validar por DNS, lo que obliga a compilar Caddy con el módulo de Route 53 y a darle a la
  instancia permiso para escribir en la zona. Es el detalle que más tiempo hace perder si se
  descubre en el momento del despliegue (`docs/11` §7).

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
BASE_DOMAIN=            # el mismo valor que recibe Caddy, o el API responde 404 a todo
MAILER=ses              # obligatorio en producción; ver abajo
MAIL_FROM=              # dirección del dominio verificado en SES
AWS_REGION=us-east-1
S3_BUCKET=
SENTRY_DSN=
WOMPI_PUBLIC_KEY=       # pendiente Q-02b
WOMPI_PRIVATE_KEY=      # pendiente Q-02b
WOMPI_EVENTS_SECRET=    # pendiente Q-02b
```

**No hay llaves de AWS en esta lista, y no es un olvido.** La instancia lleva un rol IAM
(`infra/terraform/iam.tf`) con `ses:SendEmail` restringido a `*@<dominio>` y acceso al bucket de
respaldos. El SDK las toma de ahí por la cadena de credenciales por defecto. Llaves de larga vida
en un archivo hay que rotarlas, se filtran en un log y sobreviven a la instancia que las
necesitaba. Si alguien las agrega «para probar», está empeorando la seguridad, no acelerando nada.

**`MAILER` es obligatoria en producción y la aplicación no arranca sin ella.** Es deliberado:
`ses` envía de verdad, `file` escribe los correos a disco. Omitirla es lo que hizo que el primer
despliegue no enviara ninguna invitación —SES estaba productivo y la instancia tenía permiso, pero
la aplicación nunca lo llamaba— sin que nada avisara. Un servidor que responde y se come los
correos es peor que uno que no levanta, porque nadie se entera. Ver
`apps/api/src/common/mailer/mailer.selection.ts`.

### El rol de aplicación de menor privilegio (T-007)

El API **no se conecta como dueño de las tablas**. Se conecta con `polo_app`, que puede leer y
escribir lo normal y **no puede**: crear o alterar tablas, borrar disparadores, ni modificar
`audit_log` ni `handicap_history`.

Son dos capas independientes sobre esas dos tablas, y conviene entender por qué hacen falta las
dos: **un disparador para el dueño, y los permisos para la aplicación.** En PostgreSQL el dueño de
una tabla se salta toda comprobación de permisos, así que un `REVOKE` contra él no hace nada; y un
disparador se puede borrar, si quien está conectado tiene con qué. Cada capa cubre el agujero de la
otra.

**Cómo se activa en una instancia que ya está andando.** El orden importa: primero existe el rol,
después se apunta el API a él.

```bash
# 1. Elegir una clave y ponerla en /srv/cuatrosoles/.env
APP_DB_PASSWORD=<clave-nueva>
DATABASE_URL_ADMIN=postgresql://polo:<clave-del-dueño>@postgres:5432/polo_dev

# 2. Desplegar. El despliegue aplica la migración que crea el rol y le pone esa clave.
./infra/start-services.sh <tag> dev
# Tiene que decir: ✅ Rol polo_app listo

# 3. Recién ahora, apuntar el API al rol nuevo — misma base, otro usuario:
DATABASE_URL=postgresql://polo_app:<clave-nueva>@postgres:5432/polo_dev

# 4. Reiniciar sólo el API y comprobar que quedó conectado como polo_app
docker compose restart api
docker compose exec -T postgres psql -U polo -d polo_dev \
  -c "SELECT usename, count(*) FROM pg_stat_activity WHERE datname='polo_dev' GROUP BY usename"
```

El último comando es la verificación: tiene que aparecer `polo_app`. Si sólo aparece el dueño, el
API no tomó la variable y **el cambio no surtió efecto** — que es exactamente el caso en que uno
cree que está protegido y no lo está.

**Si algo sale mal**, volver atrás es cambiar `DATABASE_URL` al dueño y reiniciar el API. El rol y
sus permisos quedan; no estorban a nadie.

---

## 5. Backups

**Cómo está montado** (`infra/backup-db.sh` + `respaldo-db.timer`, instalado por `user-data.sh`):

| | |
|---|---|
| Cuándo | 08:20 UTC (3:20 a.m. en Bogotá), una hora después del snapshot de EBS para no competir por el disco |
| Qué hace | `pg_dump --clean --if-exists` comprimido, subido a `s3://<bucket>/<entorno>/<fecha>.sql.gz` |
| Cifrado | Del lado del servidor (AES256 en el bucket) y en tránsito por HTTPS. **No se cifra a mano**: una clave más que administrar es una clave más que perder el día de la restauración |
| Si falla | El servicio termina con error y queda en `journalctl -u respaldo-db`. `Persistent=true` recupera el que se saltó si la instancia estuvo apagada |

**El script se niega a subir un volcado sospechoso**, y ésa es la parte que lo convierte en un
respaldo en vez de un archivo: comprueba que pese más de 20 KB, que el `gzip` esté íntegro, y que
adentro haya de verdad un volcado de PostgreSQL. Un `pg_dump` que falla a mitad de camino deja un
archivo corto y perfectamente subible; sin esos tres controles, el día de la restauración se
descubre que hace meses se están guardando ceros.

### Cómo se restaura

```bash
# 1. Ver qué hay
aws s3 ls "s3://$BUCKET_DE_RESPALDOS/dev/" | tail -5

# 2. Traerlo
aws s3 cp "s3://$BUCKET_DE_RESPALDOS/dev/2026-08-21T08-20-00Z.sql.gz" /tmp/respaldo.sql.gz

# 3. Restaurar. `--clean --if-exists` ya viene dentro del volcado: se puede aplicar sobre una base
#    que ya tiene datos, y eso es justamente el caso real de una restauración.
gzip -dc /tmp/respaldo.sql.gz | \
  docker compose -f /srv/cuatrosoles/docker-compose.yml exec -T postgres \
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB"
```

> **Restaurar sobre la base de producción reemplaza lo que hay.** Para la prueba mensual se levanta
> un PostgreSQL aparte —`docker run --rm -p 5433:5432 postgres:16`— y se restaura ahí.

---

- `pg_dump` cifrado, diario, subido a S3, retención 30 días.
- Snapshot diario de EBS como segunda capa (recupera el volumen completo si `pg_dump` mismo
  falló silenciosamente).
- **Restauración probada mensualmente** (`ADR-009`, `docs/10` §5 — primer lunes del mes): se
  restaura el backup en una instancia efímera y se verifica que los datos están. Un backup
  no verificado no es un backup — es una suposición.

## 6. CI/CD

Dos workflows, y la separación es a propósito.

**`ci.yml` — la calidad.** En cada push y cada PR: `lint`, `typecheck`, `test:cov`, `check:arch`,
`check:isolation`, los tests de integración con Testcontainers, los E2E de navegador, y el ciclo
`up → down → up` de la última migración contra un Postgres real.

**`deploy.yml` — publicar las imágenes.** En cada push a `main`, construye el API y Caddy (con la
SPA adentro) y las publica en **GHCR**, etiquetadas con el sha del commit y como `latest`.

### Por qué GHCR y no ECR

Publicar en ECR exige credenciales de AWS en el workflow — el rol OIDC de `docs/11` §8, que todavía
no existe. GHCR usa el token que el propio GitHub Actions genera para cada corrida: **publicar deja
de depender de AWS**. Una pieza menos en el camino crítico, y ninguna credencial de larga vida
guardada en ninguna parte.

`infra/deploy-to-ecr.sh` se conserva: si algún día hay que volver a ECR, el camino está escrito.

### La instancia va a buscar; nadie le empuja

**El paso final también es automático, y sin AWS de por medio.** La forma «normal» —que GitHub
Actions empuje el despliegue— necesita `ssm:SendCommand`, que necesita el rol OIDC, que hay que
pedirle al equipo de infraestructura y esperar. Se hace al revés: un temporizador en la instancia
mira cada cinco minutos si hay una versión nueva de `latest` y se despliega solo.

La instancia sólo necesita lo que ya tiene: entrar a GHCR y bajar una imagen. **Ningún permiso de
AWS, ninguna credencial de larga vida, y nadie a quien esperar.**

Dos cosas hacen que esto sea seguro y no una ruleta:

- **`latest` sólo se mueve cuando CI pasó.** `deploy.yml` se dispara *después* de CI y sólo si
  terminó en verde, así que un commit con los tests en rojo no llega nunca al ambiente donde el club
  está probando.
- **Revierte solo.** Si el API no responde después de cambiar, `auto-desplegar.sh` vuelve a la
  versión anterior sin esperar a que alguien mire, y sale con error para que quede registrado. Es la
  diferencia entre un despliegue desatendido y una apuesta.

Ningún gate se desactiva para que un despliegue urgente pase (`CLAUDE.md` regla de oro 12,
`docs/10` §6 — "nunca desactivar un gate de CI para sacar algo urgente").

## 6b. Desplegar, paso a paso

**Una vez**, para que la instancia pueda bajar imágenes de GHCR. En `/srv/cuatrosoles/.env`:

```
REGISTRO=ghcr.io/<propietario-del-repo>
```

Y entrar al registro con un token de GitHub de sólo lectura de paquetes (`read:packages`):

```bash
echo "<TOKEN>" | sudo -u ec2-user docker login ghcr.io -u <usuario-de-github> --password-stdin
```

> El token queda en `~/.docker/config.json` de la instancia. Es de **sólo lectura de paquetes** a
> propósito: si se filtrara, lo peor que permite es bajar imágenes, no publicarlas.

Y el despliegue automático, una sola vez:

```bash
sudo bash /data/appcuatrosoles/infra/instalar-auto-despliegue.sh
```

> **El `docker login` tiene que hacerlo el usuario del servicio, no `root`.** Entrar con `sudo` deja
> las credenciales en `/root/.docker/config.json`, el temporizador corre como `ec2-user`, y el
> primer despliegue automático falla con «unauthorized» a los cinco minutos, cuando ya no hay nadie
> mirando. El instalador lo comprueba antes de instalar nada y se niega si está mal.

**Cada vez** — sólo si hace falta desplegar a mano una versión concreta; normalmente no hace falta,
porque el temporizador ya lo hizo:

```bash
cd /srv/cuatrosoles && IMAGE_TAG=<sha> ./desplegar.sh
```

`desplegar.sh` baja las imágenes, escribe el `IMAGE_TAG` en `.env` **sólo si el `pull` funcionó**,
reinicia, **aplica las migraciones pendientes**, y espera a que `/api/health` responda. Si algo
falla, dice con qué etiqueta volver.

**Las migraciones corren en cada despliegue, no sólo al arrancar la instancia.** `migrate deploy` es
idempotente —sin nada pendiente no hace nada— y correrlo siempre quita la peor sorpresa posible:
código nuevo pidiéndole a la base una tabla que no existe, con errores 500 y ninguna pista. Corren
con el rol **dueño** de las tablas (T-007), no con el de la aplicación, que no puede alterarlas.

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
