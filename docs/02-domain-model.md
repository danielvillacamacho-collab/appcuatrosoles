# 02 — Modelo de dominio

Convenciones: `id` = UUID v7 (ordenable por tiempo). Todo timestamp es `timestamptz` en UTC.
Dinero = `BigInt` de centavos COP, sufijo `_cents`. Handicap = `Int` de medios goles,
sufijo `_halves` (handicap 1.5 → `3`). Toda tabla de negocio lleva `club_id`.
Auditoría de fila: `created_at`, `updated_at`, `created_by_id`.

---

## A. Estructura y configuración

**club** — raíz del tenant. `name`, `timezone` (America/Bogota), `currency` (COP).

**organization** — opera dentro del club. `club_id`, `name`, `type` (school | team | service),
`status`. Hoy: Cuatro Soles.

**season** — `club_id`, `name`, `starts_on`, `ends_on`, `status` (open | closed).
Prácticas, copas, handicaps y estadísticas se agrupan por temporada. Si el club no usa
temporadas, existe una abierta permanente.

**setting** — `scope` (platform | club | organization), `scope_id`, `key`, `value jsonb`,
`effective_from`, `created_by_id`. **Nunca se actualiza en sitio**: cambiar un valor inserta
una fila nueva; el valor vigente es el de mayor `effective_from` ≤ ahora. Así una tarifa
histórica sigue siendo consultable. Catálogo completo en `docs/08-configuration-catalog.md`.

**membership_category** — `club_id`, `code` (student | temporary_member | permanent_member |
partner | guest), `name`, `monthly_fee_cents`, `rights jsonb` (puede_postular_practicas,
puede_inscribir_copas, requiere_aptitud, puede_reservar_taqueo…), `active`.

---

## B. Identidad y acceso

**person** — el individuo real. Existe aunque no tenga acceso.
`club_id`, `full_name`, `phone`, `email` (opcional, informativo), `birthdate`,
`photo_key`, `is_minor`, `status` (active | archived), `notes`.
> Un invitado externo a una copa es una `person` sin `user_account`.

**user_account** — el acceso. `person_id` (único), `email` (**único global**, ver `docs/09` D-05),
`password_hash` (Argon2id), `status` (invited | active | suspended | archived),
`failed_attempts`, `locked_until`, `last_login_at`, `email_verified_at`.
> Invariante: una persona tiene como máximo una cuenta.

**session** — `user_account_id`, `token_hash`, `user_agent`, `ip_hash`, `created_at`,
`last_seen_at`, `expires_at`, `revoked_at`, `remember_me`.

**person_organization** — `club_id`, `person_id`, `organization_id`, `relationship`
(student | client | team_member | staff), `joined_on`, `left_on`.
> `club_id` se agregó en T-002 por P-05, aunque `organization_id` ya lo implique: mantiene el
> filtro de tenant uniforme en todas las tablas, sin excepciones que alguien deba recordar.
> Invariantes en base de datos: único parcial `(person_id, organization_id, relationship)`
> mientras `left_on IS NULL` — una persona puede ser estudiante **y** jugadora de equipo en la
> misma organización, pero no dos veces lo mismo; y `left_on >= joined_on`.

**role_assignment** — `user_account_id`, `role` (enum), `scope` (platform | club | organization),
`scope_id`, `granted_by_id`, `granted_at`, `revoked_at`, `revoked_by_id`.
> Roles: `superadmin`, `club_admin`, `organization_admin`, `commissioner`, `instructor`,
> `groom`, `treasurer`, `player`. `player` es el rol base de toda cuenta activa.
> **Única excepción deliberada a P-05: esta tabla no lleva `club_id`.** `scope` + `scope_id`
> ya *son* la frontera de tenant, y un `superadmin` tiene `scope = platform`, donde no existe
> club alguno; un `club_id` paralelo sería una segunda fuente de verdad capaz de contradecir a
> `scope_id`. Invariantes en base de datos: `scope_id` es NULL **exactamente** cuando
> `scope = platform`, y un mismo rol con el mismo alcance no puede estar otorgado dos veces a
> la vez (único parcial sobre las no revocadas).

