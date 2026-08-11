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
