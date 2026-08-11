import { describe, expect, it } from "vitest";
import { NOTIFICATION_TYPES, debeEnviarse, esAvisoInevitable } from "../notifications.js";

describe("El catálogo de avisos", () => {
  it("no tiene tipos repetidos: dos filas para el mismo aviso serían dos respuestas distintas", () => {
    expect(new Set(NOTIFICATION_TYPES).size).toBe(NOTIFICATION_TYPES.length);
  });

  it("todos los avisos de hoy son inevitables, y cada uno por su motivo", () => {
    // Dos son seguridad —«tu contraseña cambió», «tu cuenta fue suspendida»— y dos son el
    // mecanismo mismo: apagar la invitación o el restablecimiento deja a la persona sin entrar.
    expect(NOTIFICATION_TYPES.filter((tipo) => !esAvisoInevitable(tipo))).toEqual([]);
  });
});

describe("esAvisoInevitable", () => {
  it("dice que sí de los avisos de seguridad", () => {
    expect(esAvisoInevitable("identity.notify-password-changed")).toBe(true);
    expect(esAvisoInevitable("identity.notify-account-status-changed")).toBe(true);
  });

  it("dice que sí del mecanismo de acceso", () => {
    expect(esAvisoInevitable("identity.send-invitation")).toBe(true);
    expect(esAvisoInevitable("identity.send-password-reset")).toBe(true);
  });

  it("dice que no de cualquier otro: lo que venga después es apagable salvo que se diga", () => {
    expect(esAvisoInevitable("practice.reminder")).toBe(false);
    expect(esAvisoInevitable("")).toBe(false);
  });
});

describe("debeEnviarse", () => {
  it("sin preferencia guardada, se envía — la tabla es de exclusiones, no de inclusiones", () => {
    // Al revés —tener que activar cada aviso— la gente se queda sin enterarse de nada y culpa a
    // la plataforma.
    expect(debeEnviarse("practice.reminder", [])).toBe(true);
  });

  it("con la preferencia apagada, no se envía", () => {
    expect(debeEnviarse("practice.reminder", [{ type: "practice.reminder", enabled: false }])).toBe(
      false,
    );
  });

  it("con la preferencia encendida, se envía", () => {
    expect(debeEnviarse("practice.reminder", [{ type: "practice.reminder", enabled: true }])).toBe(
      true,
    );
  });

  it("la preferencia de otro aviso no lo apaga", () => {
    expect(debeEnviarse("practice.reminder", [{ type: "cup.fixture", enabled: false }])).toBe(true);
  });

  it("un aviso inevitable se envía aunque exista una fila que lo apague", () => {
    // La fila puede existir por un cambio de catálogo, o porque alguien la escribió a mano en la
    // base. La regla no se negocia con los datos: si esto fallara, un secuestro de cuenta pasaría
    // inadvertido porque la víctima misma habría «desactivado» el aviso.
    const apagado = [{ type: "identity.notify-password-changed", enabled: false }];

    expect(debeEnviarse("identity.notify-password-changed", apagado)).toBe(true);
  });
});
