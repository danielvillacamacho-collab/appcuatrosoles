/**
 * El huevo y la gallina del estado remoto.
 *
 * Terraform guarda en un archivo de estado qué recursos creó. Ese archivo tiene que vivir en S3
 * para que dos personas no se pisen — pero el bucket de S3 también hay que crearlo con Terraform.
 *
 * Esta configuración es la única que usa **estado local**, se corre **una sola vez**, y crea nada
 * más el bucket y la tabla de bloqueo. Su propio estado no importa: si se pierde, estos dos
 * recursos se importan o se recrean sin consecuencias.
 *
 *     cd infra/terraform/bootstrap
 *     terraform init && terraform apply
 *
 * Después se copia el nombre del bucket al `backend` de `../providers.tf` y se descomenta.
 */

terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Proyecto   = "cuatro-soles"
      Gestionado = "terraform"
      Nota       = "estado de terraform - no borrar"
    }
  }
}

variable "region" {
  type    = string
  default = "us-east-1"
}

/** Los nombres de bucket son únicos en todo AWS: el sufijo evita chocar con el de otra cuenta. */
resource "random_id" "sufijo" {
  byte_length = 4
}

resource "aws_s3_bucket" "estado" {
  bucket = "cuatrosoles-tfstate-${random_id.sufijo.hex}"

  lifecycle {
    prevent_destroy = true
  }
}

/**
 * Versionado: es lo que permite volver atrás si un `apply` corrompe el estado.
 *
 * Un estado corrupto sin versiones significa reconstruirlo a mano importando recurso por recurso,
 * que es un día de trabajo con la infraestructura en producción y nadie pudiendo tocarla.
 */
resource "aws_s3_bucket_versioning" "estado" {
  bucket = aws_s3_bucket.estado.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "estado" {
  bucket = aws_s3_bucket.estado.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

/** El estado lista identificadores de toda la infraestructura: no puede ser público jamás. */
resource "aws_s3_bucket_public_access_block" "estado" {
  bucket = aws_s3_bucket.estado.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

/** El bloqueo: impide que dos `apply` corran a la vez y se pisen a mitad de camino. */
resource "aws_dynamodb_table" "bloqueo" {
  name         = "cuatrosoles-tfstate-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  lifecycle {
    prevent_destroy = true
  }
}

output "siguiente_paso" {
  value = <<-TEXTO

    Bucket creado: ${aws_s3_bucket.estado.id}

    Ahora, en ../providers.tf, descomenta el bloque `backend "s3"` y pon ese nombre.
    Después, desde infra/terraform:

        terraform init
        terraform apply -var-file=dev.tfvars

  TEXTO
}
