# VERIFICATION-051 — Equipos y balanceo

> Cada criterio de aceptación de `spec.md`, con el archivo y el título literal del test que lo
> cubre. Un criterio sin test **se resuelve**, no se anota.

**Fecha de cierre:** 2026-08-25 · 389 tests de dominio · 539 de integración · 183 de interfaz ·
8 E2E de navegador (1 de equipos) · `packages/domain/src/practice` al 100 % de líneas

## HU-051-01 — Los equipos se proponen solos

| Criterio | Dónde se prueba |
|---|---|
| Al confirmarse quedan dos equipos propuestos | `teams.int-spec` «una práctica confirmada queda con equipos SIN que nadie haga nada» |
| El reparto minimiza la diferencia | `balance.spec` «el caso donde el codicioso falla y el exacto acierta» · `teams.int-spec` «el reparto es el más parejo: 8+4 contra 6+6» |
| Mismos jugadores, mismo resultado | `balance.spec` «el mismo conjunto DESORDENADO da el mismo reparto» y «repetirlo mil veces da siempre lo mismo» |
| Una práctica cancelada no tiene equipos | `teams.int-spec` «una práctica CANCELADA no tiene equipos» |
| Número impar: un puesto de diferencia | `balance.spec` «con número impar, los equipos quedan con un puesto de diferencia» |

## HU-051-02 — El comisario ajusta y aprueba

| Criterio | Dónde se prueba |
|---|---|
| Mover actualiza las sumas y la diferencia | `equipos.spec.tsx` «**mover un jugador cambia la diferencia SIN ir al servidor**» · `teams.int-spec` «mover un jugador cambia las sumas de los dos equipos» · E2E «mover a alguien cambia la diferencia al instante» |
| Aprobar publica y avisa | `teams.int-spec` «aprobar publica y avisa a cada jugador» · E2E «aprobar los publica» |
| Reacomodar después de aprobado se puede | `teams.int-spec` «reacomodar después de aprobado SE PUEDE, y vuelve a avisar» |
| Un jugador no aprueba | `teams.int-spec` «un jugador NO puede aprobar» |

## HU-051-03 — El medio hombre pesa el más alto

| Criterio | Dónde se prueba |
|---|---|
| Un puesto de 2 y 4 pesa 4 | `balance.spec` «compartido entre 2 y 4 goles, pesa 4 — ni la suma ni el promedio» · `teams.int-spec` «un puesto compartido guarda a los dos y pesa el mayor» |
| Se ven los dos nombres | `equipos.spec.tsx` «un puesto compartido muestra LOS DOS nombres» |

## HU-051-04 — Ver con quién juego

| Criterio | Dónde se prueba |
|---|---|
| Aprobados, con el propio señalado | `equipos.spec.tsx` «aprobados, los ve con el suyo señalado» · E2E «otra persona los ve en el detalle» |
| Un borrador no lo ve nadie más | `teams.int-spec` «un jugador NO ve una propuesta sin aprobar, y la respuesta no filtra ningún nombre» · `equipos.spec.tsx` «un jugador NO ve nada de equipos si no están aprobados» |

## Reglas transversales

| Regla | Dónde se prueba |
|---|---|
| R-051-03 tamaños parejos | `balance.spec` (3 tests de tamaños y bordes) |
| R-051-08 todo cambio queda registrado | `@Auditable` en las tres rutas que escriben |
| R-051-09 el handicap queda congelado | `teams.int-spec` «el handicap queda CONGELADO: cambiarlo después no mueve los equipos» |
| Aislamiento | arnés con las cuatro rutas · `teams.int-spec` «una práctica de otro club responde 404» |
| Rearmar no deja huérfanos | `team-schema.int-spec` «borrar el equipo se lleva sus puestos» · `teams.int-spec` «rearmar no duplica equipos ni puestos» |

## Lo que se descubrió construyendo, y no estaba en el plan

1. **Dos errores del reparto los encontraron los tests de borde, no yo.** El de handicaps negativos
   —la tabla se indexa por suma y yo dividía también el desplazamiento— y el del puesto único, donde
   la búsqueda arrancaba en una suma que no era alcanzable y el reparto salía vacío.
2. **Guardar un ajuste no persistía.** Reasignar posiciones de a una fila pasa por estados que
   violan el índice único `(equipo, posición)`. Se reprodujo primero en un test —falló con 500— y
   recién después se arregló, en dos pasadas. **Mis tests anteriores no lo veían porque sólo movían
   hacia abajo en el orden**, que es el caso que no colisiona.
3. **Una práctica confirmada sin equipos dejaba al comisario en un callejón**: el API podía armarlos
   y la pantalla no ofrecía cómo. Es la **tercera vez** que aparece este mismo agujero —`specs/030`
   con la pantalla de handicaps, `specs/050` con aceptar un medio hombre— y las tres lo destapó
   abrir la pantalla en un navegador, no un test.
4. **Perseguí un bug que no existía.** El E2E fallaba una de cada tres corridas y lo atribuí a que un
   refresco de fondo pisaba los cambios sin guardar; escribí una comparación por valor para evitarlo.
   **Tres intentos de reproducirlo fallaron** —el test pasaba igual con y sin la guarda—, y eso fue
   lo que mostró la verdad: TanStack Query aplica *structural sharing*, así que un refresco con datos
   iguales devuelve la misma referencia y el efecto ni se dispara. La guarda no protegía de nada y se
   quitó. Lo que fallaba era el **test**: movía a alguien antes de que aterrizara el refresco de
   rearmar, que sí trae datos distintos —puestos con identificadores nuevos— y se lleva el
   movimiento, como debe. Cuatro corridas completas en verde después de esperarlo.
5. **Y el E2E fallaba en CI aunque pasara cuatro veces en local.** `isVisible()` **no espera**:
   devuelve lo que hay en ese instante. Con la pantalla todavía cargando, los dos botones daban
   `false`, el test tomaba la rama equivocada y se quedaba un minuto esperando uno que no existía.
   En local no se veía **porque la base ya traía equipos de una corrida anterior**; en CI, que
   siembra desde cero, fallaba siempre. Se reprodujo levantando una base limpia igual que CI, y se
   comprobó después en las dos condiciones: recién sembrada y ya usada.
6. **La ruta de detalle tenía que ser `index`**: como `$practiceId.tsx` actuaba de plantilla sin
   rendir el hijo, la pantalla de equipos no aparecía nunca.

## Pendientes declarados

- **La grilla de chukkers, la asistencia y el resultado** son `052`.
- **El reparto del cobro entre medios hombres** (`cost_share_primary_pct`) queda declarado y sin usar
  hasta Fase 3.
- **El balanceo no mira los chukkers disponibles** (D-051-02): quién descansa por falta de caballos
  se resuelve en la grilla.
- **Un menor sin cuenta propia no recibe el aviso de equipos**; enrutarlo a su acudiente es
  `specs/120`.
