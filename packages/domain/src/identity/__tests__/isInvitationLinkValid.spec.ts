import { describe, expect, it } from "vitest";
import { FixedClock } from "../../shared/clock.js";
import { isInvitationLinkValid, type InvitationLinkPolicy } from "../isInvitationLinkValid.js";

const ENVIADA = new Date("2026-08-10T15:00:00.000Z");
const SIETE_DIAS: InvitationLinkPolicy = { validityDays: 7 };

/** «Dado que ya pasaron N milisegundos desde el envío». */
function relojA(milisegundosDesdeElEnvio: number): FixedClock {
  return new FixedClock(new Date(ENVIADA.getTime() + milisegundosDesdeElEnvio));
}

const UNA_HORA = 60 * 60 * 1000;
const UN_DIA = 24 * UNA_HORA;

describe("isInvitationLinkValid · la ventana de 7 días (R-010-08, HU-010-02)", () => {
  it("recién creada, sirve", () => {
    const resultado = isInvitationLinkValid(
      { sentAt: ENVIADA, usedAt: null },
      SIETE_DIAS,
      relojA(0),
    );

    expect(resultado).toEqual({ ok: true, value: undefined });
  });

  it("a los 6 días y 23 horas, todavía sirve", () => {
    const resultado = isInvitationLinkValid(
      { sentAt: ENVIADA, usedAt: null },
      SIETE_DIAS,
      relojA(6 * UN_DIA + 23 * UNA_HORA),
    );

    expect(resultado.ok).toBe(true);
  });

  it("un milisegundo antes de cumplirse los 7 días, todavía sirve", () => {
    const resultado = isInvitationLinkValid(
      { sentAt: ENVIADA, usedAt: null },
      SIETE_DIAS,
      relojA(7 * UN_DIA - 1),
    );

    expect(resultado.ok).toBe(true);
  });

  it("a los 7 días exactos ya está vencida — el borde se decide por el lado que concede menos", () => {
    const resultado = isInvitationLinkValid(
      { sentAt: ENVIADA, usedAt: null },
      SIETE_DIAS,
      relojA(7 * UN_DIA),
    );

    expect(resultado).toEqual({ ok: false, error: "link_expired" });
  });

  it("a los 8 días está vencida y el administrador debe reenviarla", () => {
    const resultado = isInvitationLinkValid(
      { sentAt: ENVIADA, usedAt: null },
      SIETE_DIAS,
      relojA(8 * UN_DIA),
    );

    expect(resultado).toEqual({ ok: false, error: "link_expired" });
  });
});

describe("isInvitationLinkValid · de un solo uso (R-010-08)", () => {
  it("una invitación ya usada no sirve, aunque esté dentro de la ventana", () => {
    const resultado = isInvitationLinkValid(
      { sentAt: ENVIADA, usedAt: new Date(ENVIADA.getTime() + UNA_HORA) },
      SIETE_DIAS,
      relojA(2 * UNA_HORA),
    );

    expect(resultado).toEqual({ ok: false, error: "link_already_used" });
  });

  it("usada Y vencida responde «ya usada»: reenviar sin más ocultaría que alguien la consumió", () => {
    const resultado = isInvitationLinkValid(
      { sentAt: ENVIADA, usedAt: new Date(ENVIADA.getTime() + UNA_HORA) },
      SIETE_DIAS,
      relojA(30 * UN_DIA),
    );

    expect(resultado).toEqual({ ok: false, error: "link_already_used" });
  });
});

describe("isInvitationLinkValid · la validez es configuración, no código (P-04)", () => {
  it("con la ventana en 3 días, vence a los 3 y no a los 7", () => {
    const enlace = { sentAt: ENVIADA, usedAt: null };
    const tresDias: InvitationLinkPolicy = { validityDays: 3 };

    expect(isInvitationLinkValid(enlace, tresDias, relojA(3 * UN_DIA - 1)).ok).toBe(true);
    expect(isInvitationLinkValid(enlace, tresDias, relojA(3 * UN_DIA)).ok).toBe(false);
  });

  it("con la ventana en 14 días, a los 8 días sigue sirviendo", () => {
    const resultado = isInvitationLinkValid(
      { sentAt: ENVIADA, usedAt: null },
      { validityDays: 14 },
      relojA(8 * UN_DIA),
    );

    expect(resultado.ok).toBe(true);
  });

  it("recorre varias ventanas y en todas el último instante válido es el anterior al corte", () => {
    // Cubre combinaciones que nadie enumeró a mano: si la aritmética de la ventana se rompiera
    // para algún valor, aparece aquí y no en producción.
    for (const validityDays of [1, 2, 3, 7, 14, 30]) {
      const enlace = { sentAt: ENVIADA, usedAt: null };
      const corte = validityDays * UN_DIA;

      expect(isInvitationLinkValid(enlace, { validityDays }, relojA(corte - 1)).ok).toBe(true);
      expect(isInvitationLinkValid(enlace, { validityDays }, relojA(corte)).ok).toBe(false);
    }
  });
});
