# SPEC-100 — Cobros, links de pago y estado de cuenta

> Estado: ready · Depende de: 010, 020 · Bloqueado parcialmente por Q-02 y Q-03 ·
> Fuente: Parte I §12

## 1. Problema

Hoy nadie tiene claro quién debe qué. El dinero se cobra por transferencia y se lleva en una
hoja de cálculo que se desactualiza. Al mismo tiempo, el club decidió que la plataforma
**no** hace facturación ni contabilidad: sólo cobra por link y lleva el estado.

## 2. Resultado esperado

Todo lo que se cobra genera un registro con su estado. La persona ve su estado de cuenta
consolidado (incluyendo el de sus perfiles a cargo) y paga por link. Tesorería ve quién está
al día y exporta.

## 3. Fuera de alcance

Facturación electrónica, contabilidad, conciliación bancaria automática, cálculo de
impuestos, liquidación a coaches y dueños de caballos. La plataforma es el registro de
cobros, no el libro contable.

## 4. Actores

| Rol | Puede |
|---|---|
| Tesorería | ver todos los cobros, conciliar, anular, emitir crédito, exportar |
| Administrador del club / organización | emitir cobros de su ámbito, ver morosidad |
| Jugador / acudiente | ver su estado de cuenta, pagar por link, ver historial |

## 5. Historias de usuario

### HU-100-01 — Cobro automático
**Como** club **quiero** que lo que se consume genere el cobro solo **para** no perseguir
cada concepto.

- **Dado** una práctica confirmada, **cuando** se confirma, **entonces** se genera un cobro
  por jugador con la tarifa de su categoría.
- **Dado** un puesto compartido, **cuando** se cobra, **entonces** el valor se divide según
  lo configurado.
- **Dado** una compra de paquete, un alquiler, una sesión de coach, un taqueo, una pensión o
  una inscripción a copa, **cuando** ocurren, **entonces** cada uno genera su cobro con
  concepto identificable.
- **Dado** un cobro de un menor, **cuando** se genera, **entonces** aparece en el estado de
  cuenta de su pagador principal, indicando de quién es.

### HU-100-02 — Pagar por link
**Como** persona **quiero** pagar desde mi celular **para** no hacer transferencias a ciegas.

- **Dado** un cobro pendiente, **cuando** pido pagar, **entonces** recibo un link de la
  pasarela con el monto y la referencia correctos.
- **Dado** que pago, **cuando** la pasarela confirma por webhook, **entonces** el cobro pasa
  a pagado y recibo aviso.
- **Dado** que el navegador me devuelve a la plataforma diciendo "aprobado" pero el webhook
  aún no llega, **cuando** consulto, **entonces** veo "verificando pago" y no "pagado":
  el estado sólo cambia con el webhook verificado.
- **Dado** un link vencido, **cuando** lo abro, **entonces** puedo generar uno nuevo.

### HU-100-03 — Pago dividido
**Como** capitán **quiero** que cada integrante pague su parte **para** no poner yo toda la
inscripción.

- **Dado** una copa con pago dividido, **cuando** inscribo el equipo, **entonces** se generan
  los sub-cobros y cada quien recibe su link.
- **Dado** que faltan pagos, **cuando** consulto el equipo, **entonces** veo quién pagó y
  quién no, y el equipo sigue sin confirmar.
- **Dado** que todos pagaron, **cuando** entra el último, **entonces** el equipo se confirma
  automáticamente.

### HU-100-04 — Estado de cuenta
**Como** persona **quiero** ver lo que debo y lo que pagué **para** no discutir con el club.

- **Dado** mi estado de cuenta, **cuando** lo abro, **entonces** veo saldo pendiente arriba,
  el detalle por concepto y el historial de pagos.
- **Dado** que tengo saldo a favor, **cuando** se genera un cobro nuevo, **entonces** se
  aplica automáticamente si el club lo tiene activado.

### HU-100-05 — Tesorería
**Como** tesorería **quiero** ver la morosidad y conciliar **para** cerrar el mes.

- **Dado** el panel, **cuando** lo abro, **entonces** veo por categoría y por organización
  quién está al día y quién no, con totales.
- **Dado** un pago recibido por fuera (transferencia directa), **cuando** lo registro
  manualmente con evidencia, **entonces** el cobro queda pagado y la acción queda auditada.
- **Dado** un cobro emitido por error, **cuando** lo anulo con motivo, **entonces** queda
  anulado y auditado, sin borrarse.
- **Dado** cualquier vista, **cuando** exporto, **entonces** obtengo un archivo para Excel
  y queda registro de quién exportó.

## 6. Reglas de negocio

- `R-100-01` La plataforma no emite facturas ni calcula impuestos.
- `R-100-02` Un cobro cambia a pagado **sólo** por webhook verificado o por conciliación
  manual con evidencia y auditoría. Nunca por el retorno del navegador.
- `R-100-03` Los webhooks son idempotentes por identificador de evento del proveedor.
- `R-100-04` La suma de los sub-cobros iguala al cobro padre.
- `R-100-05` Los cobros de los perfiles a cargo consolidan en el pagador principal.
- `R-100-06` Un cobro emitido no cambia de monto: se anula y se emite otro.
- `R-100-07` La tarifa se congela en el cobro al emitirlo.
- `R-100-08` Un crédito a favor es un movimiento de ledger, no un campo editable.
- `R-100-09` Anular, reembolsar y conciliar manualmente son acciones auditadas con motivo.
- `R-100-10` Los datos de tarjeta nunca tocan la plataforma.

## 7. Estados del cobro

```
draft → pending → link_sent → paid
pending/link_sent → void            (anulado con motivo)
paid → refunded | credited          (según política del módulo 110)
```

