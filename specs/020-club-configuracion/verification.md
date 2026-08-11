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
