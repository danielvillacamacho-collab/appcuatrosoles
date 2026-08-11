import { describe, expect, it } from "vitest";
import { puedeVerElHistorial } from "../visibility.js";

const JUAN = { personId: "juan", acudientes: [] };
const UN_MENOR = { personId: "sofia", acudientes: ["maria"] };

const NADIE = { personId: null, esAdministrador: false, esComisario: false };
const OTRO_JUGADOR = { personId: "pedro", esAdministrador: false, esComisario: false };

describe("puedeVerElHistorial · los seis casos de R-030-09", () => {
  it("el comisario sí: es quien los fija", () => {
    expect(
      puedeVerElHistorial({ personId: "com", esAdministrador: false, esComisario: true }, JUAN),
    ).toBe(true);
  });

  it("el administrador del club sí, aunque no pueda editarlos", () => {
    expect(
      puedeVerElHistorial({ personId: "adm", esAdministrador: true, esComisario: false }, JUAN),
    ).toBe(true);
  });

  it("la propia persona sí", () => {
    expect(puedeVerElHistorial({ ...OTRO_JUGADOR, personId: "juan" }, JUAN)).toBe(true);
  });

  it("el acudiente de un menor sí: es quien responde por ese perfil", () => {
    expect(puedeVerElHistorial({ ...OTRO_JUGADOR, personId: "maria" }, UN_MENOR)).toBe(true);
  });

  it("otro jugador NO: el motivo de un cambio puede ser delicado", () => {
    expect(puedeVerElHistorial(OTRO_JUGADOR, JUAN)).toBe(false);
  });

  it("sin sesión no", () => {
    expect(puedeVerElHistorial(NADIE, JUAN)).toBe(false);
  });
});

describe("puedeVerElHistorial · los bordes", () => {
  it("sin sesión sigue siendo no, aunque llegaran roles puestos", () => {
    // Hoy no puede pasar; el caso se cierra explícito para que siga cerrado si algún día un rol se
    // pudiera resolver sin sesión.
    expect(puedeVerElHistorial({ personId: null, esAdministrador: true, esComisario: true }, JUAN)).toBe(
      false,
    );
  });

  it("ser acudiente de UNO no da acceso al historial de OTRO", () => {
    expect(puedeVerElHistorial({ ...OTRO_JUGADOR, personId: "maria" }, JUAN)).toBe(false);
  });
});
