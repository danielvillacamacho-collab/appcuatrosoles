/**
 * Lo que hay que devolverle a quien conecta la aplicación.
 *
 * Es la misma lista de `docs/11` §10, pero salida de la infraestructura real en vez de copiada a
 * mano de la consola — que es donde se cuelan los dedazos.
 */

output "url_del_entorno" {
  description = "Un club de ejemplo entra por su subdominio: https://club-demo.<esto>"
  value       = "https://${local.host}"
}

output "ip_elastica" {
  value = aws_eip.app.public_ip
}

output "id_de_la_instancia" {
  description = "Para entrar: aws ssm start-session --target <esto>"
  value       = aws_instance.app.id
}

output "id_de_la_zona_dns" {
  value = data.aws_route53_zone.principal.zone_id
}

output "bucket_de_respaldos" {
  value = aws_s3_bucket.respaldos.id
}

output "rol_de_despliegue" {
  description = "Va en GitHub → Settings → Secrets → AWS_ROLE_ARN"
  value       = aws_iam_role.despliegue.arn
}

output "base_domain_para_el_env" {
  description = "El valor de BASE_DOMAIN en el .env de la instancia. Sin esto, ningún club resuelve."
  value       = local.host
}

output "estado_de_ses" {
  description = "Terraform verifica el dominio, pero salir del sandbox es un trámite manual (docs/11 §4)."
  value       = "Dominio ${var.dominio} verificado con DKIM. Falta solicitar la salida del sandbox a mano."
}
