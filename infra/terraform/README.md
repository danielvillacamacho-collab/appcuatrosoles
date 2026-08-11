# Infraestructura del ambiente de desarrollo

Terraform para lo que describe [`docs/07`](../../docs/07-deployment-ec2.md) y detalla
[`docs/11`](../../docs/11-brief-infraestructura-dev.md): una EC2 con Docker Compose, Caddy con TLS
automático, PostgreSQL en un volumen aparte, y la tubería para que GitHub Actions despliegue sola.

## 1. Lo que Terraform NO hace

Dos cosas, y las dos son manuales porque AWS no las expone como recurso:

| | Por qué | Cuánto tarda |
|---|---|---|
| **Comprar `cuatrosoles.co`** | El registro de dominios no tiene recurso de Terraform. Se compra en `Route 53 → Registered domains` | minutos a 48 h |
| **Sacar SES del sandbox** | Es una solicitud con revisión humana | **1–2 días hábiles** |

**Empiecen por las dos.** Todo lo demás son minutos; estas dos no dependen de nosotros. El texto
exacto para la solicitud de SES está en `docs/11` §4.

> ⚠️ El dominio es **`cuatrosoles.co`** — *cuatro* con "o". Un dominio mal escrito no se devuelve.
> Que alguien lo lea en voz alta antes de pagar.

## 2. Requisitos

- Terraform >= 1.9
- Credenciales de AWS con permiso para crear EC2, IAM, Route 53, S3, DynamoDB y SES
- El dominio ya comprado, con su zona hospedada en Route 53 (la crea AWS sola al comprarlo)

## 3. Cómo se aplica, la primera vez

```bash
# Una sola vez: el bucket donde vive el estado (ver bootstrap/main.tf)
cd infra/terraform/bootstrap
terraform init
terraform apply

# Copiar el nombre del bucket que imprimió al bloque `backend` de ../providers.tf y descomentarlo.

cd ..
cp dev.tfvars.example dev.tfvars   # y poner el repositorio de GitHub
terraform init
terraform plan -var-file=dev.tfvars     # LEER EL PLAN antes de aplicar
terraform apply -var-file=dev.tfvars
```

Las veces siguientes son sólo `plan` y `apply`.

## 4. Qué crea

```
Route 53     dev.cuatrosoles.co  y  *.dev.cuatrosoles.co  → IP elástica
             + los 3 CNAME de DKIM y el MX/TXT del remitente

EC2          t3.small, Amazon Linux 2023, IMDSv2 obligatorio
             + volumen EBS aparte para PostgreSQL (con prevent_destroy)
             + IP elástica
             + grupo de seguridad: 443 y 80. Nada más.

IAM          rol de la instancia: Session Manager + Route 53 (certificados) + SES + S3
             rol de despliegue: OIDC de GitHub, sólo este repo y sólo main

S3           bucket de respaldos, privado, cifrado, expira a los 30 días
DLM          snapshot diario del volumen de datos, 7 días
SES          identidad del dominio con DKIM y remitente propio
```

## 5. Las decisiones que están dentro, y por qué

Cada una está comentada en su archivo. Las que más cuesta descubrir por las malas:

- **DNS comodín y certificado comodín** (`dns.tf`, `iam.tf`). Cada club entra por su subdominio
  (`ADR-013`). Let's Encrypt **no emite comodines validando por HTTP**, así que Caddy tiene que
  validar por DNS — de ahí el permiso de Route 53 en el rol de la instancia, y de ahí que la imagen
  de Caddy tenga que compilarse con su módulo (`docs/11` §7).
- **Sin puerto 22** (`compute.tf`). Se entra con Session Manager: sin puerto abierto, sin llave que
  perder, y con registro de quién entró.
- **Sin llaves de acceso en ningún lado** (`iam.tf`, `github-oidc.tf`). La aplicación saca sus
  credenciales del rol de la instancia y GitHub del OIDC. No hay un solo `ACCESS_KEY` que rotar.
- **`ignore_changes = [ami]`** (`compute.tf`). Amazon publica AMIs nuevas constantemente; sin esto,
  un `apply` cualquiera recrearía la instancia.
- **Montar el disco por UUID y no por `/dev/sdf`** (`user-data.sh`). En instancias Nitro el volumen
  aparece como `/dev/nvme1n1`, y el número depende del orden de conexión.

## 6. Cómo entrar a la instancia

```bash
aws ssm start-session --target $(terraform output -raw id_de_la_instancia)
```

No hace falta llave SSH ni tener el puerto 22 abierto.

## 7. Verificación

```bash
# El comodín resuelve
dig +short cualquiercosa.dev.cuatrosoles.co

# El certificado cubre el comodín
echo | openssl s_client -connect prueba.dev.cuatrosoles.co:443 \
  -servername prueba.dev.cuatrosoles.co 2>/dev/null | openssl x509 -noout -subject -dates

# La base de datos NO responde desde afuera — esto DEBE fallar
nc -zv -w 5 dev.cuatrosoles.co 5432

# El API responde
curl -s https://dev.cuatrosoles.co/api/health
```

El tercero es el que importa. Si responde, hay un problema de seguridad y no se sigue con nada más.
