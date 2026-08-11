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

---

## T-211 — `resolveTenant`: a qué club pertenece una solicitud

**Fecha:** 2026-08-11 · 18 tests · dominio al 100 % (143 tests)

Es la función de la que depende el aislamiento entero: si devuelve el club equivocado, todo el
resto del sistema —repositorios, guards, auditoría— trabaja con diligencia sobre el inquilino
equivocado. Por eso no adivina nada.

### El dominio base es un parámetro, y ésa es la decisión importante

`specs/140` §9 anunciaba `resolveTenant(host, clubs)`. Falta un dato: sin saber cuál es el dominio
de la instalación no se puede distinguir `polo.app` —el sitio— de un club llamado «polo», y la
alternativa habitual («tomar lo que está antes del primer punto») convierte el apex en un tenant el
día que alguien registre ese slug. El dominio base es configuración de la instalación (`docs/07`),
no conocimiento del dominio. `specs/140` §9 quedó corregido con la firma real.

### Lo que se rechaza, que es donde vive la seguridad

| Host | Resultado | Por qué importa |
|---|---|---|
| `polo.app` | `sin_subdominio` | el apex es el sitio, no un club |
| `lospinos.otrositio.com` | `host_invalido` | un `Host` falsificado apuntando a nuestro servidor no se interpreta, se rechaza |
| `a.lospinos.polo.app` | `subdominio_invalido` | **no se recorta al primer nivel** |
| `www.polo.app` | `subdominio_invalido` | reservado, aunque alguien registre el slug |
| `moroso.polo.app` (suspendido) | `club_suspendido` | para el cliente, idéntico a que no exista |

**El subdominio de más nivel es la trampa que convierte un bug en una fuga.** Si
`a.lospinos.polo.app` resolviera a «lospinos», cualquiera podría servir un club desde una dirección
que no es la suya — y las cookies de sesión, que se comparten hacia abajo entre subdominios,
viajarían hasta ahí. Se rechaza, no se recorta.

### Los cinco motivos son la misma respuesta para el cliente

`club_desconocido` y `club_suspendido` son motivos distintos **sólo para el log**. Distinguirlos en
la respuesta le confirmaría a un competidor que cierto club es cliente nuestro (R-020-02, P-12). El
guard de T-221 los colapsa en un `404` idéntico, y ahí va el test que compara las respuestas byte a
byte — igual que se hizo con los siete rechazos de `SessionGuard` en T-021.

Queda escrito en el propio tipo, con la prohibición explícita, porque es exactamente la clase de
distinción que alguien convierte en «mensajes más útiles» con la mejor intención.

### Detalles del host que parecen menores y no lo son

Puerto (`:3000` en desarrollo), mayúsculas y **el punto final de un nombre absoluto**
(`lospinos.polo.app.`, que es el mismo host y que una comparación de texto ingenua no reconocería).
Los tres tienen test.

Además hay un test de barrido con nueve formas de colar un host ajeno —prefijos, sufijos, dominios
parecidos, doble punto, `@`, punycode— que exige que la lista de los que pasaron esté **vacía**.

### Pendiente declarado

- **De dónde sale el `Host` en producción** es responsabilidad del despliegue: detrás de un proxy
  inverso, el encabezado tiene que venir de una fuente confiable y configurada explícitamente
  (`plan.md` §5, `docs/07`). Esta función confía en el texto que recibe; quien se lo pasa es quien
  debe garantizar que no lo escribió un cliente.

---

## T-212 — El catálogo de configuración, en código

**Fecha:** 2026-08-11 · 19 tests · dominio al 100 % (162 tests)

Diez claves: las siete de identidad y acceso (`docs/08` §9) y las dos de notificaciones (§10).
Ninguna de módulos que todavía no existen — un catálogo lleno de claves que nadie lee no es
previsión, es ruido con apariencia de contrato. Cada módulo agrega las suyas al llegar.

### El ámbito declarado es el más específico, no el único

`auth.*` es de plataforma, `identity.*` es de club. La regla que se desprende: **fijar una clave en
un ámbito más amplio siempre se puede** —así la plataforma define el default de todos los clubes—
**y en uno más específico, no**. Una clave de plataforma que cada club pudiera cambiar por su
cuenta dejaría de ser una regla de la plataforma, y las reglas de la plataforma existen justamente
porque no son negociables por inquilino.

Ese orden (`platform` < `club` < `organization`) es también la regla de herencia que implementará
T-213, y está escrito una sola vez.

### Dos declaraciones que dicen la verdad sobre el sistema, no sobre el deseo

- **`auth.session_idle_timeout_hours` vale `null`**, es decir «sin cierre por inactividad». `docs/08`
  lo deja «por definir», y `SessionGuard` (T-021) no escribe `last_seen_at`, así que no puede medir
  inactividad. Poner aquí un número —12, 8, lo que fuera— anunciaría un comportamiento que no
  existe, y alguien lo leería como una garantía de seguridad.
- **`identity.waiver_renewal_policy` admite un solo valor**, `on_text_change`. No es una omisión: es
  el único comportamiento implementado (T-013 compara versiones). Listar «anual» prometería algo
  que el código no hace.

