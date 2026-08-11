# 11 — Brief para el equipo de infraestructura: ambiente de desarrollo

> **Este documento se le pasa tal cual al equipo de infraestructura.** Está escrito para que alguien
> que no conoce el producto pueda ejecutarlo sin hacer preguntas de diseño.
>
> Alcance: **sólo el ambiente de desarrollo** y la tubería de despliegue automático. Producción se
> monta después, copiando esta misma receta cuando ya esté probada.
>
> **Casi todo esto ya está escrito como Terraform**, en [`infra/terraform/`](../infra/terraform/).
> Este documento explica el *por qué* de cada pieza y cubre lo que Terraform no puede hacer; el
> *cómo* está en el código. Si el equipo prefiere aplicar el Terraform y saltarse los pasos
> manuales, mejor — sólo quedan fuera comprar el dominio (§3) y sacar SES del sandbox (§4).

---

## ⚠️ Antes de gastar un peso: confirmar la ortografía del dominio

El dominio que hay que comprar es **`cuatrosoles.co`** — *cuatro* con "o", *soles* con "s".

Un dominio mal escrito no se devuelve y hay que volver a comprar. **Que alguien lo lea en voz alta
antes de pagar.**

---

## 1. Qué es esto, en cinco líneas

Plataforma web de gestión de un club de polo. Una aplicación web (React) y un API (NestJS) contra
PostgreSQL. Todo corre en **una sola instancia EC2 con Docker Compose** — es una decisión tomada y
documentada (`ADR-009`), no una limitación temporal: el producto lo opera una persona.

**Lo único que no es obvio:** cada club cliente entra por **su propio subdominio**
(`lospinos.cuatrosoles.co`, `otroclub.cuatrosoles.co`), y el servidor decide de qué club son los
datos leyendo ese subdominio. Eso tiene una consecuencia directa para ustedes: **hace falta DNS
comodín y certificado comodín**. Ver §4, que es la parte donde más fácil se pierde tiempo.

```
Una EC2 (t3.small) con Docker Compose:
├── caddy      → TLS automático + reverse proxy + sirve la web como archivos estáticos
├── api        → NestJS, puerto interno 3000, NO expuesto a internet
├── worker     → mismo build que api, procesa trabajos en segundo plano
└── postgres   → PostgreSQL 16, volumen EBS dedicado, NO expuesto a internet
```

---

## 2. Orden de ejecución

Está ordenado por **tiempo de espera**, no por dificultad. Las dos primeras tareas tienen demoras que
no dependen de nosotros: **arránquenlas el primer día aunque el resto quede para después.**

| # | Tarea | Espera | Bloquea |
|---|---|---|---|
| 1 | Comprar `cuatrosoles.co` | minutos–48 h | absolutamente todo |
| 2 | SES: verificar dominio y salir del sandbox | **1–2 días hábiles** | invitaciones por correo |
| 3 | Zona DNS y registros | minutos | el certificado |
| 4 | EC2, volumen y red | 1 hora | — |
| 5 | Caddy con certificado comodín | 1 hora | acceso por HTTPS |
| 6 | Rol IAM para el despliegue automático | 30 min | la tubería |
| 7 | S3 para respaldos | 30 min | los respaldos |

**Región para todo: `us-east-1` (Norte de Virginia).** Es la de menor latencia desde Colombia entre
las regiones completas de AWS, y donde SES tiene todo disponible. No mezclen regiones.

---

## 3. Tarea 1 — Dominio

Comprar **`cuatrosoles.co`** en **Route 53** (`Route 53 → Registered domains → Register domains`).

Se pide comprarlo en Route 53 y no en otro registrador por una razón concreta: el certificado
comodín se emite validando por DNS (§5), y teniendo el dominio en la misma cuenta de AWS eso es dar
un permiso IAM en vez de compartir credenciales de un proveedor externo.

Si por lo que sea el dominio termina en otro registrador, no es un problema: se delega la zona a
Route 53 (`NS` apuntando a los cuatro servidores de la zona hospedada) y todo lo demás es igual.

---

## 4. Tarea 2 — SES (empezar el primer día)

Amazon SES arranca **en modo sandbox**: sólo puede enviar correo a direcciones verificadas una por
una. Salir de ahí es un trámite con revisión humana de **1 a 2 días hábiles**, y sin eso la
plataforma no puede invitar a nadie que no esté en una lista.

1. `SES → Identities → Create identity → Domain`: `cuatrosoles.co`, con **DKIM activado**.
   SES entrega tres registros `CNAME`; si el dominio está en Route 53, hay un botón que los publica
   solo.
