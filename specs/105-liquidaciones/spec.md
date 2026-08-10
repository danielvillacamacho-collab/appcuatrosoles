# SPEC-105 — Beneficiario, recaudador y liquidación entre entidades

> Estado: ready · Depende de: 100 · Fuente: decisión D-03

## 1. Problema

El club y Cuatro Soles cobran cosas distintas: el club cobra cuotas, prácticas, taqueos e
inscripciones a copas; Cuatro Soles cobra clases, coaches, pensión de caballos y servicios.
Pero el dinero no siempre entra por la cuenta de quien le pertenece: Cuatro Soles recauda
plata del club y se la transfiere después.

Sin modelar eso, pasa lo de siempre: a fin de mes nadie sabe cuánto le debe una entidad a la
otra, se cuadra a mano en una hoja, y la discusión se resuelve por memoria.

## 2. Resultado esperado

Cada cobro sabe de quién es la plata y quién la recibe. Al cierre de cada período, la
plataforma dice exactamente cuánto le debe Cuatro Soles al club, por qué conceptos, y guarda
el comprobante de la transferencia cuando se hace.

## 3. Fuera de alcance

Contabilidad, impuestos, retenciones, facturación electrónica y transferencias automáticas
entre cuentas bancarias. La plataforma produce el corte y guarda la evidencia; el
movimiento de dinero lo hace una persona por banco.

## 4. Actores

| Rol | Puede |
|---|---|
| Tesorería del club | ver lo que le deben, revisar el detalle, aprobar el corte, marcar recibido |
| Tesorería / admin de organización | ver lo que debe, generar el corte, adjuntar comprobante |
| Superadministrador | ver todo, corregir con auditoría |

## 5. Historias de usuario

### HU-105-01 — Saber de quién es cada peso
**Como** tesorería **quiero** que cada cobro indique beneficiario y recaudador **para** no
mezclar la plata de las dos entidades.

- **Dado** un cobro de clase, **cuando** se emite, **entonces** el beneficiario y el
  recaudador son Cuatro Soles y no genera nada que liquidar.
- **Dado** un cobro de práctica recaudado por Cuatro Soles, **cuando** se emite, **entonces**
  el beneficiario es el club y el recaudador es Cuatro Soles.
- **Dado** ese mismo cobro, **cuando** se marca como pagado, **entonces** —y sólo entonces—
  nace la obligación de Cuatro Soles hacia el club por ese monto.
- **Dado** un cobro anulado o reembolsado, **cuando** ocurre, **entonces** la obligación se
  revierte con un movimiento nuevo, nunca borrando el anterior.

### HU-105-02 — Generar el corte
**Como** tesorería **quiero** un corte por período **para** saber cuánto transferir.

- **Dado** un período, **cuando** genero el corte, **entonces** obtengo el bruto, las
  comisiones de la pasarela, los ajustes y el neto a transferir, con el detalle cobro por cobro.
- **Dado** un corte en borrador, **cuando** agrego un ajuste con motivo, **entonces** el neto
  se recalcula y el ajuste queda registrado con autor.
- **Dado** un corte aprobado, **cuando** intento modificarlo, **entonces** no puedo: se
  corrige con un ajuste en el período siguiente.
- **Dado** un cobro ya incluido en un corte, **cuando** genero el siguiente, **entonces** no
  vuelve a aparecer.

### HU-105-03 — Registrar la transferencia
**Como** tesorería **quiero** dejar constancia del pago entre entidades.

- **Dado** un corte aprobado, **cuando** adjunto el comprobante y lo marco transferido,
  **entonces** queda cerrado con fecha, monto y evidencia.
- **Dado** un corte transferido, **cuando** la otra entidad lo consulta, **entonces** ve el
  comprobante y puede marcarlo recibido.
- **Dado** una discrepancia, **cuando** una entidad la reporta, **entonces** el corte queda
  en observación con la nota y no se cierra hasta resolverse.

### HU-105-04 — Ver la posición
**Como** cualquiera de las dos entidades **quiero** ver mi posición en cualquier momento
**para** no esperar al cierre.

- **Dado** el panel, **cuando** lo abro, **entonces** veo el acumulado pendiente de liquidar
  a la fecha, con su detalle.
- **Dado** el histórico, **cuando** lo consulto, **entonces** veo todos los cortes con su
  estado y puedo exportarlos.

## 6. Reglas de negocio