Los dos tienen test propio, para que si mañana alguien implementa el comportamiento, el test le
recuerde actualizar la declaración.

### Se valida al escribir, nunca al leer

Un valor mal tipado que entra a la base rompe el módulo que lo lee, en producción, lejos de donde
alguien se equivocó. Al escribir hay una persona mirando la pantalla que puede corregirlo.

Detalles con test: `NaN` e `Infinity` se rechazan aunque JavaScript los considere `number`;
`toString` y `constructor` no son claves válidas (el catálogo se consulta con `Object.hasOwn`, no
con `in`, que las daría por existentes); y **el ámbito se comprueba antes que el tipo**, porque con
el orden inverso un club que intenta cambiar una clave de plataforma con un valor mal escrito
recibiría «tipo inválido», lo corregiría, y volvería a chocar contra el mismo muro.

### Un detalle de TypeScript que costó una corrección

El catálogo se declara con `as const satisfies`, lo que conserva los tipos literales de cada
entrada — y entonces `definicion.allowed` no compila, porque no existe en las claves que no lo
declaran. Se resolvió leyendo el catálogo por el accesor `settingDefinition`, que devuelve el tipo
ancho. Lo atrapó `pnpm typecheck`: los tests pasaban, porque Vitest no comprueba tipos.

### Pendiente declarado

- **El catálogo declara el default, pero nadie lo lee todavía.** Los consumidores llegan con
  T-250/T-251 (API) y con las tareas de la sección D de `specs/010` que usen estos valores
  (T-032 el bloqueo, T-036 el enlace de restablecimiento). Hoy `isInvitationLinkValid` recibe la
  ventana como parámetro y el llamador la inventará hasta que exista el servicio de configuración.
- `docs/08` no distingue qué claves ya están en el catálogo y cuáles no. Cuando el catálogo crezca
  conviene generar esa tabla desde el código, para que no haya dos listas que se contradigan.

---

## T-213 — `resolveSetting`: qué valor rige, y de dónde salió

**Fecha:** 2026-08-11 · 19 tests · dominio al 100 % (181 tests) · **cierra la sección B**

La herencia va de lo específico a lo general —organización → club → plataforma → default del
catálogo— y dentro de un mismo ámbito gana la vigencia más reciente que ya haya empezado. Los
cuatro niveles tienen test, y también el barrido que los recorre quitando uno por uno.

### «Explícito» depende de quién pregunta

Fue el hallazgo de diseño de la tarea. El mismo valor fijado en el club es **explícito** visto desde
el club y **heredado** visto desde una organización: la respuesta no depende sólo de dónde está el
dato sino de desde dónde se lo mira. Para el club es una decisión suya, que se respeta; para la
organización es algo que le viene dado y que quizá quiera cambiar.

Y la distinción que justifica todo el campo: **«el club decidió 18» no es lo mismo que «nadie
decidió nada y 18 es lo que trae el sistema»**, aunque el valor sea idéntico. La primera se respeta;
la segunda se revisa. Sin ese dato, la pantalla de configuración no puede decir cuál es cuál — es
la mitad de HU-020-08, y la mitad que se olvida.

### La historia se consulta, no se reconstruye

Preguntar por una fecha pasada devuelve lo que regía entonces. Es lo que permite explicar un cobro
viejo sin reconstruir nada: «en marzo regía 16». Con test en dos fechas distintas, más el borde del
instante exacto de vigencia (rige **desde** ese momento, no después) y el caso del valor con
vigencia futura, que todavía no rige.

### Dos tests que cubren lo que ningún caso suelto cubre

- **No depende del orden en que lleguen las filas.** Una consulta sin `ORDER BY` no promete
  ninguno, y el código no puede asumirlo. Lo delató la cobertura: la rama «esta fila es más vieja
  que la mejor hasta ahora» no se ejecutaba nunca, porque todos los casos escritos a mano venían
  ordenados. Tres órdenes distintos, mismo resultado.
- **Ninguna combinación de valores ajenos se cuela** (P-05): valores de otro club y de otra
  organización, mezclados y con vigencias distintas, y el resultado sigue siendo el default.

### El `null` se propaga tal cual

`auth.session_idle_timeout_hours` vale `null` en el catálogo —«desactivado»— y `resolveSetting` lo
devuelve así, sin convertirlo en `0`. Quien lo lea tiene que poder distinguir «no hay cierre por
inactividad» de «cerrar de inmediato», que es exactamente lo contrario.

### Pendiente declarado

- La función recibe las filas ya cargadas: **no consulta nada**. Traer sólo las filas relevantes
  —la clave, y los ámbitos del contexto— es trabajo del repositorio (T-250). Pasarle todas las
  filas de la tabla funcionaría, pero convierte una consulta indexada en un recorrido en memoria.
- **`SettingValueRow.key` es `string` y no `SettingKey`**: las filas vienen de la base, donde puede
  haber una clave que el catálogo ya no declara (una que se retiró). Se ignoran al filtrar por
  clave, que es el comportamiento correcto, pero conviene que T-250 las reporte en vez de que
  desaparezcan en silencio.

---

## T-220 — `ClubRepository` y `ClubDirectory`: la lista de clubes en memoria