**commissioner_delegation** — `club_id`, `delegator_id`, `delegate_id`, `starts_at`, `ends_at`,
`scope` (season | tournament), `scope_id`, `revoked_at`.
> Toda acción bajo delegación se audita con `on_behalf_of_id`.
> `club_id` agregado en T-002 (P-05): el rol de comisario es de alcance de club, así que la
> delegación siempre pertenece a un club. Invariantes en base de datos: `ends_at > starts_at`
> y `delegator_id <> delegate_id`.

**guardianship** — `guardian_person_id`, `dependent_person_id`, `is_primary_payer`,
`starts_on`, `ends_on`.
> Invariante: exactamente un `is_primary_payer = true` vigente por dependiente.
> Los cobros del dependiente se consolidan en el estado de cuenta del pagador principal.

**membership_assignment** — `person_id`, `membership_category_id`, `effective_from`,
`effective_to`, `assigned_by_id`. Historial; la vigente es la de mayor `effective_from`.

**waiver_version** / **waiver_acceptance** — `version`, `body`, `published_at` /
`person_id`, `waiver_version_id`, `accepted_by_person_id` (el acudiente si es menor),
`accepted_at`, `ip_hash`.
> Invariante: no se puede postular a una práctica ni reservar clase sin aceptación
> vigente de la última versión publicada.

**practice_eligibility** — `person_id`, `max_handicap_halves` (nivel hasta el que puede
jugar), `granted_by_id`, `granted_at`, `revoked_at`, `revoked_by_id`.
> El "apto para práctica" del estudiante.

**audit_log** — `club_id`, `actor_user_id`, `on_behalf_of_id`, `action`, `entity_type`,
`entity_id`, `before jsonb`, `after jsonb`, `occurred_at`, `request_id`.
> Sin UPDATE ni DELETE. El rol de base de datos de la aplicación sólo tiene INSERT y SELECT.

---

## C. Handicaps

**player_handicap** — valor vigente denormalizado para consultas rápidas.
`person_id`, `type` (international | club), `value_halves`, `updated_at`.
Rango válido: -4 a 20 medios goles (-2 a 10 goles).

**handicap_history** — `person_id`, `type`, `previous_halves`, `new_halves`,
`changed_by_id`, `on_behalf_of_id`, `reason`, `season_id`, `changed_at`.
> Append-only. La denormalizada se recalcula desde esta tabla; si divergen, gana el historial.

---

## D. Canchas y calendario

**field** — `club_id`, `name` (Cancha 1/2/3), `surface`, `status`, `capacity_notes`.

**field_booking** — **tabla central antidoble-reserva**.
`club_id`, `field_id`, `time_range tstzrange`, `booking_type`
(practice | lesson | tournament_match | stick_and_ball | coaching | maintenance | block),
`source_id` (id del evento que la origina), `visibility` (public | private), `created_by_id`.

```sql
ALTER TABLE field_booking
  ADD CONSTRAINT no_field_overlap
  EXCLUDE USING gist (field_id WITH =, time_range WITH &&)
  WHERE (cancelled_at IS NULL);
```
> Esta restricción es la razón por la que se eligió PostgreSQL. La regla "dos actividades no
> pueden ocupar la misma cancha a la misma hora" se vuelve físicamente imposible de violar,
> incluso con dos administradores guardando al mismo tiempo. La aplicación traduce la
> violación (`23P01`) a un error de usuario legible.

**Privacidad del calendario.** La API devuelve el detalle sólo si el solicitante participa
del evento, es dueño, o el evento es `public`. En cualquier otro caso devuelve
`{ start, end, field_id, label: "Ocupado" }` — sin `source_id`, sin tipo, sin nombres.
Se prueba con un test que serializa la respuesta y verifica que no aparece ningún id.

---

## E. Prácticas

**practice** — `club_id`, `season_id`, `field_id`, `starts_at`, `ends_at`, `chukkers` (6|7|8),
`handicap_type` (international | club), `suggested_handicap_min_halves`,
`suggested_handicap_max_halves`, `target_players`, `min_players`,
`applications_close_at`, `decision_at`, `price_policy_id`,
`status` (draft | published | confirmed | cancelled | played | settled),
`cancellation_reason`, `created_by_id`.

