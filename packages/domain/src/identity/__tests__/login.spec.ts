import { describe, expect, it } from "vitest";
import { ACCOUNT_STATUSES, type AccountStatus } from "../accountStatus.js";
import { accountStatusAllowsLogin, resolveLoginOutcome } from "../login.js";

describe("accountStatusAllowsLogin", () => {
  it("sólo una cuenta activa puede iniciar sesión", () => {
    expect(accountStatusAllowsLogin("active")).toBe(true);
    expect(accountStatusAllowsLogin("invited")).toBe(false);
    expect(accountStatusAllowsLogin("suspended")).toBe(false);
    expect(accountStatusAllowsLogin("archived")).toBe(false);
  });

  it("cubre los cuatro estados que existen, sin dejar ninguno sin decidir", () => {
    // Si mañana se agrega un estado y nadie lo piensa, este test lo delata.
    expect(ACCOUNT_STATUSES).toHaveLength(4);
    for (const estado of ACCOUNT_STATUSES) {
      expect(typeof accountStatusAllowsLogin(estado)).toBe("boolean");
    }
  });
});

describe("resolveLoginOutcome · camino feliz", () => {
  it("cuenta activa con contraseña correcta → entra (HU-010-04)", () => {
    expect(resolveLoginOutcome({ credentialsValid: true, status: "active" })).toEqual({
      allowed: true,
    });
  });
});

describe("resolveLoginOutcome · no revelar si una cuenta existe (P-12, R-010-07)", () => {
  it("contraseña incorrecta en cuenta activa → error genérico", () => {
    expect(resolveLoginOutcome({ credentialsValid: false, status: "active" })).toEqual({
      allowed: false,
      rejection: "credentials_invalid",
    });
  });

  it("contraseña incorrecta en cuenta suspendida → error genérico, NO revela la suspensión", () => {
    expect(resolveLoginOutcome({ credentialsValid: false, status: "suspended" })).toEqual({
      allowed: false,
      rejection: "credentials_invalid",
    });
  });

  it("con contraseña incorrecta, los cuatro estados dan exactamente la misma respuesta", () => {
    // Ésta es la propiedad que impide enumerar cuentas: sin la contraseña, un extraño no puede
    // distinguir un correo inexistente de uno suspendido, ni por el mensaje ni por la forma.
    const respuestas = ACCOUNT_STATUSES.map((status: AccountStatus) =>
      JSON.stringify(resolveLoginOutcome({ credentialsValid: false, status })),
    );

    expect(new Set(respuestas).size).toBe(1);
  });
});

describe("resolveLoginOutcome · al titular legítimo sí se le explica el motivo", () => {
  it("cuenta suspendida con contraseña correcta → motivo 'suspended' (HU-010-04)", () => {
    expect(resolveLoginOutcome({ credentialsValid: true, status: "suspended" })).toEqual({
      allowed: false,
      rejection: "suspended",
    });
  });

  it("cuenta archivada con contraseña correcta → motivo 'archived'", () => {
    expect(resolveLoginOutcome({ credentialsValid: true, status: "archived" })).toEqual({
      allowed: false,
      rejection: "archived",
    });
  });

  it("cuenta invitada con contraseña correcta → motivo 'invitation_pending'", () => {
    // En la práctica una cuenta invitada no tiene contraseña usable, así que llegará por el
    // camino genérico. El caso se contempla igual para no dejar un estado sin decidir.
    expect(resolveLoginOutcome({ credentialsValid: true, status: "invited" })).toEqual({
      allowed: false,
      rejection: "invitation_pending",
    });
  });

  it("ningún estado distinto de 'active' entra, ni con la contraseña correcta", () => {
    const entran = ACCOUNT_STATUSES.filter(
      (status: AccountStatus) => resolveLoginOutcome({ credentialsValid: true, status }).allowed,
    );

    expect(entran).toEqual(["active"]);
  });
});

describe("resolveLoginOutcome · un estado desconocido no se deja pasar", () => {
  it("ante un estado que el dominio no conoce, falla en vez de permitir el acceso", () => {
    // No es código defensivo inalcanzable: si algún día la base de datos gana un estado nuevo y
    // nadie actualiza el dominio, la traducción del repositorio podría entregar justamente esto.
    // Preferimos que reviente a que un estado no contemplado caiga en un camino permisivo.
    const estadoInventado = "pending_review" as AccountStatus;

    expect(() =>
      resolveLoginOutcome({ credentialsValid: true, status: estadoInventado }),
    ).toThrowError(/no contemplado/);
  });
});