**Fecha:** 2026-08-11 · 7 tests de integración (82 en total)

`ClubRepository` es **el único repositorio del sistema que consulta sin filtro de tenant, y por
definición tiene que serlo**: es el que resuelve cuál es el tenant. Cualquier otro repositorio que
no filtre por `club_id` es un bug (P-05); éste es la excepción que hace posible la regla, y por eso
vive aparte, con su propio nombre, en vez de esconderse dentro de un servicio genérico.

### La invalidación no es una optimización, es parte de una regla

R-020-04 dice que suspender un club corta el acceso **de inmediato**. Con sólo TTL de 60 segundos
(`docs/06` §1), «de inmediato» sería «dentro de un minuto» — y ese minuto es exactamente el que le
queda a alguien a quien se le acaba de cortar el contrato. Por eso hay `invalidate()`, y por eso
T-231 tendrá que llamarlo.

El test que lo fija está escrito **al revés**, que es como se ve mejor: un club creado después de
la primera lectura **no aparece** hasta invalidar. Si un club nuevo no aparece sin invalidar, un
club suspendido tampoco desaparece.

### Dos cosas que la tarea no pedía y sin las cuales la caché sería un problema

1. **Deduplicación de la carga en curso.** Veinte solicitudes simultáneas con la caché fría
   dispararían veinte consultas idénticas, y el arranque de un proceso es exactamente ese momento.
   Hay un test con veinte llamadas concurrentes que exige **una** consulta.
2. **No servir la copia vieja cuando la base falla.** Es tentador —mantendría el sitio en pie— pero
   esa copia puede contener un club que acaba de ser suspendido, y servirlo es el único error que
   este componente no puede cometer. Falla la solicitud, no el aislamiento. El test comprueba
   además que no queda una carga en curso pegada que envenene la siguiente lectura.

### Los suspendidos también se traen

`resolveTenant` los necesita para distinguir en el log un club que dejó de pagar de un intento a
ciegas — aunque la respuesta al cliente sea idéntica en los dos casos (R-020-02). Omitirlos aquí
obligaría a una segunda consulta para saber cuál es cuál.

### El vencimiento se prueba sin esperar

El test usa un reloj movible inyectado en lugar del `SystemClock`: «pasaron 59 segundos, no
consulta; pasaron 61, consulta». Es la razón por la que `ClockModule` existe desde T-021 — un test
que dependiera del reloj del sistema tardaría un minuto o sería inestable.

### Pendiente declarado

- **Se cachea la lista completa de clubes.** Es correcto para el orden de magnitud de este producto
  (clubes de polo, decenas o cientos) y hace que resolver un tenant no toque la base. Si algún día
  fueran miles, el camino es cachear por slug con la misma invalidación, no agrandar esta lista.
- **La caché es por proceso** (ADR-012: no hay Redis). Con más de una instancia de la API, la
  invalidación de T-231 sólo alcanza al proceso que la ejecuta; los demás tardan hasta un minuto.
  Hoy hay un solo proceso (`docs/07`), así que no es un problema, pero **deja de no serlo el día
  que se escale horizontalmente**, y ese día hay que resolverlo antes de escalar, no después.

---

## T-221 — `TenantGuard`: la solicitud sabe a qué club pertenece antes de tocar nada

**Fecha:** 2026-08-11 · 13 tests de integración (95 en total) · **cierra T-020 de `specs/010`**

T-020 estaba bloqueada desde el 2026-08-10: «ningún club activo» exigía la tabla `club`, que crea
este módulo. Se escribió `specs/020` completo y el guard salió de ahí. La consecuencia práctica es
que **`req.tenant` deja de ser un contrato que sólo llenan dos middlewares de test**: `PermissionGuard`
(T-022b) y `AuditInterceptor` (T-023) ya tienen quién se lo llene de verdad.

### El orden de los guards es parte de la garantía

`TenantGuard` corre **antes** que `SessionGuard`, y no es una preferencia de estilo: `SessionGuard`
consulta la tabla de sesiones y `PermissionGuard` la de roles. Si el tenant se resolviera después,
un host desconocido llegaría a tocar datos de usuarios antes de ser rechazado — y averiguar si una
cuenta existe sería tan fácil como preguntar desde un subdominio inventado.

El criterio literal de la tarea está probado así: con un host desconocido, un espía sobre
`prisma.session.findUnique` **no se llama** y la respuesta es `404`; con un host válido y la misma
cookie inventada, el espía se llama una vez y la respuesta es `401`. Las dos mitades importan: la
primera prueba que no se consulta, la segunda que sí se consultaba y por eso la primera significa
algo.

### Seis formas de no resolver, una sola respuesta

Subdominio inexistente, apex sin subdominio, host de otro dominio, subdominio de más nivel, `www`
y club suspendido: **`404` idéntico byte a byte**, comparado en un test que recorre los seis. Si el
cuerpo delatara el motivo, un competidor podría averiguar desde afuera qué clubes son clientes
nuestros y cuáles dejaron de pagar (R-020-02, P-12). El motivo real va al log, con el host y el
`requestId`, que es donde sirve.