**practice_application** — `practice_id`, `person_id`, `chukkers_offered`,
`half_man_partner_person_id` (nullable), `horses_requested`,
`status` (applied | withdrawn | accepted | rejected | no_show), `applied_at`, `withdrawn_at`.
> Invariante: `UNIQUE(practice_id, person_id)` sobre las no retiradas.
> Invariante: si hay `half_man_partner`, la relación es recíproca o la propuesta queda pendiente.

**practice_team** — `practice_id`, `label` (A | B), `handicap_total_halves` (calculado),
`approved_by_id`, `approved_at`.

**practice_slot** — puesto dentro de un equipo. `practice_team_id`, `position` (1..4),
`primary_person_id`, `secondary_person_id` (medio hombre),
`effective_handicap_halves` (= máximo de los dos), `cost_share_primary_pct` (default 50).

**chukker_grid_cell** — `practice_id`, `chukker_no`, `practice_team_id`, `position`,
`person_id`, `horse_id` (nullable, fuera de alcance v1).
> Fuente de verdad de quién jugó cuánto. La estadística por jugador se cuenta desde aquí,
> no desde la postulación. Un medio hombre suma sólo sus celdas.

**practice_attendance** — `practice_id`, `person_id`, `attended`, `chukkers_played`,
`recorded_by_id`.

**practice_result** — opcional. `practice_id`, `team_a_goals`, `team_b_goals`, `notes`.

---

## F. Copas y torneos

**tournament** — `club_id`, `season_id`, `name`, `starts_on`, `ends_on`,
`handicap_type`, `scoring_mode` (open | handicap), `registration_mode` (individual | team),
`handicap_band_min_halves`, `handicap_band_max_halves`, `format`
(round_robin | single_elimination | double_elimination | groups_playoff | free),
`chukkers_per_match`, `tiebreakers jsonb` (orden configurable),
`advantage_rounding` (up | down | nearest | half),
`fee_policy jsonb`, `charge_mode` (captain | split), `awards jsonb`,
`status` (draft | registration_open | registration_closed | in_progress | finished),
`frozen_at`.

**tournament_team** — `tournament_id`, `name`, `captain_person_id`,
`handicap_total_halves_snapshot`, `status` (draft | pending_payment | confirmed | withdrawn).

**tournament_roster** — `tournament_team_id`, `person_id`, `position`,
`handicap_halves_snapshot`, `is_guest`, `invited_by_person_id`.
> **Snapshot obligatorio.** Al pasar la copa a `in_progress` se congelan handicaps y planteles.
> Todo cálculo de ventaja usa el snapshot; cambiar un handicap después no altera la copa.

**tournament_registration** — inscripción individual. `tournament_id`, `person_id`,
`handicap_halves_snapshot`, `status`, `charge_id`.

**tournament_stage** — `tournament_id`, `kind` (group | bracket | final), `name`, `order`.

**match** — `tournament_id`, `stage_id`, `round`, `slot_in_round`,
`home_team_id`, `away_team_id`, `field_id`, `scheduled_at`,
`handicap_advantage_goals_home`, `handicap_advantage_goals_away`,
`home_goals`, `away_goals`, `winner_team_id`,
`status` (scheduled | played | validated | walkover | cancelled),
`entered_by_id`, `validated_by_id`, `validated_at`.
> Un resultado validado no se edita: se emite una corrección que crea una fila en
> `match_correction` y actualiza, dejando rastro.

**standing** — vista materializada por etapa: partidos jugados, ganados, perdidos,
goles a favor/en contra, diferencia, puntos, posición. Se recalcula al validar un resultado.

**tournament_award** — `tournament_id`, `type` (champion_main | runner_up_main |
champion_handicap | runner_up_handicap | mvp | best_horse | top_scorer),
`person_id` | `team_id` | `horse_id`, `notes`.
> Las **dos coronas**: campeón principal (a la llana) y campeón de handicap conviven en
> la misma copa, cada uno con su cálculo.

