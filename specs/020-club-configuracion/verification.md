# VERIFICATION-020 — Club, organizaciones, temporadas y configuración

Evidencia por tarea. Se llena a medida que avanza el módulo; el cierre formal (todos los criterios
de aceptación de `spec.md` §12 marcados) es T-262.

---

## T-201 — Esquema de club, organizaciones, temporadas y configuración

**Fecha:** 2026-08-11 · **Migración:** `20260811121058_club_organization_season_setting` ·
24 tests de integración

### Verificación exigida por la tarea

| Criterio | Resultado |
|---|---|
| Cada invariante probado **provocando su rechazo** | ✅ 24 tests, uno por caso, contra Postgres real |
| Migración `up` y `down` contra Postgres real | ✅ ciclo completo: 4 tablas → `down` → 0 tablas → re-aplicar → 4 tablas |

### El invariante que el plan no había previsto

**El índice único de `setting` no protegía el ámbito de plataforma.** Prisma genera el índice sobre
`(scope, scope_id, key, effective_from)`, y en las filas de plataforma `scope_id` es `NULL` — y
PostgreSQL considera **distintos** dos `NULL`. Es decir: la plataforma admitía dos valores para la
misma clave con la misma vigencia, y entonces «el valor vigente» dejaba de ser una respuesta y
pasaba a ser una lista, sin que nada fallara al escribir.

Es exactamente la misma propiedad de los `NULL` que en T-005 (`specs/010`) jugaba **a favor** —dos
personas del mismo club sin correo conviven— y aquí juega en contra. Se cubrió con un índice único
parcial `WHERE scope = 'platform'`, y tiene su test.

### Los invariantes, y por qué están en la base y no en un servicio

Todos podrían escribirse en el servicio, y todos se saltarían con un script, una migración de datos
o un `psql` a las 2 a.m. (P-09).

| Invariante | Qué evita |
|---|---|
| `slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'`, 2-63 caracteres | Un slug con mayúsculas, punto o espacio no falla ruidosamente: falla resolviendo a ningún club, o deja al club inalcanzable después de estar operando |
| `scope = 'platform'` ⟺ `scope_id IS NULL` | Un ajuste con ámbito incoherente queda **presente en la tabla y sin efecto**, que es la peor forma de estar mal |
| índice parcial de plataforma | Ver arriba |
| `ends_on >= starts_on` | Una temporada que termina antes de empezar es un error de captura que después nadie sabe interpretar en una estadística |
| `EXCLUDE` sobre `(club_id, daterange(starts_on, ends_on, '[]'))` | Dos temporadas solapadas del mismo club (R-020-06) |
| `ON DELETE RESTRICT` en organización y temporada | Borrar un club llevándose su historia por delante (P-06) |

**El `EXCLUDE` no podía ser una comprobación del servicio.** Dos solicitudes simultáneas leerían
«no hay solapamiento» y las dos insertarían; sólo el motor puede garantizarlo. Verificado con el
mensaje real de PostgreSQL, que nombra la restricción y los dos rangos en conflicto.

**El rango es cerrado en ambos extremos (`'[]'`)** y hay un test dedicado: con el rango semiabierto
por defecto, dos temporadas que compartan el día de cierre pasarían sin ser detectadas, y ese día
contaría para las dos en toda estadística. Es la misma lección de bordes de T-014.

**La restricción es por club, no global**, y también tiene test: si fuera global, el segundo club
de la plataforma no podría abrir su temporada — un aislamiento roto por el lado menos obvio.

### `btree_gist` y el rollback

El `EXCLUDE` mezcla igualdad de `club_id` (texto) con solapamiento de rango, y eso exige
`btree_gist`. Se instala en esta migración y se reutilizará en `specs/050` (una cancha tampoco
puede tener dos prácticas solapadas).

El `down.sql` **no** elimina la extensión, deliberadamente: `DROP EXTENSION` falla si algo depende
de ella, y forzarlo con `CASCADE` borraría esa restricción sin avisar. La nota vive en
`migration.sql` y no en `down.sql` porque ese archivo se regenera con `pnpm db:down-sql` y se
llevaría el comentario por delante.

### Un fallo del andamiaje, encontrado aquí

`pnpm db:down-sql` creaba sus directorios de trabajo **dentro de `prisma/migrations`**, y Prisma
trata cada subdirectorio de esa carpeta como una migración. Un temporal que sobreviviera a una
interrupción hacía que `prisma migrate deploy` fallara con `P3015` sin decir de cuál migración
habla: generar un `down` dejaba el despliegue roto hasta que alguien adivinara por qué. Corregido
en commit aparte —temporales fuera de esa carpeta, más `trap` de limpieza—, con las dos capas a
propósito: una hace inofensivo al huérfano, la otra evita que queden huérfanos.

### Pendiente declarado

