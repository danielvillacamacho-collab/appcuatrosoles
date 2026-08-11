# 09 — Decisiones y preguntas abiertas

## Decisiones tomadas (2026-08-10, Daniel)

**D-01 — Es un producto vendible, con servicios de administración encima.**
La plataforma se venderá a otros clubes de polo, y además del uso del software se venderá la
**administración deportiva**: comisariato, gestión de torneos, gestión de alumnos.
Consecuencias: multi-tenant real en operación (no sólo en el modelo), consola de
superadministración, aprovisionamiento de clubes nuevos, plantillas de configuración,
personal que trabaja en varios clubes a la vez, y planes con límites. Ver `specs/140`.

**D-02 — Pasarela: Wompi.** La cuenta sandbox se solicita más adelante. El desarrollo arranca
contra `FakeGateway`; el adaptador de Wompi se implementa cuando lleguen las llaves. Esto no
bloquea nada hasta la Fase 3.

**D-03 — Cada entidad cobra lo suyo; Cuatro Soles recauda y transfiere al club.**
Club y organización emiten cobros por conceptos distintos. Cuatro Soles puede recaudar
dinero que le corresponde al club y transferírselo después. Consecuencias: cada cobro tiene
**beneficiario** (a quién le pertenece la plata) y **recaudador** (quién la recibe), y hace
falta un módulo de liquidación entre entidades. Ver `specs/105`.

**D-05 — Un correo = un acceso en toda la plataforma, con selector de club.** (2026-08-10)
Resuelve el riesgo R-1 de `specs/010-identidad-acceso-roles/plan.md` §7. Una persona tiene una
sola cuenta y una sola contraseña aunque opere en varios clubes: el club se resuelve por
subdominio y la sesión lleva un **club activo** explícito y auditado. Es lo que ya exigía
`ADR-013` y `specs/140` HU-140-03 (nuestro comisario atiende tres clubes sin manejar tres
credenciales). Consecuencia técnica: `user_account.email` es único **global**, no por club —
corrige la nota "(único por club)" de `docs/02` §B, que contradecía a `docs/02` §L.
Descartado: cuenta separada por club (mayor aislamiento, pero rompe el requisito de una sola
credencial para el personal de servicio).

**D-04 — Construye Daniel con Claude Code, sin supervisión de ingenieros.**
Consecuencias en todo el kit: se elimina Redis para reducir piezas; las tareas se escriben
más pequeñas y con verificación automática; se agregan barreras de CI que sustituyen la
revisión de código humana; y hay un manual de operación en `docs/10-operating-manual-solo.md`.

## Pendientes que todavía bloquean algo

| # | Pregunta | Bloquea | Cuándo se necesita |
|---|---|---|---|
| Q-02b | Llaves de Wompi sandbox y producción | adaptador real de pagos | inicio Fase 3 |
| Q-03b | ¿El club también tendrá su propia cuenta Wompi, o todo se recauda por Cuatro Soles? | diseño de liquidación (ver `specs/105` §Riesgos) | inicio Fase 3 |
| Q-03c | ¿Existe un acuerdo escrito de recaudo entre Cuatro Soles y el club? | no bloquea el código, sí la operación real | antes de cobrar plata real |
| T-04 | Dominio definitivo y quién administra el DNS | despliegue | **Decidido 2026-08-11**: `cuatrosoles.co`, comprado y administrado en Route 53. Ver `docs/11`. |
| T-05 | ¿Quién atiende soporte del día a día del club? | operación | Fase 2 |

## Parámetros con default vigente (no bloquean, se cambian sin desplegar)

| # | Pregunta | Default vigente |
|---|---|---|
| Q-04 | Penalización por bajarse de práctica confirmada | Cobrar el valor y perder prioridad 2 prácticas |
| Q-05 | ¿Las bolsas de clases vencen? | No vencen (vencimiento de 12 meses ya implementado como opción) |
| Q-06 | ¿Alquiler de caballos y quién recibe el ingreso? | Sí, ingreso a quien lo lista, 0 % al dueño |
| Q-07 | Diferencias exactas entre categorías | Sólo cuota y precio por jugar; "requiere aptitud" sólo para estudiante |
| Q-08 | Hora de decisión de prácticas | 6:00 p.m., configurable por día |
| Q-09 | ¿Taqueos con reserva y cobro? | Sí. **Se implementan con el módulo de pagos (Fase 3), no en `specs/040`** — decidido 2026-08-11 |
| Q-10 | ¿Reservar clase con bolsa en cero? | No |
| Q-11 | Quién puede ser subcomisario | Quien designe el comisario, por período |
| Q-12 | ¿Notificaciones por WhatsApp? | No en v1; adaptador previsto |
| Q-13 | Ventana para reclamar cupo liberado | 60 minutos |
| Q-14 | Destino del dinero cuando el club cancela | Crédito a favor |
| Q-15 | Edad máxima de perfil de menor | 18 |
| Q-16 | Waiver: una vez o por temporada | Una vez, se repite si cambia el texto |

## Registro histórico

| Fecha | Decisión | Quién |
|---|---|---|
| 2026-08 | Plataforma sólo web, mobile-first, sin app de tienda | Daniel |
| 2026-08 | Sin facturación electrónica ni contabilidad en la plataforma | Daniel |
| 2026-08 | Pagos sólo por link de pasarela externa | Daniel |
| 2026-08 | No se modela qué caballo juega cada chukker en v1 | Daniel |
| 2026-08 | Stack: TypeScript, NestJS, React, PostgreSQL, una EC2 | CTO |
| 2026-08-10 | D-01 a D-04 (arriba) | Daniel |
