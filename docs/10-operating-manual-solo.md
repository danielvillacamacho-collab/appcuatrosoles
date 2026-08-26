# 10 — Manual de operación: construir solo con Claude Code

Este documento existe por la decisión D-04: no habrá otro ingeniero revisando el código. La
revisión humana es el control de calidad que se pierde. Lo que sigue lo reemplaza.

Está escrito para leerse una vez completo y volver a consultarse por secciones.

---

## 1. Lo que cambia cuando no hay revisor

Un agente que escribe código produce, casi siempre, código que **funciona en el caso feliz**.
Lo que un revisor humano detecta y el agente no suele mirar solo es:

- El camino infeliz que nadie probó.
- El permiso que se olvidó en el endpoint nuevo.
- La consulta que se olvidó de filtrar por club.
- La regla de negocio implementada dos veces, con dos criterios distintos.
- La deriva: la sesión 40 hace las cosas distinto a la sesión 3.

De esos cinco, **cuatro se pueden automatizar** y están automatizados en el CI
(`ADR-014`). El quinto —la deriva— es humano y se combate con ritmo, no con herramientas:
tareas pequeñas y revisión al cerrar cada fase.

---

## 2. Reglas de sesión

**Una tarea, una sesión, un commit.** No pidas "implementa la fase 3". Pide "implementa
T-024". Cuando termine, revisa, haz commit y abre sesión nueva. El contexto acumulado es la
principal fuente de deriva.

**Empieza cada sesión igual:**
```
Lee CLAUDE.md, memory/constitution.md y specs/<NNN>/tasks.md.
Implementa la tarea T-0XX. No toques nada fuera de su alcance.
Al terminar: corre pnpm lint, typecheck y test, y muéstrame el diff completo.
```

**Termina cada sesión igual:** que el agente diga qué archivos tocó, qué tests agregó, y qué
quedó pendiente. Si tocó archivos que no esperabas, no hagas commit: pregunta por qué.

**Detente cuando:**
- El diff toca más de 5 archivos o supera 400 líneas → la tarea estaba mal partida.
- El agente propone instalar una dependencia que no está en `docs/00` → pídele que justifique
  y que diga qué descartó. Si no convence, di que no.
- El agente dice "voy a refactorizar de paso" → no. El refactor es su propia tarea.
- Dos intentos seguidos fallan los tests por la misma razón → el problema es el spec, no el
  código. Vuelve al spec.

---

## 3. Cómo revisar sin saber leer código a fondo

No tienes que evaluar la elegancia del código. Tienes que verificar cinco cosas, y todas se
pueden ver sin entender la implementación:

1. **¿Los tests nuevos describen la regla en español?** Deben leerse como
   `"medio hombre 2 y 4 → el puesto pesa 4"`. Si los nombres de los tests no te dicen nada,
   pide que los reescriba. Un test que no puedes leer no te protege.
2. **¿Pasó el CI completo?** Si algún gate falló y el agente lo "arregló" bajando un umbral o
   agregando una excepción, eso es una regresión disfrazada. Está prohibido.
3. **¿El diff toca sólo lo de la tarea?** Archivos inesperados = alcance descontrolado.
4. **¿Funciona en el celular?** Abre la pantalla en tu teléfono. Es la prueba que ninguna
   automatización reemplaza y la que más importa en este producto. Ver §3.1: hay un comando.
5. **¿Puedes explicar en una frase qué hace el cambio?** Si no puedes, pídele al agente que
   te lo explique. Si su explicación no coincide con la tarea, algo se desvió.

### 3.1. Cómo abrirlo en el teléfono

```bash
pnpm dev:celular
```

Imprime una dirección como `http://club-demo.192-168-1-51.nip.io:5173` y la abres en el teléfono,
**conectado al mismo wifi**. No hay que instalar ni configurar nada en el celular.

Por qué hace falta un comando en vez de escribir la IP a mano: el club se resuelve por
**subdominio** (`ADR-013`), y `club-demo.localhost` sólo existe dentro del computador. `nip.io` es
un DNS público que devuelve la IP escrita en el propio nombre, así que `club-demo.192-168-1-51.nip.io`
resuelve desde cualquier dispositivo con internet. Es una herramienta de desarrollo: no entra en
producción ni en CI.

Antes de la primera vez, con Docker levantado:

```bash
pnpm db:migrate:deploy && pnpm db:seed
```

La cuenta de ejemplo es `admin@club-demo.test` con contraseña `demo1234`. **Los correos no salen a
internet**: se escriben como `.html` en `apps/api/.correos` y se abren desde el computador (`ADR-008`
— SES entra con el despliegue). Así se prueba una invitación completa sin depender de AWS.