### El host se lee del `Host`, nunca de un `X-Forwarded-Host`

Cualquiera puede escribir ese encabezado; aceptarlo sería dejar que el cliente elija su propio
tenant, que es exactamente lo que R-020-01 prohíbe. Caddy conserva el `Host` original al hacer
proxy (`docs/07`), así que no hace falta nada más — y si algún día hiciera falta, será una decisión
explícita con su ADR, no un `??` agregado de paso.

### Un `Host` ausente no rompe ni concede

HTTP/1.1 lo exige, pero un cliente puede omitirlo. Tiene su test: `404`, como todo lo demás.

### Dos cosas que costaron un test en rojo cada una

1. **Dependencia circular.** El token `BASE_DOMAIN` vivía en `tenant.module.ts`, el guard lo
   importaba de ahí y el módulo importaba el guard. NestJS lo detecta al arrancar, con un mensaje
   claro. El token vive ahora en su propio archivo, y la razón quedó escrita ahí para que nadie lo
   «ordene» de vuelta.
2. **`vi.spyOn` sobre un delegado de Prisma no llama al método real**: el delegado es un proxy, y
   el espía devolvía `undefined`, lo que hacía fallar al `SessionGuard` por una razón ajena a lo
   que se estaba probando. Se ata explícitamente al original.

### Pendiente declarado

- **El guard no se aplica solo**: va con `@UseGuards(TenantGuard, …)`. Cuando exista el primer
  controlador de negocio conviene registrarlo como `APP_GUARD` global con una excepción explícita
  para `/health` y para la ruta pública del club (T-240) — y ahí la garantía pasa a ser completa,
  en vez de depender de que cada controlador lo recuerde.
- **`BASE_DOMAIN` tiene default `localhost`** para que un clon recién hecho funcione sin
  configurar nada. En el despliegue es obligatorio, y su ausencia se nota de inmediato porque
  ningún subdominio real resolvería; queda anotado en `.env.example`.

---

## T-222 — Los seis permisos del módulo, y el día que la tabla sirvió

**Fecha:** 2026-08-11 · 183 tests de dominio (dos reescritos)

`club.edit`, `organization.manage`, `season.manage`, `membership.manage`, `setting.edit` y
`platform.club.manage`. Los dos del medio son las filas de la matriz de `docs/06` §4 que T-022a
había dejado sin nombre canónico; ahora lo tienen, y la matriz quedó actualizada.

### Las tres filas administrativas dejaron de ser idénticas

En T-022a las tres tenían la misma lista de permisos y la diferencia estaba **sólo en el ámbito**.
Quedó anotado entonces que la tabla se escribía completa igual, «porque es la que hace que agregar
un permiso obligue a decidir, rol por rol, quién lo tiene». Hoy se cobró esa decisión:

- un **`organization_admin`** no edita el club, ni sus temporadas, ni sus categorías de membresía;
- un **`club_admin`** no administra la plataforma — un club que pudiera suspender clubes podría
  suspender a otro.

Con una regla implícita —«los administradores pueden todo»— los seis permisos habrían quedado
concedidos por omisión el día que se agregaron, sin que nadie escribiera una línea al respecto.

### Dos tests que fallaron, y por qué eso es la prueba de que sirven

`«club_admin puede todos los permisos del módulo»` y `«organization_admin puede dentro de su
organización»` se pusieron en rojo al agregar los permisos. Estaban afirmando la realidad vieja.
Se reescribieron para afirmar la nueva, y con la forma que resiste el próximo cambio: en vez de
«puede todos», **«los que no puede son exactamente éstos»** — una lista que hay que actualizar a
conciencia, no un bucle que se traga lo que venga.

Los dos tests de propiedad de T-022a siguieron pasando sin tocarlos: ningún rol operativo ganó
autoridad, y los únicos con alguna siguen siendo los tres administradores.

### Pendiente declarado

- **`setting.edit` es el primer permiso cuyo alcance depende del ámbito del valor**, no del recurso
  de la ruta: un `organization_admin` puede fijar la configuración de su organización pero no la
  del club. La puerta gruesa ya lo distingue; el resolvedor que le dice al guard **de qué
  organización se trata** es T-223.

---

## T-223 — El ámbito de organización, resuelto por el guard

**Fecha:** 2026-08-11 · 6 tests de integración (101 en total) · **cierra la sección C**

Era el pendiente declarado de T-022b: hasta hoy, `PermissionGuard` evaluaba siempre contra el club
del tenant, así que un `organization_admin` no pasaba ninguna ruta. Ahora una ruta puede declarar de
dónde sale la organización sobre la que actúa:

```ts
@RequirePermission("organization.manage", { organizacion: { desde: "params", campo: "id" } })
```

**Sólo dos orígenes, y ninguno es adivinar**: el parámetro de la ruta o un campo del cuerpo. Un
tercero —una cabecera, una query— sería una vía más por la que el cliente elige su propio ámbito.

### Una organización de otro club responde 404, nunca 403

Un `403` diría «existe, pero no puedes»; entre inquilinos, esa confirmación ya es una fuga (P-05,
`docs/03` §3). La consulta va **acotada por `club_id`** en vez de traer la fila y comparar después:
así ni siquiera se lee el dato de otro club. Una organización inexistente da la misma respuesta,
que es el punto.

