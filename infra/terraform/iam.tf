/**
 * El rol de la instancia.
 *
 * **Todo lo que la aplicación necesita de AWS lo obtiene de aquí, y nada de eso son llaves.** Sin
 * este rol harían falta un `SES_ACCESS_KEY_ID` y un `S3_ACCESS_KEY_ID` guardados en el `.env` de la
 * máquina: credenciales de larga vida, que hay que rotar, que alguien copia a otro lado y que
 * nadie revoca. Con el rol, el SDK las pide solo, duran una hora y se renuevan sin que nadie
 * intervenga.
 */
resource "aws_iam_role" "instancia" {
  name = "${local.nombre}-instancia"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = {
    name         = "cuatrosoles"
    project      = "cuatrosoles"
    environment  = "development"
    cost_center  = "interno"
    owner        = "infrateam"
  }
}

/** Session Manager: entrar a la instancia sin abrir el puerto 22 ni repartir llaves SSH. */
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.instancia.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

/**
 * Lo mínimo para que Caddy emita el certificado comodín.
 *
 * Let's Encrypt **no emite comodines validando por HTTP**, y necesitamos `*.dev.cuatrosoles.co`, así
 * que hay que validar por DNS: Caddy escribe un registro `TXT` temporal, espera la validación y lo
 * borra. Los permisos son sobre **esta zona y ninguna otra**.
 */
resource "aws_iam_role_policy" "certificados" {
  name = "${local.nombre}-certificados"
  role = aws_iam_role.instancia.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["route53:GetChange"]
        Resource = "arn:aws:route53:::change/*"
      },
      {
        Effect   = "Allow"
        Action   = ["route53:ChangeResourceRecordSets", "route53:ListResourceRecordSets"]
        Resource = "arn:aws:route53:::hostedzone/${data.aws_route53_zone.principal.zone_id}"
      },
      {
        Effect   = "Allow"
        Action   = ["route53:ListHostedZonesByName"]
        Resource = "*"
      },
    ]
  })
}

/** Enviar correo. Sólo enviar: no leer, no administrar identidades, no ver estadísticas. */
resource "aws_iam_role_policy" "correo" {
  name = "${local.nombre}-correo"
  role = aws_iam_role.instancia.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ses:SendEmail", "ses:SendRawEmail"]
      Resource = "*"
      Condition = {
        # Sólo puede enviar desde nuestro dominio: si alguien se hace con la instancia, no la puede
        # usar para mandar correo en nombre de otro.
        StringEquals = { "ses:FromAddress" = "*@${var.dominio}" }
      }
    }]
  })
}

/**
 * Traer las imágenes de ECR. Sólo lectura, y sólo estos 2 repos — no todos los de la cuenta.
 *
 * `ecr:GetAuthorizationToken` no admite scoping por recurso (la API de ECR lo exige sobre `*`);
 * el resto sí queda acotado a los repos de este ambiente.
 */
resource "aws_iam_role_policy" "ecr_pull" {
  name = "${local.nombre}-ecr-pull"
  role = aws_iam_role.instancia.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
        Resource = [
          aws_ecr_repository.api.arn,
          aws_ecr_repository.caddy.arn,
        ]
      },
    ]
  })
}

/** Escribir respaldos. **No puede borrar**: el ciclo de vida del bucket es quien expira. */
resource "aws_iam_role_policy" "respaldos" {
  name = "${local.nombre}-respaldos"
  role = aws_iam_role.instancia.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${aws_s3_bucket.respaldos.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = aws_s3_bucket.respaldos.arn
      },
    ]
  })
}

resource "aws_iam_instance_profile" "app" {
  name = "${local.nombre}-instancia"
  role = aws_iam_role.instancia.name
}
