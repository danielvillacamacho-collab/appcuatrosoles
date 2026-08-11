variable "dominio" {
  description = "Dominio raíz, ya registrado y con su zona en Route 53. Terraform NO lo compra: ver README §2."
  type        = string
  default     = "cuatrosoles.co"

  validation {
    # Un dominio mal escrito no se devuelve. Esta comprobación no evita comprar el equivocado
    # —eso es manual— pero sí evita apuntarle a uno que no existe por un dedazo en el `.tfvars`.
    condition     = can(regex("^[a-z0-9][a-z0-9.-]*\\.[a-z]{2,}$", var.dominio))
    error_message = "El dominio va en minúsculas y sin protocolo: «cuatrosoles.co», no «https://Cuatrosoles.CO»."
  }
}

variable "entorno" {
  description = "Nombre del ambiente. Es el subdominio bajo el que vive: dev → *.dev.cuatrosoles.co."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.entorno)
    error_message = "Ambientes válidos: dev, staging, prod."
  }
}

variable "region" {
  description = "Región de AWS. us-east-1 es la de menor latencia desde Colombia entre las regiones completas."
  type        = string
  default     = "us-east-1"
}

variable "tipo_de_instancia" {
  description = "docs/07 §2: t3.small alcanza para el cliente cero. Se escala verticalmente antes que horizontalmente."
  type        = string
  default     = "t3.small"
}

variable "disco_de_datos_gb" {
  description = "Volumen EBS dedicado a PostgreSQL, separado del disco raíz para poder recrear la instancia sin tocar los datos."
  type        = number
  default     = 20
}

variable "repositorio_github" {
  description = "Repositorio que puede desplegar, como «organizacion/repositorio». El rol de despliegue no confía en ningún otro."
  type        = string
}

variable "rama_que_despliega" {
  description = "Sólo esta rama puede asumir el rol de despliegue."
  type        = string
  default     = "main"
}

variable "dias_de_respaldo" {
  description = "Retención de los respaldos en S3 (docs/07 §5)."
  type        = number
  default     = 30
}