- Las llaves foráneas desde las tablas de `specs/010` hacia `club` **todavía no existen**: son
  T-202, y son la parte delicada, porque hay que migrar los datos y decidir explícitamente qué
  hacer con `audit_log`, que es append-only por triggers.
- `Setting.createdById` no tiene llave foránea a `user_account` todavía: entra con T-202, junto al
  resto.

---

## T-202 — Las llaves foráneas hacia `club`, y la deuda que `specs/010` dejó anotada

**Fecha:** 2026-08-11 · **Migración:** `20260811121937_club_foreign_keys` · 8 tests nuevos
(71 de integración en total)

Once columnas que eran texto libre pasan a tener integridad referencial: `person`,
`person_organization` (club **y** organización), `commissioner_delegation`, `membership_category`,
`membership_assignment`, `guardianship`, `waiver_version`, `waiver_acceptance`, `audit_log` y
`setting.created_by_id`.

Por qué importa más de lo que parece: una fila con un `club_id` inexistente **no pertenece a ningún
inquilino**, así que ningún filtro por club la encuentra y ninguna consulta la muestra. Existe, y
es invisible. Eso toca P-05 de frente.

### La decisión sobre `audit_log`: sí lleva llave foránea

La tarea pedía decidirlo por escrito porque la tabla es append-only por triggers (T-004) y una
migración que intente actualizar sus filas **falla**. La respuesta es que sí la lleva, y el
razonamiento es lo que importa:

`ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` no es `UPDATE`, `DELETE` ni `TRUNCATE`: valida las
filas existentes **leyéndolas**, y de ahí en adelante sólo condiciona inserciones futuras. Los
triggers de P-07 bloquean las tres operaciones que borran o reescriben historia, y ninguna de ellas
participa aquí.

Lo que sí había que evitar era **reparar los datos con un `UPDATE`**, que es la forma habitual de
resolver huérfanos. Ver abajo.

Hay un test que crea una entrada, comprueba que la llave foránea rechaza un club inexistente, y
**acto seguido** comprueba que `UPDATE` y `DELETE` siguen fallando: si alguien un día reemplaza los
triggers por otra cosa, ese test avisa.

### La migración repara datos, no sólo esquema

La base de desarrollo ya tenía el problema: dos `club_id` huérfanos —`club-demo`, del seed, y `c`,
de una prueba manual de T-004—. Uno de ellos, `c`, **ni siquiera cumplía el formato de slug** de
T-201, lo que descartaba de entrada la solución ingenua de derivar el slug del identificador.

La migración, para cada `club_id` huérfano, **crea el club que falta conservando su
identificador**. Tres consecuencias buscadas:

1. **No se actualiza ninguna fila hija.** Es lo que permite que `audit_log` participe.
2. **No se borra nada** (P-06).
3. El club creado queda **`suspended`** y con un **slug generado** (`migrado-<hash>`), no adivinado.
   De un club cuyo origen no se puede verificar, lo último que se quiere es que quede accesible por
   subdominio en cuanto exista el `TenantGuard` (T-221). Si alguno es real, se reactiva a mano o lo
   corrige el arranque (T-232).

Verificado contra la base de desarrollo **con datos**, que es el caso que la tarea exigía y el que
rompe en un despliegue:

| Antes | Después |
|---|---|
| `person`, `membership_category`, `waiver_version`, `audit_log` con `club_id` suelto | `club` con dos filas: `c` (suspendido, `migrado-4a8a08f09d37`) y `club-demo` |
| insertar una persona de un club inexistente: permitido | rechazado por `person_club_id_fkey` |
| `audit_log`: 1 fila | 1 fila, intacta, y su `UPDATE` sigue rechazado por el trigger |

Ciclo `up → down → up` verificado. El `down.sql` quita las restricciones y **no** borra los clubes
creados: revertir el esquema no puede llevarse por delante filas que para entonces quizá ya tengan
datos colgando.

### El radio de la tarea: 12 archivos, y por qué no se podía partir

`CLAUDE.md` fija el límite en 5 archivos. Éste lo dobló, y la razón es la propia restricción: en
cuanto entró, **el seed y 21 tests dejaron de pasar**, porque todos inventaban `club_id`. Un commit
rojo no es una opción, así que la tarea absorbió:

- el `club` del seed (parte de T-203, que queda reducida a la organización y la temporada);
- un ayudante `crearClubDePrueba` en `test/db.ts`, y su uso en cuatro archivos de test.

Es exactamente el efecto que la tarea anticipaba —«el seed y los tests inventan `club_id`
libremente»— sólo que medido en tests rotos en vez de en filas huérfanas. Que los tests tengan que
crear un club de verdad no es un costo: es que se parecen un poco más a la realidad.

### Pendiente declarado

