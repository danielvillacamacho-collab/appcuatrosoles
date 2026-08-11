/**
 * Correo saliente (`ADR-008`).
 *
 * **Lo que Terraform NO puede hacer: sacar la cuenta del sandbox.** Es una solicitud con revisión
 * humana de 1 a 2 días hábiles y no existe como recurso. Mientras siga en sandbox, SES sólo entrega
 * a direcciones verificadas una por una, así que ninguna invitación llega a nadie de afuera. Ver
 * `docs/11` §4 para el texto exacto de la solicitud.
 */
resource "aws_sesv2_email_identity" "dominio" {
  email_identity = var.dominio

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

/**
 * Las tres firmas DKIM.
 *
 * Sin ellas el dominio queda «pendiente de verificación» y SES no envía nada. Publicarlas desde
 * aquí evita el paso manual que se olvida y se descubre cuando el primer correo no sale.
 */
resource "aws_route53_record" "ses_dkim" {
  count = 3

  zone_id = data.aws_route53_zone.principal.zone_id
  name    = "${aws_sesv2_email_identity.dominio.dkim_signing_attributes[0].tokens[count.index]}._domainkey.${var.dominio}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_sesv2_email_identity.dominio.dkim_signing_attributes[0].tokens[count.index]}.dkim.amazonses.com"]
}

/**
 * Dominio propio para el remitente técnico (`MAIL FROM`).
 *
 * Por defecto SES usa `amazonses.com` en el sobre del mensaje, y eso desalinea SPF: el correo se
 * entrega, pero con peor reputación y más probabilidad de caer en no deseados. Con un `MAIL FROM`
 * propio, SPF y DKIM apuntan al mismo dominio y el correo se ve como lo que es.
 *
 * `behavior_on_mx_failure = "USE_DEFAULT_VALUE"` para que un problema de DNS degrade a lo de antes
 * en vez de dejar al club sin poder invitar a nadie.
 */
resource "aws_sesv2_email_identity_mail_from_attributes" "dominio" {
  email_identity         = aws_sesv2_email_identity.dominio.email_identity
  mail_from_domain       = "correo.${var.dominio}"
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

resource "aws_route53_record" "ses_mail_from_mx" {
  zone_id = data.aws_route53_zone.principal.zone_id
  name    = aws_sesv2_email_identity_mail_from_attributes.dominio.mail_from_domain
  type    = "MX"
  ttl     = 600
  records = ["10 feedback-smtp.${var.region}.amazonses.com"]
}

resource "aws_route53_record" "ses_mail_from_spf" {
  zone_id = data.aws_route53_zone.principal.zone_id
  name    = aws_sesv2_email_identity_mail_from_attributes.dominio.mail_from_domain
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}