### Lo que queda probado, por rol

| Actor | Su organización | Otra del mismo club | De otro club |
|---|---|---|---|
| `organization_admin` | pasa | `403` | `404` |
| `club_admin` | pasa | pasa | `404` |
| `player` | `403` | `403` | `404` |

### Pendiente declarado

- Un campo declarado que **no llega** en la solicitud responde `404`. Es un error de programación
  —o un cliente probando— y en cualquier caso no hay ámbito que evaluar, así que no se concede. Si
  algún día una ruta necesita «organización opcional», tendrá que decirlo explícitamente, no
  aprovecharse de este silencio.

---

## T-230 y T-231 — Alta, suspensión y reactivación de clubes

**Fecha:** 2026-08-11 · 15 tests de integración (116 en total)

Se hicieron juntas: comparten controlador y servicio, y partirlas significaba escribir el mismo
controlador dos veces.

### Un club nace completo o no nace

Todo el alta va en **una transacción**: club, cinco categorías de membresía, temporada abierta del
año en curso, persona y cuenta del primer administrador, y su rol de `club_admin`. Un club a medio
crear —con su fila pero sin categorías— es peor que ningún club, porque **parece que existe**. Hay
un test que lo fuerza (correo de administrador ya usado) y comprueba que no quedó ni la fila del
club.

Al terminar se **invalida la caché de tenants**: sin eso, el subdominio nuevo respondería `404`
hasta un minuto — justo mientras quien lo creó lo está probando. Tiene test.

### El fallo de diseño que destapó el primer test

Las rutas de plataforma **no llegan por el subdominio de ningún club**, así que no tienen tenant —
pero `PermissionGuard` exigía uno siempre y respondía error interno. Todas las peticiones daban
`500`.

Se resolvió declarándolo en la ruta: `@RequirePermission("platform.club.manage", { plataforma:
true })`. Que haya que decirlo, en vez de deducirlo del nombre del permiso, es deliberado: convertir
una ruta en «de plataforma» es una decisión de seguridad y tiene que verse en la ruta.

### Suspender es tres cosas, no una

R-020-04 dice «de inmediato», y eso significa: marcar el club, **revocar todas las sesiones activas
de su gente**, e invalidar la caché. Sin la segunda, quien ya estaba adentro seguiría trabajando
hasta que su sesión venciera sola; sin la tercera, el subdominio seguiría resolviendo hasta un
minuto más. Las tres tienen test.

**Reactivar no borra `suspendedAt` ni el motivo**: la historia de un corte de servicio es lo que
hace falta si meses después hay una discusión contractual, y el estado ya dice que hoy está activo.
Las sesiones revocadas tampoco vuelven — una sesión cortada durante una suspensión no debería
revivir sola.

### Validación en tres capas, cada una con su código HTTP

| Falla | Respuesta | Quién la detecta |
|---|---|---|
| El cuerpo no cumple el contrato | `400` con los campos | Zod (`ZodValidationPipe` → filtro de T-024) |
| Slug con forma inválida o reservado | `422` con su código | `validateSlug` del dominio |
| Zona horaria inexistente | `422` | `Intl`, no una lista propia — la base de zonas cambia y una lista escrita a mano envejece sin que nadie se entere |
| Slug ya usado | `409` | consulta previa + índice único |
| Rol sin `platform.club.manage` | `403` | `PermissionGuard` |
| Sin sesión | `401` | `SessionGuard` |

### Pendientes declarados

- **La invitación no se envía.** El primer administrador queda `invited` con un hash de contraseña
  inutilizable, pero el correo lo manda `identity.send-invitation` (T-050/T-090 de `specs/010`), que
  todavía no existe. Hoy hay que darle el acceso por otra vía; **el club no es usable de punta a
  punta hasta que esa tarea esté**.
- **La ruta de plataforma se sirve desde cualquier subdominio.** `specs/140` §8 pide **dos**
  condiciones: el permiso *y* que se sirva desde el dominio de administración, no desde el de un
  cliente. La primera está; la segunda es de despliegue (`docs/07`) y entra con `specs/140`.

---

## T-232 — El arranque del primer club

**Fecha:** 2026-08-11 · 5 tests de integración (121 en total)

Resuelve el problema del huevo y la gallina: dar de alta clubes exige `platform.club.manage`, y en
una instalación nueva no hay ningún superadministrador con quien autenticarse para pedirlo.

### No hay ruta HTTP, y hay un test que lo vigila

Es la decisión D-020-04 del spec. Cualquier atajo para el caso inicial —una clave de arranque, una
ruta abierta «sólo la primera vez»— es exactamente el tipo de puerta que después nadie recuerda
cerrar. Correr el script exige acceso al servidor, **que es la única credencial que no se puede
robar por internet**.

El criterio literal de la tarea está probado recorriendo la aplicación entera y exigiendo que
ninguna ruta registrada mencione `bootstrap`, `arranque` ni `first-club`. Si alguien agrega ese
atajo alguna vez, el test lo detiene.

### La creación del club es una sola, compartida