- **La reparación de datos no tiene test automatizado**, sólo evidencia manual (la tabla de
  arriba). Probarla exigiría un arnés que aplique migraciones hasta la N-1, siembre datos legados
  y aplique la N — no existe hoy. Como la migración corre una sola vez, el costo de construir ese
  arnés no se justifica todavía; si aparece una segunda migración de datos, sí.
- `person_organization.organization_id` quedó con llave foránea, pero **no hay ninguna
  organización** en el seed: entra con T-203.

---

## T-203 — El seed deja un club de ejemplo completo

**Fecha:** 2026-08-11 · 2 tests nuevos (73 de integración en total)

T-202 ya había adelantado la fila `club` por necesidad —sin ella el seed fallaba en la primera
categoría—. Esta tarea completa lo que faltaba: **una organización** (`Escuela de ejemplo`), **una
temporada abierta con fechas reales** (2026, año calendario, D-020-03) y el **vínculo de cada
persona con la organización**.

El vínculo no estaba pedido explícitamente y se agregó por una razón concreta: sin ninguna fila en
`person_organization`, un `organization_admin` no tiene sobre qué actuar, y R-010-04 —la regla de
que no puede salirse de su organización— no se puede probar contra datos reales. Ahora el seed deja
el escenario armado para T-223.

Todo con `upsert` sobre claves únicas reales (`(club_id, name)` en ambas tablas), así que la
idempotencia que exige T-006 se mantiene: el test cuenta clubes, organizaciones, temporadas y
vínculos antes y después de una segunda corrida, y exige que no cambien.

Dos comprobaciones nuevas que no son de conteo:

- **El club de ejemplo queda `active` y con slug propio** (`club-demo`), a diferencia de los clubes
  que T-202 creó para datos huérfanos, que quedan suspendidos y con slug generado. El test lo fija
  para que la distinción no se pierda.
- **La temporada está abierta y tiene fechas reales**, no una ventana ficticia permanente: es la
  decisión D-020-03 del spec, y se comprueba en la fila, no en la intención.

---

## T-210 — `validateSlug`: la forma del subdominio, que es la forma del tenant

**Fecha:** 2026-08-11 · 29 tests de dominio + 2 de integración · dominio al 100 % (125 tests)

### La regla está escrita dos veces, y por eso hay un test que las compara

El formato vive en `packages/domain/tenant/slug.ts` **y** en el `CHECK club_slug_formato` de la
migración T-201. La duplicación es deliberada: la base protege de cualquier vía de escritura
—un script, una migración, un `psql`—, y el dominio protege de aceptar algo y fallar después. Pero
si las dos se separan, el usuario recibe un `500` donde debería recibir un mensaje claro.

Dos tests de integración vigilan la relación en las dos direcciones: **todo lo que el dominio
acepta, la base lo acepta**, y **todo lo que la base rechaza por formato, el dominio ya lo había
rechazado**. El segundo distingue el rechazo por formato del choque con el índice único (`P2002`),
porque un slug repetido significa que el formato **sí** pasó — el motor llegó hasta la unicidad.

Escribir bien ese test costó dos intentos: la primera versión insertaba el texto crudo en vez del
normalizado y daba por «contradicción» que `LosPinos` fuera rechazado por la base. No lo es: el
contrato del dominio es «validá y guardá lo que te devuelvo», no «guardá lo que escribió el
usuario».

### Normaliza lo que no cambia el significado, y nada más

Recorta espacios y baja a minúsculas. **No** convierte «Los Pinos» en `los-pinos` por su cuenta:
arreglarlo en silencio parece amable hasta que el club descubre que su dirección —la que va impresa
en el correo de invitación de todos sus socios— no es la que creyó elegir. Se rechaza diciendo qué
pasa.

Los motivos de rechazo se distinguen (`slug_muy_corto`, `slug_formato_invalido`,
`slug_reservado`…) porque cada uno merece un mensaje distinto para quien está creando el club.

### Una adición que no estaba en el spec: subdominios reservados

`www`, `api`, `admin`, `app`, `static`, `assets`, `mail`, `staging`, `localhost`. Si un club tomara
uno de esos, el caso feo no es que falle: es que **funcione**, y que el club quede servido en una
dirección que el resto del sistema —o el navegador de cualquiera— espera que sea otra cosa.

La lista se mantiene corta a propósito, y hay un test que lo exige: cada nombre reservado es un
nombre que un cliente real no puede usar, y reservar de más es tan malo como reservar de menos. La
reserva es exacta, no por parecido: `api-polo` y `mi-app` son válidos.

### Pendiente declarado

- El límite de 63 caracteres es el de **una etiqueta** de nombre de host (RFC 1035). El nombre
  completo (`<slug>.<dominio>`) tiene su propio límite de 253, que sólo se puede comprobar cuando
  se conozca el dominio de la instalación — entra con la configuración de despliegue, no aquí.
