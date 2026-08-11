# 08 — Catálogo de configuración

Todo lo que aquí aparece vive en la tabla `setting` (`docs/02` §A) o en una tabla de catálogo
propia, **nunca** en una constante del código (`memory/constitution.md` P-04). Este documento
es también, en la práctica, la lista de preguntas de negocio que le hacemos al club — cada
fila tiene un default vigente que funciona sin bloquear, y que el club puede cambiar sin pedir
un despliegue.

Ámbito: `platform` | `club` | `organization`. Todo valor tiene `effective_from`: cambiarlo
inserta una fila nueva, nunca sobreescribe la vigente (histórico consultable siempre).

## 1. Prácticas

| Clave | Ámbito | Default vigente | Fuente |
|---|---|---|---|
| `practice.decision_time` | club | 18:00, configurable por día de la semana | `docs/09` Q-08 |
| `practice.default_chukkers_options` | club | `[6, 7, 8]` | PRD Parte I §7 |
| `practice.applications_close_offset_hours` | club | a definir con el club | PRD Parte I §7 |
| `practice.half_man_cost_share_pct` | club | 50 / 50 | PRD Parte I §7 |
| `practice.min_players_default` | club | igual a jugadores objetivo, ajustable por práctica | PRD Parte I §7 |

## 2. Copas y torneos

| Clave | Ámbito | Default vigente | Fuente |
|---|---|---|---|
| `tournament.formats_enabled` | club | todos contra todos, eliminación directa, doble eliminación, grupos+eliminatoria, copa libre | PRD Parte I §8 |
| `tournament.tiebreaker_order` | club | partidos ganados → diferencia de goles → goles a favor → sorteo/comisario | PRD Parte I §8 |
| `tournament.advantage_rounding` | club | a confirmar con el club (up/down/nearest/half) | PRD Parte I §8 |
| `tournament.charge_mode_default` | club | `captain` (ajustable por copa a `split`) | `docs/09` Q-06 (equipo) |
| `tournament.awards_enabled` | club | campeón/subcampeón ambas coronas, MVP, mejor caballo, goleador — activables por copa | PRD Parte I §8 |

## 3. Clases y bolsas

| Clave | Ámbito | Default vigente | Fuente |
|---|---|---|---|
| `lesson.package_sizes` | organization | `[8, 10, 12, 20]` | PRD Parte I §9 |
| `lesson.wallet_expiry_days` | organization | sin vencimiento (`null`); opción de 365 días con reactivación | `docs/09` Q-05 |
| `lesson.wallet_allow_negative_balance` | organization | `false` | `docs/09` Q-10 |
| `lesson.waitlist_claim_window_minutes` | organization | 60 | `docs/09` Q-13 |
| `lesson.free_cancellation_window_hours` | organization | 12 | PRD Parte I §9 |

## 4. Coaches privados

| Clave | Ámbito | Default vigente | Fuente |
|---|---|---|---|
| `coach.cancellation_window_hours` | organization | 12 (igual que clases, ajustable) | PRD Parte I §10 |

## 5. Taqueos y canchas

| Clave | Ámbito | Default vigente | Fuente |
|---|---|---|---|
| `stick_and_ball.requires_booking_and_payment` | club | `true` | `docs/09` Q-09 |
| `stick_and_ball.max_players_per_slot` | club | a definir con el club | PRD Parte I §6 |
| `field.count` | club | 3 | PRD Parte I §6 |
| `field.operating_hours` | club | `06:00`–`18:00` | `specs/040` §13 — las canchas no tienen iluminación, así que el horario lo acota la luz natural |

## 6. Caballos y alquiler

| Clave | Ámbito | Default vigente | Fuente |
|---|---|---|---|
| `horse.rental_enabled` | club/organization | `true` | `docs/09` Q-06 |
| `horse.owner_revenue_share_pct_default` | club/organization | 0 % (el ingreso es de quien lista el caballo) | `docs/09` Q-06 |
| `horse.reminder_days_before_due` | organization | a definir (recordatorio de herraje/vacuna) | PRD Parte I §11 |

## 7. Categorías de membresía

| Clave | Ámbito | Default vigente | Fuente |
|---|---|---|---|
| `membership.category_change_proration` | club | sin prorrateo; aplica desde el siguiente ciclo | `docs/09` (pendiente confirmar) |
| `membership.category_rights_model` | club | sólo cuota y precio por jugar difieren; "requiere aptitud" únicamente para `student` | `docs/09` Q-07 |

## 8. Cancelaciones, penalizaciones y clima

| Clave | Ámbito | Default vigente | Fuente |
|---|---|---|---|
| `cancellation.late_withdrawal_penalty` | club | cobrar el valor completo + perder prioridad en 2 prácticas | `docs/09` Q-04 |
| `cancellation.club_cancellation_refund_mode` | club/organization | crédito a favor (no reembolso a pasarela) por defecto, ajustable caso a caso | `docs/09` Q-14 |
| `weather_closure.never_penalizes` | platform | `true`, no configurable — es un invariante (P-06 / `docs/02` §J), no una opción | PRD Parte I §13 |

## 9. Identidad y acceso

| Clave | Ámbito | Default vigente | Fuente |
|---|---|---|---|
| `auth.invitation_link_validity_days` | platform | 7 | PRD Parte II §4 |
| `auth.password_reset_link_validity_hours` | platform | 1 | PRD Parte II §7 |
| `auth.failed_login_lockout_threshold` | platform | 5 intentos | PRD Parte II §5 |
| `auth.failed_login_lockout_minutes` | platform | 15 | PRD Parte II §5 |
| `auth.session_idle_timeout_hours` | platform | varias horas, exacto por definir | PRD Parte II §6 |
| `identity.minor_profile_max_age` | club | 18 | `docs/09` Q-15 |
| `identity.waiver_renewal_policy` | club | una vez; se repite sólo si el texto cambia | `docs/09` Q-16 |

## 10. Notificaciones

| Clave | Ámbito | Default vigente | Fuente |
|---|---|---|---|
| `notifications.whatsapp_enabled` | platform | `false` en v1, adaptador previsto | `docs/09` Q-12 |
| `notifications.security_always_sent` | platform | `true`, no configurable por usuario | PRD Parte II §13 |

## 11. Cómo se agrega una fila nueva a este catálogo

1. Aparece en un spec de módulo como `[SUPUESTO]` o como pregunta al club.
2. Si el club responde, se marca aquí con su valor y se retira de `docs/09`.
3. Si no responde, se documenta aquí con su **default vigente** y se construye con ese
   default — nunca se bloquea la construcción esperando una respuesta que no es crítica para
   el código (sólo bloquean las marcadas como tal en `docs/09` §Pendientes).
4. Todo cambio real de valor en producción, una vez construido el módulo, lo hace el club
   desde la interfaz de administración — no un despliegue.
