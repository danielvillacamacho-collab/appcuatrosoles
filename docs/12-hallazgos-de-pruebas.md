# 12 — Hallazgos de las pruebas con el club

> Dónde cae lo que encuentra la gente de Cuatro Soles usando el producto, y qué se hace con eso.
>
> Este archivo es **la bandeja de entrada**, no el plan. Lo que se decide construir sale de acá y
> termina en un `spec.md`; lo que se decide corregir termina en un commit. Nada se queda acá para
> siempre.

## Cómo reportar

**Con una línea alcanza.** Es mejor un reporte corto hoy que uno completo la semana que viene.

```
- [ ] Qué pasó · quién · en qué pantalla · (si salió un código de error, cuál)
```

Si en la pantalla apareció **«repórtalo con este código»**, copiarlo es lo más útil de todo: con ese
código encontramos en el servidor exactamente qué falló, sin adivinar.

> **Lo que no hace falta:** reproducirlo, sacar capturas, ni saber si es «bug o mejora». Eso lo
> separamos nosotros; pedirlo por adelantado es la forma más común de que la gente deje de
> reportar.

## Cómo se procesa

Cada lote se revisa junto y cada punto termina en **una de cuatro** cajas. La caja importa porque
decide qué pasa después, no qué tan grave es:

| Caja | Qué es | Qué pasa |
|---|---|---|
| **Falla** | Algo que debería funcionar y no funciona | Se corrige, con un test que falle antes del arreglo |
| **Falta** | Algo que hace falta y nunca se construyó | Va a un `spec.md`, con el resto del ciclo |
| **Fricción** | Funciona, pero cuesta usarlo | Se acumula; varias juntas suelen apuntar a una pantalla mal pensada |
| **Otra cosa** | Lo que se creía que era, no era | Cambia un supuesto: se actualiza `docs/09` y el spec del módulo |

La cuarta es la más valiosa y la que sólo aparece con uso real. Las tres primeras las encuentra
cualquiera; que un supuesto del producto esté equivocado sólo lo descubre alguien usándolo para
trabajar.

## Qué hacer con un código de error

Cuando la pantalla dice **«repórtalo con el código de la solicitud»**, ese código no es decorativo:
es lo que convierte «no me dejó guardar» en la línea exacta del log, con la causa y el punto del
código donde ocurrió.

En el servidor:

```bash
docker compose -f /srv/cuatrosoles/docker-compose.yml logs api | grep req_XXXXXXXX
```

Sale una línea con el error completo. El campo `err.message` dice **qué** pasó y `err.stack`
**dónde**. Comprobado de punta a punta: se provocó un error de verdad, la pantalla devolvió un
código, y ese código apareció una sola vez en el log con la causa exacta.

Dos cosas que conviene saber antes de necesitarlas:

- **El código sólo aparece cuando el error es inesperado.** Si la pantalla explicó el problema —«esa
  cancha ya está ocupada»— no hay nada que buscar: eso es una regla del club funcionando, y el
  reporte útil es lo que la persona esperaba que pasara.
- **Los logs se rotan**: cinco archivos de 20 MB por servicio. Son varios días, no meses. Un código
  de hace dos semanas puede haberse ido, así que conviene mirar los reportes mientras están frescos.

## Pendientes

<!-- Los nuevos van arriba. Al cerrar uno, se marca y se anota en una línea qué se hizo. -->

_(vacío por ahora — el primer lote de pruebas todavía no llega)_

## Cerrados

<!-- Se conservan: la lista de lo que el uso real destapó vale para decidir qué construir después. -->

_(vacío)_