`crearClubCompleto` la usan el alta por API (T-230) y este script. Si cada camino escribiera la
suya, un club creado desde el servidor terminaría distinto de uno creado desde la plataforma —y esa
clase de diferencia no se nota hasta que algo falla sólo en uno de los dos caminos.

### Una diferencia deliberada entre los dos caminos

| | Alta por API (T-230) | Arranque (T-232) |
|---|---|---|
| Estado del administrador | `invited` | **`active`** |
| Contraseña | la define al aceptar la invitación | generada y **mostrada una sola vez** en la terminal |

La razón es concreta: el correo de invitación todavía no existe (T-050 de `specs/010`), y una
cuenta invitada sin forma de recibir la invitación no puede entrar a ningún lado. Aquí la
contraseña se entrega por el canal por el que se corre el script, que es una persona. Tiene test,
para que cuando exista el envío de correo alguien decida explícitamente si esto cambia.

### Idempotencia por la vía más difícil de discutir

Si ya hay **un** club, esta instalación ya fue arrancada: no hace nada y lo dice. No intenta
«completar» lo que falte, que es donde un script de arranque se vuelve peligroso. El test corre la
función dos veces y exige que la segunda no cambie nada.

### Pendiente declarado

- **El superadministrador cuelga del primer club.** Su `person` necesita un `club_id` por el
  esquema, así que se le pone el del club recién creado; su rol, en cambio, es de plataforma, así
  que no manda ahí por ser de ahí sino en todos por ser superadministrador. Es la tensión que
  `specs/140` HU-140-03 resuelve de verdad, con personal que trabaja en varios clubes.

---

## T-240 — Los datos del club, y la única puerta sin sesión

**Fecha:** 2026-08-11 · 13 tests de integración (134 en total)

Tres rutas sobre `clubs/current`: la pública, el detalle y la edición. **Ninguna recibe un
identificador de club** — el club es el del subdominio, porque un `clubId` del cliente nunca
determina el tenant (R-020-01).

### La respuesta pública devuelve exactamente dos campos, y hay un test que lo exige

`name` y `timezone`. Es la única respuesta del sistema que se sirve **sin sesión**, así que todo
campo que se agregue ahí es información que cualquiera puede leer apuntando al subdominio. El test
compara las claves de la respuesta contra la lista completa: **agregar un campo rompe el test a
propósito**, y quien lo agregue tendrá que decidirlo mirando esa línea.

Se construye a mano, campo por campo, y no con un `select` que alguien pueda ampliar sin pensarlo.

### El cruce que el test tenía que cubrir

Un administrador del club A, usando **su cookie válida**, sobre el subdominio del club B: `403`. La
sesión es buena; el permiso se evalúa contra el club del subdominio, que no es el suyo. Es la
combinación que un test de permisos solo, o de tenant solo, no habría cubierto.

### El `slug` no se cambia por aquí

Cambiar el subdominio rompe enlaces y sesiones, así que es una operación de plataforma y no una
edición de perfil (R-020-03). El contrato de edición simplemente no lo declara, y el pipe descarta
lo que el contrato no declara: mandarlo devuelve `200` con el slug intacto. Tiene test.

### Editar invalida la caché

El nombre viaja en la respuesta pública y el directorio guarda una copia del club: sin invalidar,
la pantalla de ingreso mostraría el nombre viejo hasta un minuto después de cambiarlo. Hay un test
que edita y consulta la ruta pública en la misma prueba.

### Pendiente declarado

- `clubDeLaSolicitud` lanza un error de programación si falta el tenant. Es correcto —y evita la
  aserción no-nula que el repo prohíbe— pero **su causa siempre es la misma**: una ruta sin
  `TenantGuard`. Cuando los guards pasen a ser globales (pendiente compartido con T-022b y T-221),
  esa función deja de poder fallar.

---

## T-241 — Organizaciones del club

**Fecha:** 2026-08-11 · 10 tests de integración (144 en total)

### La asimetría entre crear y editar es deliberada

**Crear** es de ámbito de club; **editar y archivar**, de la organización concreta. Así un
`organization_admin` administra la suya —y sólo la suya— pero no puede crear organizaciones nuevas,
que sería ampliarse el terreno por la puerta de al lado. Tiene test: el mismo actor edita la suya
(`200`), no la vecina (`403`) y no puede crear (`403`).

### Se archiva, no se borra

R-020-07 y P-06. Una organización que deja de operar conserva su historia: quién estudió ahí, qué
se cobró, qué clases se dieron. Además, las llaves foráneas de T-202 con su `RESTRICT` ni siquiera
lo permitirían — la regla está en dos capas, como corresponde a las que importan.

### Aislamiento, probado por sus dos lados

- Una organización de **otro club** responde `404`, no `403`: la consulta va acotada por `club_id`,
  así que la fila ajena ni se lee.
- El **mismo nombre** sí se puede usar en dos clubes distintos. Es el error simétrico y el menos
  obvio: una unicidad global habría impedido que el segundo club llamara «Escuela» a la suya.

### Pendiente declarado

- **Desarchivar no existe.** No estaba en el spec y no se inventó: si el club lo necesita, es una
  decisión suya y entra con su propia tarea. Hoy una organización archivada se queda así.

