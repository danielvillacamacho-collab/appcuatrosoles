# 05 — Estrategia de pruebas

Existe por la misma razón que `memory/constitution.md` P-13: no hay revisor humano, así que
la prueba automática es el único control de calidad real (`ADR-014`,
`docs/10-operating-manual-solo.md`).

## 1. Pirámide

```
        ▲  E2E (Playwright) — flujos críticos completos, pocos, lentos, en CI y antes de deploy
       ▲▲  Integración (Supertest + Testcontainers) — endpoint real contra Postgres real
      ▲▲▲  Unitarias (Vitest) — packages/domain principalmente, la mayoría de los tests
```

La mayoría de los tests viven en `packages/domain`, porque ahí vive la mayoría de la
complejidad real (P-01). Un endpoint que sólo llama al dominio y guarda no necesita muchos
casos unitarios propios; necesita un test de integración que confirme el cableado.

## 2. Umbrales que rompen el build (`pnpm test:cov`)

| Alcance | Mínimo |
|---|---|
| Global del repo | 50 % |
| `packages/domain` | 85 % |
| Guards y policies de autorización | 90 % |

**Bajar un umbral para que pase el build está prohibido** (`CLAUDE.md` regla de oro 12). Si
un umbral falla, la respuesta siempre es escribir el test que falta, nunca ajustar el número.

## 3. Qué trae obligatoriamente todo endpoint nuevo (`ADR-014` punto 4 y 6)

1. **Test de contrato**: la respuesta real (contra Postgres de prueba) valida contra el
   esquema Zod de `packages/contracts`.
2. **Test de autorización**: al menos un rol permitido que entra, y un rol denegado que
   recibe `403` (o `404` si es cross-tenant, ver §4).
3. **Test de camino infeliz**: el caso donde el negocio rechaza la acción (cupo lleno,
   ventana de cancelación vencida, handicap fuera de rango) — no basta con el camino feliz.
4. **Test de aislamiento de tenant** (si el recurso pertenece a un club/organización): un
   usuario de otro club pide el mismo id y recibe `404`.

Un endpoint sin estos cuatro no se considera terminado, sin importar que "funcione" en manual.

## 4. Nombres de test — la regla que hace posible revisar sin leer código

`docs/10-operating-manual-solo.md` §3: Daniel revisa leyendo el nombre del test, no la
implementación. Por eso el nombre describe la regla de negocio en español, en el formato del
PRD (`Dado…cuando…entonces`), no el nombre técnico de la función:

```ts
// MAL — no dice nada sin leer el cuerpo
it('should handle half man correctly', () => { ... })

// BIEN — se lee como el spec
it('medio hombre: handicap 2 y 4 → el puesto pesa 4, no 6 ni 3', () => { ... })
it('práctica a 6 chukkers con 4 postulados a las 6pm → se cancela automáticamente', () => { ... })
it('usuario del club A pide una práctica del club B por id → 404', () => { ... })
```

Si un test no se puede leer así, no protege al proyecto — se reescribe antes de aceptarse.

## 5. Testcontainers, no mocks de base de datos

Los tests de integración corren contra una instancia real de PostgreSQL 16 levantada por
Testcontainers, con las mismas extensiones y constraints que producción (incluido
`EXCLUDE USING gist`). Mockear el cliente de Prisma para probar una regla que depende de una
restricción de base de datos (doble reserva de cancha) no prueba nada — probaría que el mock
hace lo que el mock dice, no que la base de datos lo impide.

## 6. Migraciones

Toda migración se prueba en CI aplicando `up` y luego `down` contra Postgres real
(`ADR-014` punto 5). Una migración que no revierte limpio no se acepta, incluso si `up` es
correcto — el día que haga falta un rollback en producción no es el momento de descubrir que
`down` estaba mal escrito.

**Prisma no genera el `down` por sí solo** (sus migraciones son sólo hacia adelante). Por eso
cada carpeta de migración lleva, al lado de su `migration.sql`, un `down.sql`. No se escribe a
mano: lo genera un script, porque hacerlo a mano es exactamente donde se cuela el error que
sólo se descubre el día del rollback.

```bash
pnpm db:down-sql                 # la última migración
pnpm db:down-sql <nombre_migra>  # una concreta
```

El script reconstruye **los dos extremos** del diff desde las carpetas de migración: el estado
«después de N» y el estado «después de N-1». Así el `down` deshace exactamente una migración.

> **La trampa que esto evita** (encontrada al construir T-002, vale la pena entenderla):
> si el `down` se genera comparando contra el *esquema actual*, el resultado incluye deshacer
> también las migraciones **posteriores**. El `down` de T-001, generado así, salía borrando las
> tablas de T-002 — y encadenar reversiones habría fallado al intentar borrar algo ya borrado.
> Un `down` sólo se prueba de verdad el día del rollback, que es el peor momento para
> descubrirlo.

**Se revierten en orden inverso** (primero la última, después la anterior): cada `down.sql`
asume que las migraciones posteriores ya se revirtieron. Verificado en T-002 con el ciclo
completo — revertir las dos en cascada deja la base vacía sin un solo error, y volver a
aplicarlas la reconstruye entera.

Necesita una base de datos «sombra» que Prisma usa para reconstruir el estado intermedio; el
script la crea si no existe. Es una herramienta de desarrollo local: el CI no genera `down.sql`,
sólo comprueba que exista y lo ejecuta.

**Revertir una migración son dos pasos, no uno:** aplicar su `down.sql` **y** borrar su fila
de `_prisma_migrations`. Sin el segundo paso, Prisma cree que sigue aplicada y no la vuelve a
correr. El CI hace exactamente esos dos pasos y luego re-aplica, y **falla si una migración
llega sin su `down.sql`**.

> No se usa `prisma migrate reset` en automatizaciones: es destructivo (borra la base
> completa) y Prisma 6 lo bloquea cuando lo invoca un agente sin consentimiento explícito.
> Para rehacer la base local desde cero, córrelo tú a mano.

## 7. E2E — pocos, pero de los flujos que de verdad importan

Playwright cubre los flujos que, si se rompen, paran la operación real del club, no cada
combinación posible de UI:

- Login → ver panel según rol.
- Postularse a una práctica → decisión automática (confirmar/cancelar) con el reloj fijado.
- Comprar un paquete de clases → reservar → cancelar dentro y fuera de la ventana → verificar
  el ledger.
- Cierre por clima → confirmar que nada se cobra ni se descuenta.

Se corren en CI antes de cada despliegue a staging; no en cada commit (son lentos) sino en el
pipeline de release.

## 8. Datos de prueba

`pnpm db:seed` genera un club de ejemplo completo (personas, roles, canchas, una práctica
publicada) para desarrollo manual y para que los E2E no dependan de fixtures ad hoc dispersos
por archivo. Un seed desactualizado respecto al esquema es un bug, se corrige de inmediato.

## 9. Lo que no se prueba (a propósito)

Estilos visuales pixel-perfect, textos exactos de copy (eso lo revisa una persona viendo la
pantalla, `docs/10` §3 punto 4), y comportamiento de librerías de terceros ya probadas
(Radix, TanStack). El esfuerzo de test se concentra donde vive el riesgo real: dinero,
permisos, aislamiento entre clubes, y las reglas matemáticas del polo.