---

## G. Clases, bolsas y coaches

**lesson** — `organization_id`, `field_id`, `instructor_person_id`, `starts_at`, `ends_at`,
`topic`, `capacity`, `status` (published | full | cancelled | held),
`waitlist_window_minutes` (default de settings).

**lesson_booking** — `lesson_id`, `person_id`, `booked_by_person_id` (el acudiente si es menor),
`status` (booked | cancelled_in_window | cancelled_late | attended | no_show | waived),
`ledger_entry_id`, `cancelled_at`.
> `UNIQUE(lesson_id, person_id)` sobre estados activos.

**lesson_waitlist** — `lesson_id`, `person_id`, `position`, `offered_at`, `offer_expires_at`,
`status` (waiting | offered | claimed | expired | withdrawn).
> Regla dura: el cupo se **ofrece**, no se asigna. Sin confirmación explícita no se
> inscribe a nadie ni se le descuenta clase. La oferta nunca expira después del inicio de
> la clase; si el margen es menor a la ventana, se acorta.

**class_package** — catálogo. `organization_id`, `name`, `lessons_count` (8|10|12|20),
`price_cents`, `validity_days` (nullable = no vence), `active`.

**class_wallet** — bolsa comprada. `person_id`, `class_package_id`, `purchased_lessons`,
`remaining_lessons`, `purchased_at`, `expires_at` (nullable), `charge_id`, `status`.

**class_ledger_entry** — **fuente de verdad del saldo**. `class_wallet_id`, `person_id`,
`delta` (+n compra, -1 consumo, +1 reversión), `reason`
(purchase | attendance | late_cancellation | no_show | waived_by_admin | weather_closure |
adjustment | expiry), `reference_type`, `reference_id`, `created_by_id`, `created_at`.
> `remaining_lessons` es una denormalización; la verdad es la suma del ledger.
> Un job diario verifica que coincidan y alerta si no. Consumo **FIFO**: primero la bolsa
> más antigua con saldo (y que no expire después).

**coach_profile** — `person_id`, `organization_id`, `active`.
**coach_rate** — `coach_profile_id`, `session_minutes`, `price_cents`, `effective_from`.
**coach_availability** — `coach_profile_id`, `weekday`, `start_time`, `end_time`, `field_id`.
**coach_session** — `coach_profile_id`, `person_id`, `field_booking_id`, `starts_at`,
`ends_at`, `price_cents_snapshot`, `status`, `charge_id`.
> Las sesiones de coach **no** salen de la bolsa de clases: se cobran por sesión.

---

## H. Caballos

**horse** — `club_id`, `name`, `owner_person_id` (nullable si es del club),
`stabled_organization_id`, `stabled_since`, `status`
(active | resting | injured | retired | sold), `photo_key`, `notes`.

**horse_log_entry** — bitácora. `horse_id`, `type` (pension | feed | farrier | deworming |
vaccine | treatment | vet_visit | other), `occurred_on`, `next_due_on` (nullable),
`detail jsonb` (p. ej. `{feed_type, kg_per_day}` o `{vaccine: "influenza"}`),
`cost_cents`, `charge_id` (nullable), `recorded_by_id`.
> `next_due_on` alimenta los recordatorios de herraje y vacuna.

**horse_rental_listing** — `horse_id`, `provider` (club | organization), `provider_id`,
`rate_cents_by_category jsonb`, `rate_cents_by_event_type jsonb`, `active`,
`owner_revenue_share_pct` (si el dueño recibe parte).

**horse_rental** — `horse_id`, `renter_person_id`, `time_range tstzrange`,
`event_type`, `event_id`, `chukkers`, `price_cents`, `charge_id`, `status`.

```sql
ALTER TABLE horse_rental
  ADD CONSTRAINT no_horse_double_booking
  EXCLUDE USING gist (horse_id WITH =, time_range WITH &&)
  WHERE (status <> 'cancelled');
```
> Invariante adicional en aplicación: un caballo en `resting`, `injured`, `retired` o `sold`
> no aparece como disponible.

---