2. `SES → Account dashboard → Request production access`. En el formulario:
   - **Tipo**: transaccional.
   - **Caso de uso** (se puede copiar tal cual):
     > Plataforma de gestión para clubes deportivos. Los correos son transaccionales y
     > disparados por acciones del propio usuario: invitación a crear la cuenta, restablecimiento de
     > contraseña, confirmación de cambio de correo y avisos de seguridad sobre la propia cuenta. No
     > hay envíos de mercadeo ni listas de distribución. Los destinatarios son miembros registrados
     > del club que administra cada cliente.
   - **Volumen estimado**: menos de 500 correos al mes al inicio.
   - **Manejo de rebotes**: la aplicación registra los rebotes y no reintenta contra una dirección
     que rebotó de forma permanente.
3. Crear un usuario IAM **sólo para SES**, con esta política y nada más:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ses:SendEmail", "ses:SendRawEmail"],
    "Resource": "*"
  }]
}
```

---

## 5. Tarea 3 — DNS

En la zona hospedada de `cuatrosoles.co`, para el ambiente de desarrollo:

| Nombre | Tipo | Valor |
|---|---|---|
| `dev.cuatrosoles.co` | `A` | IP elástica de la EC2 |
| `*.dev.cuatrosoles.co` | `A` | la misma IP elástica |

**El registro comodín (`*`) no es opcional.** Cada club cliente es un subdominio propio bajo
`dev`: `lospinos.dev.cuatrosoles.co`, `pruebas.dev.cuatrosoles.co`. Sin el comodín habría que crear
un registro DNS a mano cada vez que se da de alta un club, que es exactamente lo que el producto
está diseñado para no necesitar.

**Usen una IP elástica**, no la IP pública que AWS asigna sola: esa cambia cada vez que la instancia
se detiene y arranca, y el DNS quedaría apuntando a la nada.

---

## 6. Tarea 4 — EC2, volumen y red

- **Instancia**: `t3.small` (2 vCPU, 2 GB). Amazon Linux 2023 o Ubuntu 22.04, cualquiera.
- **Disco raíz**: 30 GB `gp3`.
- **Volumen de datos**: EBS `gp3` **aparte**, 20 GB, montado en `/var/lib/postgresql`.
  Va separado del disco raíz a propósito: permite recrear la instancia sin tocar los datos, y los
  respaldos automáticos del volumen son independientes de los de la aplicación.
- **IP elástica** asociada.
- **Software**: Docker y el plugin `docker compose`.

### Grupo de seguridad

| Puerto | Origen | Para qué |
|---|---|---|
| 443 | `0.0.0.0/0` | la aplicación |
| 80 | `0.0.0.0/0` | redirección a HTTPS y validación de certificados |

**Y nada más. En particular:**

- **El puerto 5432 (PostgreSQL) no se abre a internet. Nunca, ni "temporalmente para probar".**
- **Preferimos no abrir el 22.** Para entrar a la instancia, usen **AWS Systems Manager Session
  Manager** (`ssm:StartSession`): no necesita puerto abierto, no necesita llave SSH que se pueda
  perder, y deja registro de quién entró. Si aun así abren el 22, que sea restringido a una IP fija,
  jamás a `0.0.0.0/0`.

---

## 7. Tarea 5 — Caddy y el certificado comodín

**Esta es la parte donde se pierde tiempo si no se lee antes.**

Let's Encrypt **no emite certificados comodín por validación HTTP**. Como necesitamos
`*.dev.cuatrosoles.co`, hay que validar **por DNS**, y para eso Caddy tiene que poder escribir
registros en Route 53.

Dos consecuencias prácticas:

1. **La imagen oficial de Caddy no sirve tal cual**: no trae el módulo de Route 53. Hay que armar
   una imagen con `xcaddy`. Es un `Dockerfile` de cuatro líneas:

```dockerfile
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/route53

FROM caddy:2
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
```

2. **La instancia necesita permiso para escribir en la zona DNS.** Un rol de instancia con esta
   política, reemplazando `<ID_DE_LA_ZONA>`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["route53:GetChange"],
      "Resource": "arn:aws:route53:::change/*"
    },
    {
      "Effect": "Allow",
      "Action": ["route53:ChangeResourceRecordSets", "route53:ListResourceRecordSets"],
      "Resource": "arn:aws:route53:::hostedzone/<ID_DE_LA_ZONA>"
    },
    {
      "Effect": "Allow",
      "Action": ["route53:ListHostedZonesByName"],
      "Resource": "*"
    }
  ]
}
```

El `Caddyfile` lo entregamos nosotros; ustedes sólo necesitan que la imagen tenga el módulo y que el
rol tenga el permiso.

> **Alternativa**, si el certificado comodín se complica: Caddy sabe emitir un certificado por
> host la primera vez que alguien lo visita (*on-demand TLS*), sin comodín. Es más elegante para
> multi-cliente pero necesita un endpoint de validación que todavía no existe en el API. Para el
> ambiente de desarrollo, el comodín es más simple. Si van por ahí, avísennos y lo construimos.

---

