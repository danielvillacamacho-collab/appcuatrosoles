/**
 * Registro de imágenes en ECR, en vez de GHCR.
 *
 * Con ECR, la instancia hace `pull` con las credenciales que ya tiene por su rol — sin login, sin
 * token de GitHub guardado en ningún lado, el mismo principio que ya rige el resto del proyecto
 * (`iam.tf`, `github-oidc.tf`): nada de llaves de acceso de larga vida.
 *
 * Un repo por imagen, y con el nombre del ambiente adentro (`local.nombre`), para que DEV y PROD
 * no compartan tags de la misma imagen por accidente.
 */
resource "aws_ecr_repository" "api" {
  name                 = "${local.nombre}-api"
  image_tag_mutability = "IMMUTABLE" # una vez empujado un tag, no se puede pisar — el rollback usa el tag anterior, no una versión reescrita de éste.

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    name         = "cuatrosoles"
    project      = "cuatrosoles"
    environment  = "development"
    cost_center  = "interno"
    owner        = "infrateam"
  }
}

resource "aws_ecr_repository" "caddy" {
  name                 = "${local.nombre}-caddy"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    name         = "cuatrosoles"
    project      = "cuatrosoles"
    environment  = "development"
    cost_center  = "interno"
    owner        = "infrateam"
  }
}

/**
 * Expira las imágenes sin tag (las que quedan huérfanas cuando ECR rechaza un push por
 * `IMMUTABLE` sobre un tag repetido, o de builds fallidos a medias). Sin esto, no cuestan mucho
 * pero se acumulan indefinidamente.
 */
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Purgar imágenes sin tag después de 14 días"
      selection = {
        tagStatus   = "untagged"
        countType   = "sinceImagePushed"
        countUnit   = "days"
        countNumber = 14
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_lifecycle_policy" "caddy" {
  repository = aws_ecr_repository.caddy.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Purgar imágenes sin tag después de 14 días"
      selection = {
        tagStatus   = "untagged"
        countType   = "sinceImagePushed"
        countUnit   = "days"
        countNumber = 14
      }
      action = { type = "expire" }
    }]
  })
}
