/**
 * GitHub Actions despliega **sin llaves de acceso**.
 *
 * Con OIDC, GitHub firma un token que dice «soy el repositorio X, en la rama Y», y AWS lo cambia
 * por credenciales temporales. La alternativa —un `AWS_ACCESS_KEY_ID` guardado en los secretos del
 * repositorio— es una credencial de larga vida que hay que rotar a mano, que sirve desde cualquier
 * parte del mundo si se filtra, y que nadie revoca a tiempo porque nadie se entera.
 */
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # AWS dejó de validar esta huella en 2023 y la mantiene por compatibilidad; el argumento sigue
  # siendo obligatorio.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_role" "despliegue" {
  name = "${local.nombre}-despliegue"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          /**
           * **La condición más importante del archivo.**
           *
           * Sin ella —o con un comodín mal puesto, `repo:*`— **cualquier repositorio de GitHub, de
           * cualquier persona, podría asumir este rol**. Es el error clásico de las guías de OIDC y
           * no se nota nunca, porque todo funciona igual.
           *
           * Se compara con `StringEquals` y no con `StringLike`: la rama es exactamente una.
           */
          "token.actions.githubusercontent.com:sub" = "repo:${var.repositorio_github}:ref:refs/heads/${var.rama_que_despliega}"
        }
      }
    }]
  })
}

/**
 * Lo único que puede hacer el despliegue: mandarle un comando a **esta** instancia.
 *
 * No puede crear recursos, ni leer secretos, ni tocar la base de datos. Si el token de GitHub se
 * filtrara, lo peor que permite es redesplegar la aplicación.
 */
resource "aws_iam_role_policy" "despliegue" {
  name = "${local.nombre}-despliegue"
  role = aws_iam_role.despliegue.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["ssm:SendCommand"]
        Resource = [
          aws_instance.app.arn,
          "arn:aws:ssm:${var.region}::document/AWS-RunShellScript",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations"]
        Resource = "*"
      },
    ]
  })
}