## 8. Tarea 6 — Despliegue automático desde GitHub

El código vive en GitHub y ya tiene su pipeline escrito. Para que pueda desplegar solo:

**Usar OIDC, no llaves de acceso.** Se crea un proveedor de identidad OIDC para
`token.actions.githubusercontent.com` y un rol que GitHub Actions asume durante el despliegue. Es el
mecanismo recomendado por AWS y evita tener credenciales de larga vida guardadas en GitHub — que es
el error más común y el más caro.

El rol necesita, como mínimo:

- `ssm:StartSession` / `ssm:SendCommand` sobre la instancia (para ejecutar el despliegue).
- Lectura del repositorio de imágenes de contenedor, si usamos ECR (ver §11).

Restrinjan la confianza del rol al repositorio y a la rama `main`:

```json
"Condition": {
  "StringLike": {
    "token.actions.githubusercontent.com:sub": "repo:<ORG>/<REPO>:ref:refs/heads/main"
  }
}
```

---

## 9. Tarea 7 — S3 para respaldos

Un bucket, `cuatrosoles-backups-dev`:

- **Bloqueo de acceso público activado** (los cuatro interruptores).
- Cifrado en reposo (SSE-S3 alcanza).
- Regla de ciclo de vida: borrar objetos a los **30 días**.
- Versionado activado.

Y un usuario IAM que sólo pueda escribir ahí (`s3:PutObject`, `s3:GetObject`, `s3:ListBucket` sobre
ese bucket y nada más).

Además: **snapshots diarios automáticos del volumen EBS de datos** (AWS Backup o Data Lifecycle
Manager, 7 días de retención). Son dos mecanismos independientes a propósito — si el respaldo de la
base falla en silencio, el snapshot del volumen sigue estando.

---

## 10. Lo que necesitamos que nos devuelvan

Cuando terminen, mándennos esta lista llena. Con eso conectamos la aplicación:

```
REGION                    = us-east-1
DOMINIO_DEV               = dev.cuatrosoles.co
IP_ELASTICA               =
ID_INSTANCIA              = i-...
ID_ZONA_ROUTE53           = Z...
SES_ACCESS_KEY_ID         =
SES_SECRET_ACCESS_KEY     =
SES_ESTADO_SANDBOX        = (pendiente / aprobado, con fecha)
S3_BUCKET                 = cuatrosoles-backups-dev
S3_ACCESS_KEY_ID          =
S3_SECRET_ACCESS_KEY      =
ROL_OIDC_GITHUB           = arn:aws:iam::...:role/...
COMO_ENTRAR_A_LA_INSTANCIA= (Session Manager / SSH con qué llave)
```

**Los secretos no se mandan por WhatsApp ni por correo.** Un gestor de contraseñas compartido, o los
dejan directamente en `GitHub → Settings → Secrets` y nos avisan.

---

## 11. Decisiones que ya están tomadas — no hace falta discutirlas

Están todas documentadas con su motivo; si algo les parece mal, díganlo y lo revisamos, pero **no
las cambien por su cuenta**:

- **Sin RDS por ahora** (`ADR-009`). La aplicación sólo conoce una `DATABASE_URL`, así que mudarse a
  RDS el día que haga falta es cambiar una variable, no rediseñar.
- **Sin Redis** (`ADR-012`). Las colas van sobre PostgreSQL.
- **Sin Kubernetes, sin ECS, sin balanceador.** Una instancia. El producto lo opera una persona
  (`ADR-009`, `docs/10`).
- **Una sola instancia para todo el ambiente de desarrollo**, incluida la base de datos.
- **Las variables de entorno viven en un archivo en la instancia**, con permisos restringidos, fuera
  del repositorio. Nunca en el repositorio, ni siquiera un momento.

Lo que sí está abierto y agradecemos que opinen: si prefieren ECR para las imágenes o construirlas
en la instancia. Nos da igual y ustedes saben mejor qué mantienen más cómodo.

---

## 12. Cómo sabemos que quedó bien

Nosotros verificamos esto cuando nos entreguen. Lo listamos para que puedan comprobarlo antes:

```bash
# 1. El comodín resuelve a la IP elástica
dig +short cualquiercosa.dev.cuatrosoles.co

# 2. El certificado cubre el comodín y es válido
echo | openssl s_client -connect prueba.dev.cuatrosoles.co:443 -servername prueba.dev.cuatrosoles.co 2>/dev/null \
  | openssl x509 -noout -subject -dates

# 3. La base de datos NO responde desde afuera (esto DEBE fallar)
nc -zv -w 5 dev.cuatrosoles.co 5432

# 4. El API responde por HTTPS
curl -s https://dev.cuatrosoles.co/api/health
# esperado: {"status":"ok"}
```

El punto 3 es el más importante de los cuatro. Si responde, hay un problema de seguridad y no se
sigue con nada más hasta arreglarlo.
