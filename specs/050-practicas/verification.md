# VERIFICATION-050 — Prácticas oficiales

> Cada criterio de aceptación de `spec.md`, con el archivo y el título literal del test que lo
> cubre. Un criterio sin test **se resuelve**, no se anota.

**Fecha de cierre:** 2026-08-11 · 371 tests de dominio · 504 de integración · 147 de interfaz ·
7 E2E de navegador (1 de prácticas) · `packages/domain/src/practice` al 100 % ·
`apps/api/src/practices` al 87 %

## HU-050-01 — Publicar una práctica

| Criterio | Dónde se prueba |
|---|---|
| Publicar reserva la cancha | `practices.int-spec` «reserva la cancha y la práctica aparece en el calendario» · E2E «publicarla reserva la cancha» |
| Sobre algo programado se rechaza | `practices.int-spec` «sobre una franja ocupada se rechaza Y la práctica sigue en borrador» |
| Cierre posterior a decisión se rechaza | `setup.spec` «el cierre no puede ser posterior a la decisión» · `practices.int-spec` «cerrar postulaciones después de decidir se rechaza» |
| Un borrador no existe para nadie | `practices.int-spec` «un borrador NO aparece en el listado de nadie» y «a una práctica en borrador no se postula nadie» · `practice-schema.int-spec` «nace en borrador y sin reserva de cancha» |

## HU-050-02 — Postularse

| Criterio | Dónde se prueba |
|---|---|
| Se postula y queda con su posición | `practices.int-spec` «un jugador se postula y queda dentro» · `practices.spec.tsx` «dice si estás dentro» |
| Postularse dos veces se rechaza | `practices.int-spec` «postularse dos veces se rechaza» · `practice-schema.int-spec` «la misma persona no se postula dos veces» |
| Después del cierre no se entra | `decision.spec` «a la hora exacta, YA cerrada» · `practices.int-spec` «después del cierre no se entra ni se sale» |
| El estudiante no ve lo que le queda alto | `eligibility.spec` (7 tests) · `practices.int-spec` «no ve en el listado las prácticas de nivel superior» y «TAMPOCO entra por el enlace directo: 404, no 403» |
| Un jugador fuera del rango sugerido **sí** puede | `eligibility.spec` «un jugador se postula a una práctica de cualquier nivel» · `practices.int-spec` «un jugador sin habilitación no está limitado por ella» |

## HU-050-03 — Retirarse

| Criterio | Dónde se prueba |
|---|---|
| Retirarse promueve al siguiente **sin que corra nada** | `slots.spec` «retirarse promueve al siguiente sin que corra nada» · `practices.int-spec` «retirarse promueve al siguiente SIN que corra nada» · **E2E** «el primero se retira y el de la espera entra SIN que corra nada» |
| Volver a postularse entra al final | `practices.int-spec` «retirarse y volver a postularse deja a la persona AL FINAL de la fila» · `practice-schema.int-spec` «PERO quien se retiró puede volver a postularse» |
| Después del cierre no se sale | `practices.int-spec` «después del cierre no se entra ni se sale» |

## HU-050-04 — La práctica se decide sola

| Criterio | Dónde se prueba |
|---|---|
| Con suficientes, confirma y avisa | `decision.spec` «con los puestos suficientes, confirma» · `practice-decision.int-spec` «con los jugadores suficientes, confirma y avisa a todos» |
| Sin suficientes, cancela y libera la cancha | `practice-decision.int-spec` «sin los suficientes, cancela Y LIBERA LA CANCHA» |
| No avisa dos veces | `practice-decision.int-spec` «correr el proceso dos veces seguidas deja UN aviso por persona» |
| El sistema estuvo caído | `decision.spec` «tres horas tarde, decide igual» y «una semana tarde» · `practice-decision.int-spec` «tres horas tarde, la práctica se decide igual» |

## HU-050-05 — Compartir puesto (medio hombre)