## I. Cobros y pagos

**charge** — cuenta por cobrar. `club_id`, `organization_id` (nullable),
`payer_person_id`, `beneficiary_person_id` (el menor, si aplica), `concept`
(membership_fee | practice | stick_and_ball | tournament_entry | class_package |
coach_session | horse_pension | horse_service | horse_rental | penalty | other),
`description`, `amount_cents`, `currency`, `due_on`,
`status` (draft | pending | link_sent | paid | partially_paid | void | refunded | credited),
`source_type`, `source_id`, `parent_charge_id` (para pago dividido),
`issued_by_id`, `paid_at`.
> Invariante: la suma de los hijos de un `parent_charge` es igual al padre.
> Invariante: un equipo de copa sólo queda `confirmed` cuando su cobro (o todos los hijos)
> están `paid`.

**payment_link** — `charge_id`, `provider`, `external_reference`, `url`, `expires_at`,
`created_at`, `status`.

**payment_event** — todo webhook recibido. `provider`, `external_event_id` (único),
`signature_valid`, `payload jsonb`, `processed_at`, `charge_id`, `result`.
> Idempotencia por `external_event_id`. El estado del cobro **sólo** cambia por evento
> verificado o por conciliación manual con evidencia adjunta y auditoría.

**credit_entry** — saldo a favor. `person_id`, `delta_cents`, `reason`
(club_cancellation | overpayment | refund_alternative | manual_adjustment),
`reference_type`, `reference_id`, `created_by_id`.
> Saldo = suma del ledger. Se aplica automáticamente al siguiente cobro si el club lo activa.

**account_statement** — vista, no tabla: cobros + pagos + créditos por persona,
consolidando los dependientes en el pagador principal.

---

## J. Políticas, cancelaciones y clima

**cancellation_policy** — `scope` (club | organization), `scope_id`, `applies_to`
(lesson | coach_session | practice | tournament | stick_and_ball),
`free_window_hours` (default 12), `late_action` (charge_full | consume_lesson |
lose_priority | charge_and_lose_priority | none), `penalty_amount_cents`,
`priority_penalty_events` (cuántas prácticas pierde prioridad), `effective_from`.

**penalty_record** — `person_id`, `reason` (late_withdrawal | no_show), `source_type`,
`source_id`, `charge_id` (nullable), `priority_penalty_until`, `waived_by_id`, `waived_reason`.

**weather_closure** — `club_id`, `time_range tstzrange`, `field_ids` (nullable = todas),
`reason`, `created_by_id`, `affected_summary jsonb`, `reverted_at`.
> Un cierre por clima cancela en bloque prácticas, clases, taqueos y sesiones de coach del
> rango, revierte los consumos de bolsa (entrada `+1` con razón `weather_closure`), marca
> los cobros asociados como `void` y notifica a todos los afectados en un solo lote.
> **Invariante: un cierre por clima nunca penaliza ni consume bolsa.**

---

## K. Comunicación

**notification** — `recipient_person_id`, `type`, `channel` (in_app | email | push),
`payload jsonb`, `sent_at`, `read_at`, `deduplication_key`.
**notification_preference** — `person_id`, `type`, `in_app`, `email`.
> Las de seguridad (restablecimiento, cambio de contraseña, suspensión) ignoran la
> preferencia y siempre se envían.
**announcement** — tablón. `scope` (club | organization), `scope_id`, `title`, `body`,
`pinned`, `published_at`, `expires_at`, `author_id`.
**outbox_message** — `topic`, `payload`, `available_at`, `attempts`, `processed_at`.
> Patrón outbox para que un correo prometido no se pierda si el worker cae.

---

## Invariantes transversales (checklist de test)

1. Ninguna consulta de negocio se ejecuta sin `club_id` en el `where`.
2. Dos reservas de cancha nunca se solapan (garantizado por base de datos).
3. Un caballo no se alquila dos veces en el mismo rango (garantizado por base de datos).
4. El saldo de una bolsa siempre es igual a la suma de su ledger.
5. La suma de cobros hijos es igual al cobro padre.
6. Un handicap vigente siempre coincide con el último registro de su historial.
7. Los datos congelados de una copa no cambian tras `frozen_at`.
8. Un usuario suspendido no tiene ninguna sesión válida.
9. Nadie ve el detalle de un evento privado ajeno, en ninguna respuesta de la API.
10. Toda acción de la lista de auditoría deja exactamente un registro.

