locals {
  nombre = "cuatrosoles-${var.entorno}"
  host   = "${var.entorno}.${var.dominio}"
}

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }
}

/**
 * El grupo de seguridad: 80 y 443, y nada más.
 *
 * **No hay puerto 22.** Para entrar a la instancia se usa Session Manager, que va por la API de AWS
 * y no necesita puerto abierto, ni llave que se pueda perder o filtrar, y deja registro de quién
 * entró. Un `22` abierto —aunque sea «restringido a mi IP», que cambia sola— es la puerta que
 * alguien deja entornada.
 *
 * **Tampoco hay 5432.** La base de datos vive en la misma instancia y sólo la alcanzan los
 * contenedores por la red interna de Docker. Abrir PostgreSQL a internet «un momento para probar»
 * es cómo se pierde una base de datos.
 */
resource "aws_security_group" "app" {
  name        = local.nombre
  description = "Cuatro Soles ${var.entorno}: sólo HTTP y HTTPS entrantes"
  vpc_id      = data.aws_vpc.principal.id

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    # Caddy redirige a HTTPS y responde los desafíos de Let's Encrypt que van por HTTP.
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Salida libre: actualizaciones, certificados, SES, S3"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = var.tipo_de_instancia
  subnet_id              = data.aws_subnets.principal.ids[0]
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile   = aws_iam_instance_profile.app.name
  user_data              = file("${path.module}/user-data.sh")

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
    encrypted   = true
  }

  /**
   * IMDSv2 obligatorio.
   *
   * Con IMDSv1 basta una vulnerabilidad de SSRF en la aplicación para que alguien lea las
   * credenciales del rol de la instancia con una petición HTTP simple. Exigir el token de sesión lo
   * cierra, y no cuesta nada porque todo SDK moderno ya lo usa.
   */
  metadata_options {
    http_tokens                 = "required"
    http_endpoint               = "enabled"
    http_put_response_hop_limit = 2
  }

  tags = { Name = local.nombre }

  lifecycle {
    # La AMI cambia sola cada vez que Amazon publica una: sin esto, un `apply` cualquiera
    # **recrearía la instancia** y se llevaría lo que no esté en el volumen de datos.
    ignore_changes = [ami]
  }
}

/**
 * El volumen de datos, separado del disco raíz.
 *
 * Es lo que permite destruir y recrear la instancia —para cambiar de tamaño, para actualizar el
 * sistema operativo— sin tocar la base de datos. `prevent_destroy` es la red de seguridad: un
 * `terraform destroy` distraído no se lleva los datos por delante.
 */
resource "aws_ebs_volume" "datos" {
  availability_zone = aws_instance.app.availability_zone
  size              = var.disco_de_datos_gb
  type              = "gp3"
  encrypted         = true

  tags = { Name = "${local.nombre}-datos" }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_volume_attachment" "datos" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.datos.id
  instance_id = aws_instance.app.id
}

/**
 * IP fija.
 *
 * La IP pública que AWS asigna sola cambia cada vez que la instancia se detiene y arranca, y el DNS
 * quedaría apuntando a la nada hasta que alguien lo note.
 */
resource "aws_eip" "app" {
  domain   = "vpc"
  instance = aws_instance.app.id

  tags = { Name = local.nombre }
}