| Criterio | Dónde se prueba |
|---|---|
| Aceptada, los dos ocupan un puesto | `slots.spec` «dos que se nombran mutuamente ocupan UN puesto» · `practices.int-spec` «aceptada, los dos ocupan UNO» |
| Sin aceptar no cuenta | `slots.spec` «una propuesta sin respuesta deja a los dos como puestos sueltos» · `practices.int-spec` «una propuesta sin aceptar NO ocupa puesto» |
| Si uno se retira, el otro queda suelto | `practices.int-spec` «si uno de la pareja se retira, el otro queda suelto en su posición» |
| **Añadido:** quien recibe la propuesta la ve | `practices.int-spec` «quien recibe una propuesta la VE, que es lo que la hace aceptable» · `practices.spec.tsx` «quien recibió una propuesta ve el botón de aceptarla» |

## Reglas transversales

| Regla | Dónde se prueba |
|---|---|
| R-050-06 orden de llegada, con desempate estable | `slots.spec` «dos postulaciones en el MISMO milisegundo dan siempre el mismo corte» |
| R-050-07 los cupos se cuentan en puestos | `slots.spec` «formar una pareja acorta la fila y mete a alguien de la espera» |
| R-050-10 idempotencia | `decision.spec` (3 tests de `ya_decidida`) · `practice-decision.int-spec` (2 tests) |
| R-050-12 cancelar libera la cancha | `practices.int-spec` «libera la cancha: se comprueba PROGRAMANDO otra cosa en esa franja» |
| R-050-13 aislamiento | arnés con las nueve rutas · `practices.int-spec` «una práctica de otro club responde 404» |
| Concurrencia | `practice-decision.int-spec` «el candado de fila hace esperar al retiro hasta que la decisión termina» |
| Los avisos se pueden silenciar | `notifications.spec` «y los del club NO lo son» · `me-notifications.int-spec` «marca como apagables los del club» |

## Lo que se descubrió construyendo, y no estaba en el plan

1. **El test de permisos seguía sin atrapar lo que decía atrapar** — por segunda vez. Las listas
   esperadas de `superadmin` y `club_admin` se calculaban con `PERMISSIONS.filter(...)`, así que
   `practice.manage` entró a la vez en lo esperado y en lo real. Ahora las tres están escritas a
   mano y completas. Verificado con un permiso de mentira.
2. **El test de concurrencia de `specs/030` era intermitente.** Las dos transacciones salían a la
   vez y nada garantizaba cuál agarraba el candado primero; a veces fallaba acusando al código de un
   problema que era del test. Ahora la primera avisa cuando ya lo tiene.
3. **Aceptar una pareja era inalcanzable desde la interfaz.** El compañero sólo aparece en la
   respuesta cuando la pareja **ya está formada**, así que una propuesta pendiente era invisible.
   Encima, la pantalla comparaba dos nulos y anunciaba que uno se había propuesto a sí mismo. Lo
   destapó abrir la pantalla en un navegador de verdad, no un test.
4. **Postularse dos veces daba 500.** El índice único parcial lo crea la migración a mano, así que
   Prisma no lo conoce por nombre y su mensaje no lo menciona.
5. **Cuatro problemas de andamiaje de pruebas**, todos de la misma familia —estado compartido entre
   tests— y todos con síntomas que aparecían lejos de la causa: franjas de cancha que chocaban entre
   tests; horas escritas en UTC que caían fuera del horario del club; el proceso de decisión, que es
   global por diseño, comiéndose el cupo de `take` con prácticas de otro archivo; y `page.url()`
   devolviendo la ruta vieja porque la navegación la hace el router y no el navegador.

## Pendientes declarados

- **Equipos, grilla de chukkers, asistencia y resultado** son `051`. `handicapDelEquipo` ya está
  construido y probado en `specs/030` esperándolo.
- **El peso deportivo del medio hombre** —que el puesto cuente el más alto de los dos— también es
  `051`. Aquí sólo se guarda el vínculo.
- **Cobros y penalizaciones** por bajarse de una práctica confirmada son `specs/100` y `specs/110`.
- **Un menor sin cuenta propia no recibe el aviso.** Enrutarlo a su acudiente es `specs/120`; el
  punto donde se decide está escrito y comentado en `decision.processor.ts`.
- **La fecha en el correo va sin zona horaria**: la bandeja de salida no sabe de qué club es el
  mensaje. Se resuelve en `specs/120` con la zona real.
- **`price_policy_id` está declarado y sin usar** hasta Fase 3.