---

## L. Tenancy y plataforma (D-01)

**tenant_plan** — `code` (starter | managed | enterprise), `name`, `limits jsonb`
(personas activas, canchas, organizaciones, clubes), `features jsonb`.

**club** (ampliado) — se agregan: `slug` (subdominio, único global), `plan_code`,
`status` (trial | active | suspended | churned), `onboarded_at`, `branding jsonb`
(logo, color primario, nombre visible), `service_level` (self_serve | managed).
> `service_level = managed` significa que nosotros prestamos la administración deportiva.

**club_template** — plantilla de aprovisionamiento. `name`, `payload jsonb` con categorías,
tarifas base, políticas, formatos de copa y catálogos. Crear un club nuevo aplica una
plantilla; después el club ajusta lo suyo.

**staff_membership** — una persona nuestra que trabaja en varios clubes.
`person_id`, `club_id`, `capacity` (commissioner | tournament_manager | academy_manager |
support), `starts_on`, `ends_on`.
> Invariante: la sesión tiene un **club activo**; los permisos se evalúan siempre contra él.
> Cambiar de club activo es una acción explícita y auditada, nunca implícita por la URL.

**Resolución de tenant.** Se resuelve por subdominio del host. Si el host no corresponde a
ningún club activo, la respuesta es 404 antes de tocar la base de datos. Un `club_id` que
venga del cuerpo o de la query **nunca** se usa para determinar el tenant.

---

## M. Beneficiario y recaudador (D-03)

El club y las organizaciones cobran conceptos distintos, y una entidad puede recaudar dinero
que le pertenece a otra. Eso obliga a separar dos cosas que normalmente se confunden.

**payee** — entidad que puede tener plata a su nombre.
`club_id`, `kind` (club | organization), `entity_id`, `legal_name`, `tax_id`,
`merchant_account jsonb` (referencia a la cuenta de Wompi, si tiene una propia),
`can_collect` (bool), `active`.

**charge** (ampliado) — se agregan:
- `beneficiary_payee_id` — **de quién es la plata**. Determina a quién le pertenece el ingreso.
- `collector_payee_id` — **quién la recibe**. Determina por qué cuenta de comercio entra.
- `settlement_id` — la liquidación en la que se saldó, si beneficiario ≠ recaudador.

> Invariante: si `beneficiary_payee_id = collector_payee_id`, no hay nada que liquidar.
> Si difieren, el cobro genera una obligación del recaudador hacia el beneficiario en el
> momento en que se marca como pagado — no antes.

**settlement** — corte de cuentas entre dos entidades.
`club_id`, `from_payee_id` (recaudador), `to_payee_id` (beneficiario), `period_start`,
`period_end`, `gross_cents`, `fees_cents`, `adjustments_cents`, `net_cents`,
`status` (draft | approved | transferred | closed), `approved_by_id`, `transferred_at`,
`evidence_key` (comprobante de la transferencia), `notes`.

**settlement_line** — el detalle. `settlement_id`, `charge_id`, `amount_cents`, `concept`.
> Invariante: `net_cents` = suma de las líneas − comisiones − ajustes. Se recalcula al
> aprobar y se congela ahí; después es de sólo lectura.

**payout_adjustment** — ajustes manuales dentro de una liquidación (una devolución, un
error, un acuerdo). `settlement_id`, `amount_cents`, `reason`, `created_by_id`.
> Append-only, como todo lo que toca plata.

**Lo que esto NO es.** No es contabilidad ni tesorería: es un corte de cuentas con evidencia.
La transferencia real se hace por banco, por fuera, y en la plataforma se registra el
comprobante. La plataforma responde "¿cuánto le debe Cuatro Soles al club este mes y por
qué conceptos?", no "¿cómo se contabiliza eso?".