---

## T-242 — Temporadas

**Fecha:** 2026-08-11 · 8 tests de integración (152 en total)

### El solapamiento lo rechaza la base, y el servicio sólo traduce

No hay comprobación previa a propósito. Con un `SELECT` antes del `INSERT`, dos solicitudes
simultáneas leerían «no hay solapamiento» y las dos insertarían — que es exactamente la carrera que
el `EXCLUDE` de T-201 existe para cerrar. El servicio atrapa el error del motor (`23P01`) y lo
traduce a `409` con su código.

Probado con sus tres caras: solapada → `409`, consecutiva (empieza al día siguiente) → `201`, y dos
clubes con **las mismas fechas** → `201`, porque la restricción es por club (P-05).

### Las fechas no se corren un día

La columna es `date` y se serializa cortando el ISO, sin aplicarle zona horaria. Aplicarle una la
correría un día — es la lección de T-014, ahora del lado de la salida. El test compara las cadenas
exactas que se enviaron.

El contrato exige `YYYY-MM-DD` y **rechaza un instante** (`2034-01-01T00:00:00Z`) con `400`: aceptar
las dos formas es cómodo hasta que alguien manda una con hora y zona, y esa hora decide en qué día
cae.

### Una comprobación declarada y vacía, a propósito

`spec.md` HU-020-06 pide que cerrar exija que no queden prácticas ni copas abiertas. Esas tablas las
crean `specs/050` y `specs/060`. La comprobación existe **con su nombre**
(`exigirQueNoQuedeActividadAbierta`) y hoy no hace nada: así quien construya prácticas la encuentra
buscando, en vez de tener que acordarse de un comentario. Cerrar dos veces sí se rechaza (`409`).

### Pendiente declarado

- **No hay reapertura de temporada.** No estaba en el spec y no se inventó. Si el club cierra una
  por error, hoy la corrección es de base de datos — conviene decidirlo antes de la primera
  temporada real.

---

## T-243 — Categorías de membresía

**Fecha:** 2026-08-11 · 8 tests de integración (160 en total) · **cierra la sección E**

Un catálogo administrable, no un enum del código: el club crea las suyas, les cambia la cuota y
desactiva las que no usa, sin desplegar nada (P-04).

### El dinero es entero en las tres capas

El contrato exige `monthlyFeeCents` **entero y no negativo**; el servicio lo convierte a `BigInt`; la
columna es `BigInt` (P-02). Una cuota con decimales responde `400` y una negativa también — con sus
tests. En ningún punto del camino hay un número con coma.

La conversión de vuelta a `Number` para la respuesta es segura y está anotada: el entero seguro de
JavaScript llega a 9·10¹⁵, que en pesos colombianos son noventa billones.

### No hay ruta para eliminar

Se desactiva, ni siquiera se distingue si está en uso. Era más simple que separar los dos casos, y
el caso «no está en uso» es justamente el que no importa: quien tenga esa categoría asignada la
conserva, y su historia también (R-020-07, P-06).

### Cambiar la cuota no reescribe el pasado

`monthly_fee_cents` es el valor **vigente**; los importes ya emitidos quedarán congelados en su
propio cobro (`docs/02` §A) cuando exista `specs/100`. Hoy se prueba la mitad que existe: la
categoría sigue siendo la misma fila y el valor nuevo rige de ahí en adelante. Está anotado en el
test para que quien construya pagos complete la otra mitad.

### Pendiente declarado

- **`membership.category_change_proration` no se aplica** (`docs/08` §7): qué pasa con el mes en
  curso cuando alguien cambia de categoría es una regla de cobro, y vive en `specs/100`. La clave ni
  siquiera está en el catálogo de T-212 todavía, por lo mismo.

---

## T-250 a T-253 — Configuración por API

**Fecha:** 2026-08-11 · 18 tests de integración (178 en total) · **cierra la sección F**

Las cuatro tareas comparten controlador y servicio, así que se hicieron juntas.

### Una familia de rutas por ámbito, y no un `?scope=`

`/platform/settings`, `/settings` y `/organizations/:id/settings`. **El ámbito no puede llegar en
la query**: `PermissionGuard` decide antes de entrar al controlador, así que el ámbito tiene que
estar declarado en la ruta. Con `?scope=platform`, el cliente elegiría contra qué se evalúa su
propio permiso — que es la definición de no tener permisos.

Probado por los dos lados: un `club_admin` recibe `422` si intenta fijar una clave de plataforma por
su ruta, y `403` si lo intenta por la ruta de plataforma. Dos códigos distintos porque son dos cosas
distintas: la primera es «esa clave no es tuya», la segunda es «esa puerta no es tuya».

### Se listan todas las claves del catálogo, no sólo las fijadas

Una pantalla de configuración que sólo muestre lo que alguien tocó es una pantalla donde no se puede
**descubrir** qué se puede configurar. El test compara la cantidad con el tamaño del catálogo, así
que agregar una clave sin exponerla rompe el test.

### Lo que el primer test descubrió sobre el catálogo

