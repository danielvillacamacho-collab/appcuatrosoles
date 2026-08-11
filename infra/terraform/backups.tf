/**
 * Respaldos (`docs/07` §5).
 *
 * Son **dos mecanismos independientes a propósito**: el `pg_dump` que sube aquí, y los snapshots
 * del volumen EBS. Si el respaldo de la base falla en silencio —pasa, y no avisa— el snapshot del
 * volumen sigue estando. Un respaldo no verificado es una suposición, así que además se restaura
 * uno el primer lunes de cada mes (`docs/10` §5).
 */
resource "aws_s3_bucket" "respaldos" {
  bucket = "cuatrosoles-respaldos-${var.entorno}"

  lifecycle {
    prevent_destroy = true
  }
}

/** Los cuatro interruptores. Un bucket de respaldos legible desde internet es una fuga de datos. */
resource "aws_s3_bucket_public_access_block" "respaldos" {
  bucket = aws_s3_bucket.respaldos.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

/** Versionado: si un respaldo se sobreescribe con uno corrupto, la versión anterior sigue ahí. */
resource "aws_s3_bucket_versioning" "respaldos" {
  bucket = aws_s3_bucket.respaldos.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "respaldos" {
  bucket = aws_s3_bucket.respaldos.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "respaldos" {
  bucket = aws_s3_bucket.respaldos.id
  # El versionado guarda copias viejas indefinidamente si nadie las expira: sin esta regla, la
  # factura crece sola y en silencio.
  depends_on = [aws_s3_bucket_versioning.respaldos]

  rule {
    id     = "expirar"
    status = "Enabled"

    filter {}

    expiration {
      days = var.dias_de_respaldo
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }
}

/**
 * Snapshots diarios del volumen de datos, la segunda capa.
 *
 * Los toma AWS sin que nada dentro de la instancia tenga que funcionar — que es justo lo que se
 * quiere de un respaldo: que no dependa de lo que está respaldando.
 */
resource "aws_dlm_lifecycle_policy" "snapshots" {
  description        = "Snapshots diarios del volumen de datos de ${local.nombre}"
  execution_role_arn = aws_iam_role.snapshots.arn
  state              = "ENABLED"

  policy_details {
    resource_types = ["VOLUME"]
    target_tags    = { Name = "${local.nombre}-datos" }

    schedule {
      name = "diario"

      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        # 07:00 UTC = 2:00 a.m. en Bogotá: la hora de menos uso del club.
        times = ["07:00"]
      }

      retain_rule {
        count = 7
      }

      copy_tags = true
    }
  }
}

resource "aws_iam_role" "snapshots" {
  name = "${local.nombre}-snapshots"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "dlm.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "snapshots" {
  role       = aws_iam_role.snapshots.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
}
