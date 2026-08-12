# Roadmap de construcción

Actualizado tras las decisiones D-01 a D-04 (`docs/09-open-questions.md`).

## Principio de ordenamiento

Se construye por **cadena de valor**, no por capas. Y con una restricción nueva: lo construye
una persona sola. Eso obliga a que cada fase termine en algo que se pueda **poner en manos de
gente real**, porque el único control de calidad verdadero disponible es el uso.

Los Pinos y Cuatro Soles son el **cliente cero**: pagan con feedback y validan el producto
antes de venderlo. No se construye nada pensando en el cliente número cinco antes de que el
cliente cero lo use.

## Dependencias

```
010 identidad ──┬── 020 club/config ──┬── 030 handicaps ──┐
                │                     ├── 040 canchas ────┼── 050 prácticas ─┬─ 051 equipos ── 060 copas
                │                     │                   ├── 070 clases ── 080 coaches
                │                     │                   └── 090 caballos
                ├── 100 pagos ── 105 liquidaciones ── 110 políticas ── 120 avisos ── 130 reportes
                └── 140 plataforma multi-club  (después del cliente cero)
```

## Fases

### Fase 1 — Cimientos (semanas 1-5)
**Módulos:** Fase 0 del andamiaje, 010 completo, 020.
**Entregable:** las personas del club entran, con su perfil, roles y categoría.
**Hito:** cargar las personas reales del club y que todas puedan ingresar desde su celular.
**En paralelo desde el día 1:** dominio, DNS, SES fuera del sandbox.
**Al cerrar:** primera revisión externa de seguridad (§4 del manual de operación).

> Nota: se agregó una semana respecto al plan anterior. El aislamiento multi-tenant y las
> barreras de CI se construyen aquí, no después: retrofitear aislamiento sobre datos reales
> es de las cosas más caras que existen.

### Fase 2 — El corazón (semanas 6-12)
**Módulos:** 030, 040, 050, 110 (parte de prácticas), 120 (avisos de práctica).
**Entregable:** ciclo completo de una práctica: publicar, postularse, decisión automática,
balanceo, grilla, asistencia.
**Hito:** **una semana entera de prácticas organizadas sin un solo mensaje de WhatsApp.**
Aquí el producto se prueba o se cae. Si falla, no se sigue construyendo: se entiende por qué.

### Fase 3 — El negocio (semanas 13-19)
**Módulos:** 070 clases y bolsas, 100 pagos, 105 liquidaciones, 080 coaches, resto de 110 y 120.
**Entregable:** Cuatro Soles opera su agenda, vende paquetes, cobra por link, lleva saldos, y
la posición entre las dos entidades queda clara sin hoja de cálculo.
**Hito:** un mes facturado desde la plataforma, con el saldo cuadrando contra la hoja actual,
y el primer corte de liquidación aprobado y transferido.
**Necesita:** llaves de Wompi (Q-02b) y definir si el club abre su propia cuenta (Q-03b).
**Al cerrar:** segunda revisión externa, foco en dinero.

### Fase 4 — La competencia (semanas 20-25)
**Módulos:** 060 copas.
**Hito:** la primera copa de la temporada corrida completa en la plataforma.
**Recorte previsto si hay presión:** entregar con dos formatos (todos contra todos y
eliminación directa) más "copa libre"; doble eliminación y grupos después.

### Fase 5 — La caballada y la lectura (semanas 26-31)
**Módulos:** 090 caballos y alquiler, 130 reportes y tablero.
**Hito:** los dueños dejan de preguntar por chat qué se le hizo a su caballo.

### Fase 6 — Producto vendible (semanas 32-38)
**Módulos:** 140 plataforma multi-club.
**Entregable:** alta de club por plantilla, subdominios, marca, conmutador de club para
personal de servicio, panel de plataforma.
**Hito comercial:** **un club nuevo operativo en menos de una hora, medido con cronómetro.**
Ese número decide si el servicio de administración tiene margen.
**Al cerrar:** tercera revisión externa, foco exclusivo en aislamiento entre clubes.

> **Por qué la Fase 6 va al final y no al principio.** El modelo de datos ya es multi-tenant
> desde la Fase 1, así que nada hay que rehacer. Lo que se construye en la Fase 6 —plantillas,
> subdominios, conmutador, panel— sólo se puede diseñar bien cuando se sabe cómo opera de
> verdad un club en la plataforma. Construirlo antes es adivinar. Y el segundo cliente no
> compra por las plantillas: compra porque el primero funciona.

## Corte mínimo utilizable

**010 + 040 + 050.** Con eso el club deja de coordinar prácticas por WhatsApp, que es el
dolor que originó el proyecto. Agregando **070 + 100 + 105** se cubre el negocio de
Cuatro Soles.

## Cómo se trabaja cada módulo

```
1. /specify   ya está: specs/<NNN>/spec.md
2. /plan      Claude Code genera specs/<NNN>/plan.md → lo revisas antes de seguir
3. /tasks     Claude Code genera specs/<NNN>/tasks.md
4. implementación tarea por tarea, un commit por tarea, sesión nueva por tarea
5. verification.md con los criterios marcados
6. demostración en staging antes de producción
```

Método de trabajo detallado: `docs/10-operating-manual-solo.md`.

## Riesgos de programa

| Riesgo | Señal temprana | Respuesta |
|---|---|---|
| Fatiga del constructor único | dos semanas sin desplegar a staging | parar, ordenar, reducir alcance de la fase |
| Deriva del agente sin revisor | los diffs tocan archivos no relacionados | tareas más pequeñas, sesión nueva por tarea |
| El módulo de copas se desborda | Fase 4 pasa de la semana 23 sin fixture funcionando | recortar a dos formatos |
| Adopción: la gente vuelve a WhatsApp | falla el hito de la Fase 2 | no seguir construyendo hasta entenderlo |
| Se construye para el cliente cinco antes de tener el uno | aparecen features de plataforma antes de la Fase 6 | volver al roadmap |
| Recaudo entre entidades sin acuerdo escrito | Fase 3 con plata real y sin documento | revisar con el contador antes del primer corte |
