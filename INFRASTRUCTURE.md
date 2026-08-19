# 🏗️ Infraestructura - Índice Completo

**Bienvenido a la documentación de infraestructura de Cuatro Soles**

Esta es tu puerta de entrada a toda la información sobre cómo está construida la infraestructura, cómo desplegarla y cómo mantenerla.

---

## 📚 Documentos por Caso de Uso

### 🚀 Voy a desplegar por primera vez
**Tiempo estimado:** 1-2 horas

1. **Empezar aquí:** [INFRA_SUMMARY.md](./INFRA_SUMMARY.md) — Lee el resumen (5 min)
2. **Guía paso a paso:** [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) — Sigue FASE 1-6
3. **Si algo falla:** [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) § Troubleshooting
4. **Verificar seguridad:** [TERRAFORM_REVIEW.md](./TERRAFORM_REVIEW.md) — Usa la matriz de cumplimiento

---

### ⚙️ Necesito cambiar algo (escalar, agregar variables, etc)
**Tiempo estimado:** 10-30 minutos

1. **Entender cambios posibles:** [INFRA_SUMMARY.md](./INFRA_SUMMARY.md) § Configuración Actual
2. **Comandos a usar:** [TERRAFORM_COMMANDS.md](./TERRAFORM_COMMANDS.md) § Tareas Comunes
3. **Plan y aplica:**
   ```bash
   terraform plan -var="tu_cambio=nuevo_valor"
   terraform apply
   ```
4. **Validar cambios:**
   ```bash
   terraform output
   aws ec2 describe-instances ...
   ```

---

### 🔒 Quiero entender la seguridad
**Tiempo estimado:** 15 minutos

1. **Overview:** [INFRA_SUMMARY.md](./INFRA_SUMMARY.md) § Capas de Seguridad
2. **Análisis profundo:** [TERRAFORM_REVIEW.md](./TERRAFORM_REVIEW.md) § Análisis de Seguridad
3. **Verificar en AWS:** [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) § FASE 5 (validación)

---

### 🐛 Algo no funciona (error en apply, DNS no resuelve, etc)
**Tiempo estimado:** 10-20 minutos

1. **Troubleshooting:** [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) § Troubleshooting
2. **Comandos de debug:** [TERRAFORM_COMMANDS.md](./TERRAFORM_COMMANDS.md) § Debugging
3. **Logs detallados:**
   ```bash
   TF_LOG=DEBUG terraform plan
   ```

---

### 💡 Necesito un comando rápido
**Tiempo estimado:** 2 minutos

→ [TERRAFORM_COMMANDS.md](./TERRAFORM_COMMANDS.md) — Cheatsheet de comandos frecuentes

---

## 📋 Estructura de Documentos

```
appcuatrosoles/
├── INFRASTRUCTURE.md           ← Estás aquí (índice)
├── INFRA_SUMMARY.md            ← Resumen visual (1 página)
├── DEPLOYMENT_GUIDE.md         ← Guía completa de despliegue
├── TERRAFORM_REVIEW.md         ← Auditoría de seguridad
├── TERRAFORM_COMMANDS.md       ← Referencia de comandos
└── infra/
    └── terraform/
        ├── *.tf files          ← Código Terraform
        └── bootstrap/          ← Primeros pasos (una sola vez)
```

---

## 🎯 Documentos por Rol

### 👨‍💼 DevOps / SRE
```
Prioridad: ALTA
Leer:
  1. INFRA_SUMMARY.md (30 min)
  2. TERRAFORM_REVIEW.md (completo, 30 min)
  3. DEPLOYMENT_GUIDE.md (completo, 1 hora)
  4. infra/terraform/*.tf (código, variable)

Domina:
  - TERRAFORM_COMMANDS.md (todos los comandos)
  - AWS Console (EC2, Route53, SES, S3, IAM)
  - terraform validate, plan, apply, destroy
```