**Ninguna clave del catálogo es hoy de ámbito de organización** (las de `auth.*` son de plataforma,
las de `identity.*` de club). Es decir: la ruta de organización sólo puede **rechazar**, y así quedó
probado — fijar una clave de club desde una organización responde `422`, porque el ámbito declarado
es el más específico en el que se puede fijar (T-212). Si una organización pudiera sobreescribirla,
dejaría de ser una decisión del club.

La herencia hacia abajo sí funciona y tiene test (la organización ve el valor del club como
`inherited`). El primer módulo que agregue una clave de organización estrenará el resto de la ruta.

### La historia, vista desde afuera

Fijar un valor **inserta una fila**, nunca actualiza (R-020-08). El histórico se sirve del más
reciente al más viejo, `?asOf=` devuelve lo que regía en esa fecha, y un valor con vigencia futura
todavía no rige. Los tres con test — es la mitad de HU-020-08 que permite explicar un cobro viejo
sin reconstruir nada.

### La auditoría del cambio

Cada cambio deja **exactamente una** fila con el valor anterior y el nuevo, y un cambio rechazado no
deja ninguna: no hubo cambio que auditar (T-023). El `entityId` es **la clave**, no el identificador
de la fila: una fila de `setting` es un cambio, no una cosa, y lo que alguien va a buscar meses
después es «qué pasó con esta clave».

El «antes» lo aporta el controlador con `anotarEstadoPrevio`, que es exactamente el hueco que T-023
dejó abierto para los servicios.

### Pendiente declarado

- **Nadie lee todavía estos valores para decidir nada.** El catálogo y la API existen; los
  consumidores llegan con las tareas de `specs/010` que los necesitan (T-032 el bloqueo por
  intentos, T-036 el enlace de restablecimiento) y con cada módulo nuevo. Hasta entonces P-04 se
  cumple en el diseño, no en el comportamiento.
- **`asOf` inválido se ignora en silencio** y se usa «ahora». Es lo más benigno para una pantalla,
  pero conviene revisarlo cuando exista un consumidor real que dependa de la fecha.

---

## T-260 — Un club nuevo, de cero a operativo

**Fecha:** 2026-08-11 · 2 tests (`pnpm test:e2e`)

El recorrido completo en un solo test: alta del club → el subdominio resuelve en el acto → el
administrador entra → el club ya trae sus cinco categorías y su temporada → crea su organización →
ajusta una cuota y una regla de configuración → todo queda auditado, cada acción una sola vez → y
nada de eso se ve desde otro club.

**La medida de HU-020-02 («horas, no días») está escrita como regla del test**: cada paso que este
archivo necesite hacer *a mano* contra la base de datos es un paso que en la vida real alguien
tendría que hacer por fuera de la plataforma. Hoy hay **uno**, y está marcado: armar la sesión,
porque `POST /auth/login` es T-030 de `specs/010` y todavía no existe. Cuando exista, ese bloque se
reemplaza por la llamada real y el recorrido deja de tocar la base.

**No es el E2E de navegador** que pide `docs/05` §7: `apps/web` no tiene todavía estas pantallas.
Está dicho en el propio archivo para que nadie lo dé por cubierto.

El segundo test cierra el ciclo: suspender el club corta el acceso por su subdominio.

---

## T-261 — Aislamiento por ruta, y la fuga que encontró

**Fecha:** 2026-08-11 · 3 tests (`pnpm check:isolation`)

### El mecanismo, no sólo las pruebas

ADR-014 punto 3 pide «una prueba de aislamiento por cada ruta registrada». Este archivo **enumera
las rutas que la aplicación tiene montadas** y exige que cada una esté declarada, con lo que se
espera de ella cuando la llama alguien de otro club. Una ruta nueva sin su caso hace fallar la
suite; una declaración que sobra —de una ruta borrada— también, porque una lista llena de rutas
inexistentes deja de decir nada sobre la aplicación real.

Las categorías son tres: `ajeno` (recibe el identificador de un recurso de otro club → `404`, nunca
`403`), `vacio` (listado → ni un dato ajeno) y `propio` (opera sobre el club del subdominio → su
respuesta no puede contener nada del otro).

### La fuga que encontró

**`GET /organizations/:id/settings` devolvía la configuración de una organización de otro club.** La
consulta de filas relevantes incluye el ámbito de organización tal como se lo pasan, así que traía
valores de otro inquilino. Las rutas que **escriben** ya estaban cubiertas por `PermissionGuard`
—que resuelve el ámbito y rechaza con `404`—, pero las de **lectura** no pasan por él, y ahí no
había nadie comprobando.

Corregido en el servicio, con la razón escrita en el código. Es exactamente el tipo de hueco que
esta suite existe para encontrar: no lo habría atrapado ningún test de la ruta escrito por quien la
escribió, porque quien la escribe prueba lo que quiso hacer.

### Pendiente declarado

- La comprobación de rutas es **por lo que declara el decorador**, no por lo que hace el servicio.
  Una ruta declarada como `propio` que internamente aceptara un identificador ajeno pasaría. Cubrir
  eso exigiría analizar el cuerpo de cada handler; lo que sí queda cubierto es que **ninguna ruta
  puede existir sin decisión explícita**.
