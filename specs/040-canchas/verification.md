# VERIFICATION-040 — Canchas y calendario

> Cada criterio de aceptación de `spec.md`, con el archivo y el título literal del test que lo
> cubre. La regla de T-471 es la de `specs/010` T-110: un criterio sin test **se resuelve**, no se
> anota — y allá esa regla destapó cuatro criterios sin implementar.

**Fecha de cierre:** 2026-08-11 · 277 tests de dominio · 432 de integración · 105 de interfaz ·
4 E2E de navegador · `scheduling` al 100 % de líneas y ramas

## HU-040-01 — Las canchas del club existen

| Criterio | Dónde se prueba |
|---|---|
| Un club recién creado tiene sus canchas | `platform-clubs.int-spec` «queda activo, con sus categorías…» (canchas verificadas por nombre) · `seed.int-spec` «el club de ejemplo tiene sus canchas» |
| Agregar, renombrar, describir | `fields.int-spec` «el administrador crea una cancha» · `fields.spec.tsx` «crea una cancha y refresca la lista» |
| Fuera de servicio: no se programa, lo programado no desaparece | `fields.int-spec` «una cancha en mantenimiento no admite reservas nuevas» · `bookings-service.int-spec` «una cancha fuera de servicio no admite reservas» |
| No se elimina: se archiva (P-06) | `field-booking.int-spec` «una cancha con reservas no se puede borrar: se archiva» · `fields.int-spec` «archivar no borra» · el contrato ni siquiera admite `archived` en el `PATCH` («el contrato no deja archivar por la puerta de atrás») |

## HU-040-02 — Nada se programa encima de otra cosa

| Criterio | Dónde se prueba |
|---|---|
| Un solape de un minuto se rechaza, diciendo con qué choca | `field-booking.int-spec` «un solape de UN MINUTO se rechaza» · `bookings-service.int-spec` «dice CON QUÉ choca, no sólo que chocó» |
| Dos administradores guardando **a la vez**: entra una | `bookings-service.int-spec` «dos transacciones a la vez sobre la misma franja» — **verificado quitando la restricción**: sin ella entran las dos |
| Lo cancelado no ocupa | `field-booking.int-spec` «una reserva cancelada NO ocupa la franja» · «cancelar libera la franja de inmediato» |
| El borde no choca (R-040-04) | `overlap.spec` «lo que empieza a las 5:30 va DESPUÉS de lo que termina a las 5:30» · `field-booking.int-spec` y `bookings-service.int-spec`, mismo caso contra la base |

## HU-040-03 — Bloquear una cancha

| Criterio | Dónde se prueba |
|---|---|
| El bloqueo ocupa como cualquier actividad | `fields.int-spec` «el comisario bloquea por condiciones de juego» · pasa por el mismo `BookingsService` |
| No atropella lo existente | `fields.int-spec` «bloquear encima de algo existente se rechaza diciendo con qué choca» · `canchas.spec.ts` (E2E) «bloquear encima falla con un mensaje entendible» |
| Levantarlo libera de inmediato | `fields.int-spec` «la franja queda disponible de inmediato» · E2E «al levantar el bloqueo la franja vuelve a estar libre» |
| El motivo es obligatorio | `fields.int-spec` «el motivo es obligatorio» · `calendar.spec.tsx` «sin motivo no viaja nada: el formulario lo exige, no sólo el API» |

## HU-040-04 — Ver qué hay en las canchas

| Criterio | Dónde se prueba |
|---|---|
| El día, por cancha, con lo libre | `calendar.int-spec` «un día sin nada devuelve las canchas con sus franjas vacías» · `calendar.spec.tsx` «el hueco entre actividades se muestra como libre» |
| Participante ve el detalle | `calendarPrivacy.spec` «participante: ve el detalle de lo suyo» — de punta a punta cuando exista `practice_application` (ver Pendientes) |
| Lo privado ajeno es «Ocupado», sin nada más | `calendar.int-spec` «lo privado de otro es sólo “Ocupado”» y «LA RESPUESTA ENTERA no contiene ningún identificador» — **verificado metiéndole una fuga**: agregado `type` a mano, el test falló nombrando el dato |

## HU-040-05 — El horario de operación

| Criterio | Dónde se prueba |
|---|---|
| Fuera del horario se rechaza | `operatingHours.spec` (17 tests, bordes incluidos) · `bookings-service.int-spec` «fuera del horario del club se rechaza diciendo cuál es el problema» |
| El horario es configuración (P-04) | `field.operating_hours` en el catálogo; el servicio lo lee de `settings` con respaldo |

## Reglas transversales

| Regla | Dónde se prueba |
|---|---|
| R-040-01 una sola tabla | `BookingsService` es el único escritor; el bloqueo pasa por él |
| R-040-05 el día en la zona del club | `dayRange.spec` (10 tests, incl. el día de 23 horas en Santiago) · `calendar.int-spec` «una actividad de las 7:00 p.m. aparece en ESE día» · `calendar.spec.tsx` «las horas se pintan en la zona del club» |
| R-040-09 aislamiento de tenant | arnés de aislamiento con las 7 rutas declaradas · `calendar.int-spec` «el calendario de otro club no se alcanza desde este subdominio» |

## Los tres tests que se verificaron a sí mismos

1. **Concurrencia (T-422)**: se corrió el mismo escenario **sin** la restricción — entraron las dos
   transacciones y quedaron dos reservas solapadas. Con ella, una.
2. **Privacidad (T-451)**: se metió una fuga a mano (`type` en el caso anónimo) — el test falló
   nombrando el dato filtrado.
3. **Cambio de hora (`dayRange`)**: el test señalaba el día equivocado y falló; se comprobó contra
   `Intl` **antes** de tocar el código. El cálculo estaba bien, el test estaba mal.

Un test que pasa igual con y sin la garantía que dice probar es peor que no tenerlo.

## Pendientes declarados

- **`participa` es `false` en el calendario** hasta que exista `practice_application`
  (`specs/050`). La regla ya está probada con sus seis casos; el punto de conexión está escrito y
  explícito en `calendar.service.ts`.
- **Las franjas libres se calculan entre actividades**, no contra el horario de operación: la
  respuesta del calendario no trae el horario todavía. Cuando el calendario necesite mostrar «el
  club abre a las 6:00», el dato entra a `CalendarResponse`.
- **Los taqueos** (`stick_and_ball`): el tipo existe en el vocabulario, la reserva con cobro es
  Fase 3 (`spec.md` §3, Q-09).
- **Vista de semana y de mes** (`spec.md` §3): entra cuando haya volumen que la justifique.
