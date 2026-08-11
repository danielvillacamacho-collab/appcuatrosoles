/**
 * El registro del ambiente y **su comodín**.
 *
 * El comodín no es una comodidad: cada club cliente entra por su propio subdominio
 * (`lospinos.dev.cuatrosoles.co`) y el servidor decide de qué club son los datos leyendo ese
 * nombre (`ADR-013`). Sin el comodín habría que crear un registro DNS a mano cada vez que se da de
 * alta un club — exactamente lo que el producto está diseñado para no necesitar.
 */
resource "aws_route53_record" "entorno" {
  zone_id = data.aws_route53_zone.principal.zone_id
  name    = local.host
  type    = "A"
  ttl     = 300
  records = [aws_eip.app.public_ip]
}

resource "aws_route53_record" "entorno_comodin" {
  zone_id = data.aws_route53_zone.principal.zone_id
  name    = "*.${local.host}"
  type    = "A"
  ttl     = 300
  records = [aws_eip.app.public_ip]
}