- `R-105-01` Todo cobro tiene beneficiario y recaudador, aunque sean el mismo.
- `R-105-02` La obligación entre entidades nace cuando el cobro pasa a pagado, no al emitirlo.
- `R-105-03` Un cobro pertenece como máximo a una liquidación.
- `R-105-04` Un corte aprobado es inmutable; se corrige en el siguiente con un ajuste.
- `R-105-05` Las comisiones de la pasarela se descuentan al beneficiario, salvo que se
  configure lo contrario.
- `R-105-06` Un reembolso posterior al corte genera un ajuste negativo en el corte siguiente.
- `R-105-07` Todo cambio de estado del corte y todo ajuste quedan auditados con autor y motivo.
- `R-105-08` `neto = bruto − comisiones + ajustes`, verificado al aprobar; si no cuadra al
  centavo, el corte no se puede aprobar.

## 7. Estados

`draft → approved → transferred → closed`, más `disputed` desde `transferred`.

## 8. Datos

`payee`, `settlement`, `settlement_line`, `payout_adjustment`, y los campos nuevos de
`charge` — sección M de `docs/02-domain-model.md`.

## 9. Interfaz

```
GET  /payees                                        billing.read
POST /payees                                        billing.manage
GET  /settlements?fromPayee=&toPayee=&status=       settlement.read
POST /settlements/preview                           settlement.manage  { from, to, period }
POST /settlements                                   settlement.manage
POST /settlements/:id/adjustments                   settlement.manage  { amount, reason }
POST /settlements/:id/approve                       settlement.approve
POST /settlements/:id/transfer                      settlement.approve { evidenceKey, transferredAt }
POST /settlements/:id/acknowledge                   settlement.approve (la entidad beneficiaria)
POST /settlements/:id/dispute                       settlement.approve { note }
GET  /settlements/position?payeeId=                 acumulado pendiente a la fecha
GET  /settlements/:id/export                        settlement.read
```

## 10. Dominio puro

```ts
// packages/domain/settlement
function obligationsFrom(charges: Charge[]): Obligation[]      // sólo pagados, beneficiario ≠ recaudador
function buildSettlement(obligations: Obligation[], fees: Fee[], adjustments: Adjustment[]):
  { gross: Cents; fees: Cents; adjustments: Cents; net: Cents; lines: Line[] }
function assertBalances(s: Settlement): Result<void, ImbalanceError>   // al centavo
function pendingPosition(charges: Charge[], settled: SettlementLine[], at: Date): Cents
```

## 11. Pantallas

- **Posición entre entidades**: un número grande — "Cuatro Soles le debe al club $ X" — con
  la fecha de corte y un botón para ver el detalle. Es la pantalla que evita la discusión.
- **Corte**: cabecera con bruto, comisiones, ajustes y neto; abajo el detalle por concepto,
  agrupado. En móvil, tarjetas por concepto con su total; el detalle línea a línea en
  escritorio.
- **Registrar transferencia**: monto, fecha, adjuntar comprobante (foto o PDF), confirmar.

## 12. Riesgos

| Riesgo | Mitigación |
|---|---|
| **Recaudar a nombre de un tercero tiene implicaciones tributarias en Colombia** (recaudo por cuenta ajena, retenciones, ICA). No es un problema de software. | Se recomienda revisar el esquema con el contador del club **antes** de mover plata real, y firmar un acuerdo de recaudo entre las dos entidades. La plataforma deja evidencia, pero no legaliza el arreglo. |
| El esquema se complica innecesariamente | **Alternativa más simple y recomendada:** que el club abra su propia cuenta de Wompi y cada cobro entre directo a quien le pertenece. La plataforma ya lo soporta (`collector = beneficiary`) y el módulo de liquidación queda inactivo. Vale la pena evaluarlo antes de la Fase 3 (Q-03b). |
| Descuadres de centavos por comisiones | `assertBalances` impide aprobar un corte que no cuadre exactamente |
| Reembolsos después del corte | ajuste negativo en el período siguiente, nunca reapertura |

## 13. Definición de terminado

- [ ] Cobertura de `packages/domain/settlement` ≥ 90 %
- [ ] Test: un cobro no puede entrar en dos cortes
- [ ] Test: un corte aprobado es inmutable
- [ ] Test: reembolso posterior genera ajuste en el siguiente corte
- [ ] La posición pendiente coincide con la suma manual de los cobros no liquidados
