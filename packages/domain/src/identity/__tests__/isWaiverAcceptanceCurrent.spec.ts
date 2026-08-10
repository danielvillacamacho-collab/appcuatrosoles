import { describe, expect, it } from "vitest";
import {
  isWaiverAcceptanceCurrent,
  type WaiverVersionRef,
} from "../isWaiverAcceptanceCurrent.js";

const VERSION_VIGENTE: WaiverVersionRef = { id: "waiver-v3-los-pinos" };
const VERSION_ANTERIOR: WaiverVersionRef = { id: "waiver-v2-los-pinos" };

describe("isWaiverAcceptanceCurrent (R-010-12, HU-010-11)", () => {
  it("quien nunca aceptó ninguna versión no está cubierto", () => {
    expect(isWaiverAcceptanceCurrent(null, VERSION_VIGENTE)).toBe(false);
  });

  it("quien aceptó la versión vigente está cubierto", () => {
    expect(
      isWaiverAcceptanceCurrent({ waiverVersionId: VERSION_VIGENTE.id }, VERSION_VIGENTE),
    ).toBe(true);
  });

  it("publicada una versión nueva, la aceptación anterior deja de servir y se vuelve a pedir", () => {
    expect(
      isWaiverAcceptanceCurrent({ waiverVersionId: VERSION_ANTERIOR.id }, VERSION_VIGENTE),
    ).toBe(false);
  });
});

describe("isWaiverAcceptanceCurrent · aislamiento entre clubes (P-05)", () => {
  it("la aceptación firmada en otro club no cubre a la persona aquí, aunque sea el mismo correlativo", () => {
    // El número de versión es correlativo POR club: la «versión 3» existe en todos a la vez.
    // Si esta función comparara números en vez de identificadores, este caso daría true y una
    // persona quedaría cubierta en un club por un texto que firmó en otro.
    const vigenteEnOtroClub: WaiverVersionRef = { id: "waiver-v3-otro-club" };

    expect(isWaiverAcceptanceCurrent({ waiverVersionId: vigenteEnOtroClub.id }, VERSION_VIGENTE)).toBe(
      false,
    );
  });

  it("sólo la identidad exacta de la versión cubre: ninguna otra del historial sirve", () => {
    const historial = ["waiver-v1-los-pinos", "waiver-v2-los-pinos", "waiver-v3-otro-club"];

    const cubiertas = historial.filter((waiverVersionId) =>
      isWaiverAcceptanceCurrent({ waiverVersionId }, VERSION_VIGENTE),
    );

    expect(cubiertas).toEqual([]);
  });
});