### 👨‍💻 Backend / Full Stack
```
Prioridad: MEDIA
Leer:
  1. INFRA_SUMMARY.md (10 min)
  2. DEPLOYMENT_GUIDE.md § FASE 5-6 (post-despliegue, 20 min)
  3. TERRAFORM_COMMANDS.md § Debugging (para troubleshooting, 10 min)

Necesita saber:
  - Cómo conectar por Session Manager (no SSH)
  - Dónde está la BD (volumen /data)
  - Cómo ver logs de la app (en la instancia)
```

### 🎨 Frontend
```
Prioridad: BAJA
Leer:
  1. INFRA_SUMMARY.md § En Una Página (2 min)
  2. Arquitectura visual (entender flujo)

Necesita saber:
  - Dominio: dev.cuatrosoles.co
  - SES está disponible para correos
```

### 🔐 Security / Compliance
```
Prioridad: ALTA
Leer:
  1. TERRAFORM_REVIEW.md (análisis completo)
  2. INFRA_SUMMARY.md § Capas de Seguridad
  3. infra/terraform/iam.tf (permisos)

Auditar:
  - IMDSv2 obligatorio ✓
  - Sin SSH abierto ✓
  - Credenciales temporales (roles IAM) ✓
  - Encriptación en reposo (EBS, S3) ✓
  - Mínimo privilegio en policies ✓
```

---

## 🗺️ Mapa Mental de la Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                      USUARIO FINAL                           │
│              (Cliente accede a app)                           │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTPS (puerto 443)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  AWS SECURITY GROUP                          │
│   (Permite 80, 443 | Bloquea 22 SSH, 5432 PostgreSQL)       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  EC2 INSTANCE (t3.small)                     │
│           cuatrosoles-dev (30 GB root disk)                  │
│                                                              │
│  Dentro corre:                                               │
│  • Docker (Caddy reverse proxy + API)                       │
│  • Docker (PostgreSQL)                                       │
│  • Sistema operativo (Amazon Linux 2023)                    │
│                                                              │
│  Acceso:                                                     │
│  • No SSH (puerto 22 bloqueado)                             │
│  • Session Manager (AWS Systems Manager)                     │
│                                                              │
│  Credenciales:                                               │
│  • Rol IAM: ec2 → SES + S3 + Route53                        │
│  • Sin API keys hardcodeadas                                │
│                                                              │
│  ┌──────────────────────────────────────┐                   │
│  │   EBS VOLUME (/data)                 │                   │
│  │   20 GB, gp3, encriptado             │                   │
│  │   prevent_destroy = true             │                   │
│  │   Datos: PostgreSQL persiste aquí    │                   │
│  │   Snapshots diarios (7 días retiene) │                   │
│  └──────────────────────────────────────┘                   │
│                                                              │
│  Respaldos:                                                  │
│  • pg_dump automático → S3 (30 días)                        │
│  • EBS snapshots automáticos (7 días)                       │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
    ┌───────┐   ┌────────┐   ┌──────────┐
    │Route53│   │SES     │   │S3 Bucket │
    │DNS    │   │Email   │   │Respaldos │
    └───────┘   └────────┘   └──────────┘
       (2          (DKIM,        (versionado,
     registros)    SPF)          privado)
