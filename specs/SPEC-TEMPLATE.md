# SPEC-NNN — Título del módulo

> Estado: draft | ready | in-progress | done · Depende de: <NNN, NNN> · Fuente: <PRD §X / decisión D-XX>

Instrucciones de uso de esta plantilla (borrar esta sección al llenar el spec):
- Este documento dice **qué** y **por qué**. No contiene nombres de clases, de tablas ni de
  endpoints con su firma completa — eso vive en `plan.md`, que se escribe después y sólo
  cuando este spec ya está aceptado.
- Donde falte información del negocio real: **se pregunta, no se asume**. Si de todos modos
  hay que tomar un supuesto para poder seguir, se marca `[SUPUESTO]` inline y se explica qué
  se decidió y por qué — nunca se decide en silencio dentro del código más adelante.
- Cada spec se valida contra `memory/constitution.md` antes de aceptarse: si algo aquí
  contradice un principio (dinero en float, una regla de polo que necesita vivir en SQL,
  una tabla sin `club_id`), se corrige el spec, no se ignora el principio.

## 1. Problema

Qué le pasa hoy al club sin esto. En una o dos frases, sin jerga técnica — esta sección la
tiene que poder leer alguien del club y reconocer su propio problema.

## 2. Resultado esperado

Qué existe cuando el módulo está terminado, descrito como comportamiento observable, no como
lista de features.

## 3. Fuera de alcance (en esta versión)

Lo que deliberadamente no se construye ahora, para que nadie lo asuma incluido. Si el PRD
(`docs/source`) lo menciona como "no incluye por ahora", se referencia aquí explícitamente.

## 4. Actores

| Rol | Puede |
|---|---|
| `<rol>` | `<qué puede hacer en este módulo, en una frase>` |

## 5. Historias de usuario

### HU-NNN-01 — Título corto
**Como** `<rol>` **quiero** `<acción>` **para** `<objetivo>`.

- **Dado** `<contexto>`, **cuando** `<evento>`, **entonces** `<resultado esperado>`.
- **Dado** `<contexto del camino infeliz>`, **cuando** `<evento>`, **entonces** `<rechazo o error esperado>`.

(Repetir una sección `HU-NNN-XX` por cada historia relevante. Cada una necesita al menos un
criterio de camino feliz y uno de camino infeliz — el camino infeliz es el que un revisor
humano atraparía y aquí no hay revisor, `memory/constitution.md` P-13.)

## 6. Reglas de negocio

- `R-NNN-01` Regla enunciada como una condición que el sistema siempre cumple, no como una
  descripción de flujo. Referenciar el `[SUPUESTO]` correspondiente si aplica.

## 7. Datos

Qué entidades de `docs/02-domain-model.md` usa o necesita extender este módulo. Si necesita
una entidad nueva que no está en `docs/02`, se propone aquí y se agrega a `docs/02` al
aceptar el spec — el modelo de dominio es un documento vivo, no se bifurca en specs sueltos.

## 8. Interfaz

```
MÉTODO /ruta                     rol(es) requerido(s)    { payload relevante }
```

Convenciones completas en `docs/03-api-conventions.md`. No se listan aquí los esquemas
completos de Zod (eso es `plan.md`), sólo la forma de la interfaz para poder revisarla.

## 9. Dominio puro

Únicamente si el módulo introduce lógica de negocio no trivial: la firma de las funciones
candidatas a vivir en `packages/domain`, sin implementación.

```ts
function nombreDeLaRegla(entrada: Tipo): Result<Salida, ErrorDeNegocio>
```

## 10. Pantallas

Lista de pantallas nuevas o modificadas, con una frase de qué decisión permite tomar cada una
al usuario. Referenciar `docs/brand` si ya existe un mockup de referencia.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| `<qué puede salir mal, técnico o de negocio>` | `<cómo se reduce o se detecta a tiempo>` |

## 12. Definición de terminado

- [ ] Criterios de aceptación de cada HU cubiertos por un test con nombre legible en español
- [ ] Test de aislamiento de tenant si el recurso pertenece a club/organización
- [ ] Test de autorización (rol permitido y rol denegado) en cada endpoint
- [ ] `docs/02-domain-model.md` actualizado si se agregó una entidad
- [ ] Demostrado en staging antes de producción (`docs/10-operating-manual-solo.md` §5)