## 8. Datos

`charge`, `payment_link`, `payment_event`, `credit_entry` de `docs/02` sección I.

## 9. Interfaz

```
GET  /charges?personId=&status=&from=&to=       billing.read (propio o admin)
POST /charges                                    billing.issue
POST /charges/:id/payment-link                   propio o admin (idempotente)
POST /charges/:id/void                           billing.void      { reason }
POST /charges/:id/settle-manually                billing.reconcile { evidence, reason }
GET  /me/statement                                sesión → consolidado con dependientes
GET  /billing/dashboard                          billing.read → morosidad por categoría y organización
GET  /billing/export                             billing.export
POST /webhooks/payments/:provider                público, firmado
GET  /credits/:personId                          propio o admin
POST /credits                                    billing.credit
```

## 10. Dominio puro

```ts
// packages/domain/billing
function priceFor(concept: Concept, category: MembershipCode, settings: Settings): Cents
function splitCharge(total: Cents, parts: number): Cents[]   // reparte el residuo, suma exacta
function applyCredits(charge: Charge, credits: CreditEntry[]): { applied: Cents; remaining: Cents }
function statementOf(person: PersonRef, charges: Charge[], dependents: PersonRef[]): Statement
```

`splitCharge` debe repartir el residuo: 100.000 entre 3 da 33.334 + 33.333 + 33.333, nunca
tres veces 33.333. Es el error clásico y genera descuadres de un peso que nadie encuentra.

## 11. Puerto de pasarela

```ts
interface PaymentGateway {
  createPaymentLink(charge: Charge, opts: { expiresAt: Date }): Promise<PaymentLink>;
  verifyWebhook(headers: Headers, rawBody: Buffer): Result<PaymentEvent, InvalidSignature>;
  fetchStatus(externalReference: string): Promise<PaymentStatus>;   // para conciliar
}
```

Adaptadores: `WompiGateway` (primero), `PayUGateway`, `MercadoPagoGateway`.
En tests y desarrollo se usa `FakeGateway`, que permite simular pagado, rechazado, demorado
y webhook duplicado. **Ningún test toca la pasarela real.**

`fetchStatus` existe porque los webhooks se pierden: un job de conciliación consulta los
cobros en `link_sent` con más de 24 horas y cierra los que ya estaban pagados.

## 12. Pantallas

- **Mi estado de cuenta**: saldo pendiente grande arriba; lista por concepto con fecha y
  estado; botón "Pagar" por ítem y "Pagar todo". Los conceptos de mis dependientes se marcan
  con su nombre.
- **Pagar**: confirmación del monto, salida a la pasarela, y al volver una pantalla de
  "verificando" que se resuelve sola cuando llega el webhook.
- **Panel de tesorería**: totales por estado, morosidad por categoría y organización, filtro
  y exportación. En móvil, tarjetas de resumen; el detalle tabular en escritorio.

## 13. Configuración

`payments.provider`, `payments.link_expiry_hours`, `payments.auto_apply_credit`,
`payments.statement_cycle_day`, y todas las tarifas de `docs/08`.

## 14. Riesgos

| Riesgo | Mitigación |
|---|---|
| Webhook perdido → cobro pagado que figura pendiente | job de conciliación con `fetchStatus` + botón de "verificar ahora" para tesorería |
| Webhook duplicado → doble acreditación | idempotencia por identificador de evento, con test explícito |
| Dos entidades receptoras (club y organización) sin definir | **Q-03 debe responderse antes de construir este módulo**: cambia si el cobro lleva cuenta de comercio |
| Descuadre de centavos en pagos divididos | `splitCharge` con reparto de residuo y test de suma exacta |

## 15. Supuestos

- `[SUPUESTO]` Proveedor: Wompi (Q-02).
- `[SUPUESTO]` Dos emisores: club y organización, con estado de cuenta consolidado para el
  usuario pero separado en los reportes de tesorería (Q-03).

## 16. Definición de terminado

- [ ] Test de idempotencia de webhook (evento repetido no acredita dos veces)
- [ ] Test de firma inválida (no cambia estado, responde 401)
- [ ] Test de que ningún camino de la aplicación marca pagado desde el retorno del navegador
- [ ] `splitCharge` con reparto exacto, probado con montos primos

---

## Adenda (decisión D-03) — beneficiario y recaudador

Este módulo se amplía: cada cobro deja de tener un solo dueño implícito.

- Todo cobro lleva `beneficiary_payee_id` (de quién es la plata) y `collector_payee_id`
  (quién la recibe). Cuando coinciden, nada cambia respecto a lo especificado arriba.
- Cuando difieren, marcar el cobro como pagado **crea una obligación** entre entidades, que
  se salda en el módulo `105-liquidaciones`. Nunca antes: emitir un cobro no mueve nada.
- El adaptador de pasarela recibe la cuenta de comercio del **recaudador**, no del
  beneficiario. Si el recaudador no tiene `merchant_account`, el cobro no se puede emitir y
  el error lo dice con esas palabras.
- En el estado de cuenta del usuario, los cobros aparecen **consolidados** sin importar quién
  recauda: a la persona no le interesa la contabilidad interna del club. En los reportes de
  tesorería sí se separan por beneficiario.
- Anular o reembolsar un cobro ya liquidado no toca la liquidación cerrada: genera un ajuste
  en el corte siguiente.

**Regla nueva:** `R-100-11` — un cobro sin beneficiario y recaudador definidos no se puede
emitir. No hay default silencioso.

**Test nuevo obligatorio:** un cobro pagado con beneficiario distinto del recaudador aparece
exactamente una vez en la posición pendiente, y desaparece de ella al quedar liquidado.
