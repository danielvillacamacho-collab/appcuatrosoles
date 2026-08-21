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

## Pendientes

<!-- Los nuevos van arriba. Al cerrar uno, se marca y se anota en una línea qué se hizo. -->

_(vacío por ahora — el primer lote de pruebas todavía no llega)_

## Cerrados

<!-- Se conservan: la lista de lo que el uso real destapó vale para decidir qué construir después. -->

_(vacío)_