Si el teléfono no carga nada, casi siempre es el cortafuegos de macOS bloqueando las conexiones
entrantes al proceso de Node.

---

## 4. Los tres momentos en que sí conviene un par de ojos externos

No es supervisión permanente: son tres revisiones puntuales, de dos a cuatro horas cada una,
que un ingeniero senior externo puede hacer por contrato. Recomiendo no saltárselas:

1. **Antes del primer despliegue con gente real** (fin de Fase 1). Foco: autenticación,
   sesiones, permisos y backups. Lo que se rompe aquí expone datos de personas, incluidos
   menores de edad.
2. **Antes de mover dinero real** (fin de Fase 3). Foco: idempotencia de webhooks,
   conciliación, ledger de bolsas y liquidación entre entidades. Un error aquí no se nota
   hasta que alguien reclama, y para entonces ya pasó tres meses.
3. **Antes del segundo cliente** (inicio de la fase multi-club). Foco exclusivo: aislamiento
   entre clubes. Es el riesgo que puede terminar el negocio, no sólo el proyecto.

El costo de las tres juntas es marginal frente a lo que protegen.

---

## 5. Rutina semanal

| Cuándo | Qué |
|---|---|
| Cada día que programes | Antes de empezar: `git pull`, CI en verde. Al terminar: commit y push |
| Lunes | Revisar el `tasks.md` de la semana; ajustar lo que la realidad cambió |
| Viernes | Desplegar a staging y usar la aplicación 20 minutos **desde tu celular**, como usuario |
| Primer lunes del mes | Restaurar el backup en una instancia efímera y verificar que los datos están. Un backup no verificado no es un backup |
| Fin de cada fase | Demostración al club en staging, antes de tocar producción |

---

## 6. Qué hacer cuando algo se rompe en producción

En orden, sin improvisar:

1. **Rollback primero, diagnóstico después.** `./infra/rollback.sh <tag-anterior>`. La
   plataforma vuelve a la versión que funcionaba en menos de dos minutos.
2. Mira `/api/health` y `/api/ready`. Si `ready` falla, es base de datos o disco.
3. Busca el `X-Request-Id` que reportó el usuario en Sentry: te lleva a la traza exacta.
4. Si los datos se corrompieron, **no toques la base de datos a mano**. Restaura el backup a
   una instancia aparte, verifica, y recién ahí decide.
5. Escribe qué pasó en `docs/incidents/AAAA-MM-DD.md`. Tres líneas bastan. La memoria de una
   persona sola es el punto más frágil del sistema.

**Nunca:** editar datos directamente en producción con SQL, desplegar un viernes por la
tarde, ni desactivar un gate de CI para sacar algo urgente.

---

## 7. Señales de que el proyecto se está desviando

- Los `tasks.md` dejan de actualizarse y trabajas "de memoria".
- Empiezas a aceptar diffs sin leerlos porque hay prisa.
- Los tests tardan tanto que los saltas localmente.
- Aparece una segunda forma de hacer lo mismo (dos maneras de calcular una tarifa, dos
  clientes HTTP, dos formas de manejar fechas).
- Llevas más de dos semanas sin desplegar nada a staging.

Cualquiera de estas cinco justifica parar una semana y ordenar antes de seguir.

---

## 8. Lo que no debes delegarle al agente

- **Decidir el alcance.** Qué se construye y qué no es tuyo.
- **Aceptar un cambio de spec sobre la marcha.** Si el agente propone hacer algo distinto de
  lo especificado, decide tú y actualiza el spec primero.
- **Manejar secretos.** Las llaves de Wompi, de SES y de AWS las cargas tú en la EC2. Nunca
  van a un archivo del repositorio, ni siquiera "temporalmente".
- **Interpretar lo que quiere el club.** El agente no estuvo en la conversación con Martín.

---

## 9. Presupuesto de tiempo realista

Con la Fase 0 ya montada, y trabajando con este método, una tarea típica de `tasks.md` toma
entre 30 y 90 minutos, incluyendo revisión y commit. El módulo 010 son 65 tareas.

La trampa habitual es la Fase 0: montar el andamiaje se siente lento y sin resultado visible.
Es la inversión que hace que las 400 tareas siguientes salgan bien. No la recortes.

---

## Cuando alguien reporta un error

El circuito está probado y es corto: la pantalla muestra un código, y ese código está en el log del
servidor con la causa y el stack.

```bash
docker compose -f /srv/cuatrosoles/docker-compose.yml logs api | grep req_XXXXXXXX
```

El detalle de cuándo aparece el código y cuánto duran los logs está en
`docs/12-hallazgos-de-pruebas.md`, que es donde vive el proceso de reportes.