```

---

## 🔄 Flujos de Trabajo Típicos

### Despliegue Inicial
```
1. terraform validate
2. terraform plan -out=tfplan
3. terraform apply tfplan
4. Esperar ~5 min
5. terraform output (guardar IPs)
6. Verificar: aws ec2 describe-instances
7. Verificar DNS: nslookup dev.cuatrosoles.co
```
**Duración:** 10-15 minutos

---

### Cambio de Tamaño de Instancia
```
1. Editar: tipo_de_instancia = "t3.medium" en terraform.tfvars
2. terraform plan (verá "will be replaced")
3. terraform apply
4. Esperar ~5 min (EC2 recreada)
5. Verificar: Aplicación sigue corriendo
```
**Duración:** 10 minutos  
**Downtime:** ~2-3 minutos

---

### Aumentar Almacenamiento
```
1. Editar: disco_de_datos_gb = 50 en terraform.tfvars
2. terraform plan (verá nuevo volumen)
3. terraform apply
4. Dentro de instancia: aumentar volumen con resize2fs
```
**Duración:** 5 minutos  
**Downtime:** ~30 segundos

---

### Destruir Todo (⚠️ DESTRUCTIVO)
```
1. terraform plan -destroy
2. Revisar qué se va a eliminar
3. terraform destroy
4. Confirmar (o usar -auto-approve)
5. Volumen /data está protegido (prevent_destroy)
```
**Duración:** 5 minutos  
**Riesgo:** ALTO — No hacer sin consultar

---

## 🎓 Aprende Terraform

### Conceptos Básicos (30 min)
- Recurso: `resource "aws_instance" "app" { ... }`
- Variable: `variable "tipo_de_instancia" { default = "..." }`
- Output: `output "ip_publica" { value = aws_instance.app.public_ip }`
- Plan: `terraform plan` (qué va a pasar)
- Apply: `terraform apply` (ejecutar cambios)

### Vida de un Recurso
```
resource "aws_instance" "app" {
  # 1. Define propiedades
  ami           = "ami-0c02..."
  instance_type = "t3.small"

  # 2. Terraform crea en AWS
  # terraform apply

  # 3. Terraform actualiza estado
  # archivo .tfstate (o S3)

  # 4. Terraform detecta cambios
  # instance_type = "t3.medium"
  # terraform plan (muestra will be replaced)

  # 5. Terraform aplica cambios
  # terraform apply
}
```

### Debugging
```bash
# Ver plan en JSON (más detallado)
terraform plan -json | jq .

# Ver estado actual
terraform show

# Logs de debug (muy verbose)
TF_LOG=DEBUG terraform plan

# Entrada interactiva para probar expresiones
terraform console
```

---

## 🚨 Alertas y Advertencias

⚠️ **NUNCA hacer:**
```bash
# Sin revisar el plan primero
terraform apply -auto-approve

# Sin backup previo
terraform destroy

# Cambios directamente en AWS Console
# (Terraform no verá los cambios y puede revertirlos)

# Subir terraform.tfstate a git
# (Contiene datos sensibles)

# Compartir terraform.tfvars
# (Contiene credenciales, variables sensibles)
```

✅ **SIEMPRE:**
```bash
terraform validate
terraform plan  # revisar
terraform apply

# Gitignore:
echo "terraform.tfvars" >> .gitignore
echo ".terraform/" >> .gitignore
echo "*.tfstate*" >> .gitignore
```

---

## 📞 Contacto y Soporte

| Aspecto | Referencia | Contacto |
|---|---|---|
| Errores de Terraform | [DEPLOYMENT_GUIDE.md § Troubleshooting](./DEPLOYMENT_GUIDE.md) | infrateam |
| Cambios de infraestructura | [TERRAFORM_COMMANDS.md § Tareas Comunes](./TERRAFORM_COMMANDS.md) | DevOps lead |
| Seguridad/compliance | [TERRAFORM_REVIEW.md](./TERRAFORM_REVIEW.md) | Security team |
| Documentación | Este archivo | infrateam |
| Emergencia (instancia caída) | Session Manager → investigar logs | On-call |

---

## 📈 Versiones y Historial

| Versión | Fecha | Cambios |
|---|---|---|
| 1.0 | 2026-08-18 | Initial: agregados tags, documentación completa |
| TBD | - | Siguiente mejora |

---

## 🎯 Próximos Pasos

### Si nunca desplegaste
👉 [Ir a DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) y sigue FASE 1

### Si necesitas un comando rápido
👉 [Ir a TERRAFORM_COMMANDS.md](./TERRAFORM_COMMANDS.md)

### Si quieres entender la seguridad
👉 [Ir a TERRAFORM_REVIEW.md](./TERRAFORM_REVIEW.md) § Análisis de Seguridad

### Si necesitas una visión general
👉 [Ir a INFRA_SUMMARY.md](./INFRA_SUMMARY.md)

---

**¿Preguntas?** Lee el documento relevante arriba.  
**¿No encuentras la respuesta?** Abre un issue en GitHub o contacta al equipo de infrateam.

**Última actualización:** 2026-08-18  
**Mantenido por:** infrateam
