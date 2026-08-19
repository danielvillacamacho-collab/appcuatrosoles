terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }

  /**
   * El estado vive en S3, no en el disco de quien aplica.
   *
   * Con el estado local, dos personas que apliquen desde máquinas distintas se pisan y el segundo
   * `apply` intenta crear lo que ya existe. El bloqueo en DynamoDB es la otra mitad: impide que dos
   * `apply` corran a la vez.
   *
   * El bucket y la tabla los crea `bootstrap/`, que sí usa estado local — es el problema del huevo
   * y la gallina, y se resuelve una sola vez. Ver README §3.
   *
   * Descomentar después de correr `bootstrap/` y reemplazar el nombre del bucket por el que
   * imprimió.
   */
  backend "s3" {
    bucket         = "cuatrosoles-tfstate-eb3249c0"
    key            = "dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "cuatrosoles-tfstate-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.region

  /**
   * Etiquetas en todo lo que se cree.
   *
   * `Gestionado = terraform` no es decorativo: es lo que permite mirar la consola de AWS meses
   * después y saber qué se puede tocar a mano y qué se va a revertir en el siguiente `apply`.
   */
  default_tags {
    tags = {
      Proyecto    = "cuatro-soles"
      Entorno     = var.entorno
      Gestionado  = "terraform"
      Repositorio = var.repositorio_github
    }
  }
}

/** La red por defecto de la cuenta. Para una instancia sola no se justifica una VPC propia. */
data "aws_caller_identity" "actual" {}

data "aws_vpc" "principal" {
  default = true
}

data "aws_subnets" "principal" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.principal.id]
  }
}

/**
 * La zona DNS del dominio.
 *
 * Es un `data` y no un `resource` a propósito: al comprar el dominio en Route 53, AWS crea la zona
 * automáticamente. Declararla aquí como recurso haría que Terraform intentara crear una segunda,
 * con otros servidores de nombres, y el dominio seguiría resolviendo contra la primera — un fallo
 * que se manifiesta como «el DNS no propaga» y se busca durante horas en el lugar equivocado.
 */
data "aws_route53_zone" "principal" {
  name = var.dominio
}
