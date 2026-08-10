import { describe, expect, it } from "vitest";
import { toLocalDate } from "../localDate.js";

describe("toLocalDate", () => {
  it("traduce un instante a la fecha de calendario del club", () => {
    expect(toLocalDate(new Date("2026-08-10T15:00:00.000Z"), "America/Bogota")).toBe("2026-08-10");
  });

  it("a las 7 p.m. de Bogotá todavía es el mismo día, aunque en UTC ya sea el siguiente", () => {
    // Éste es el error que el tipo LocalDate existe para prevenir: usar el instante crudo daría
    // el 11 de agosto y daría por vencido un vínculo que rige hasta el 10 inclusive.
    const instante = new Date("2026-08-11T00:00:00.000Z"); // 10 de agosto, 7:00 p.m. en Bogotá

    expect(toLocalDate(instante, "America/Bogota")).toBe("2026-08-10");
  });

  it("la zona es un parámetro, no una constante: el mismo instante cae en días distintos", () => {
    const instante = new Date("2026-08-11T02:00:00.000Z");

    expect(toLocalDate(instante, "America/Bogota")).toBe("2026-08-10");
    expect(toLocalDate(instante, "America/Argentina/Buenos_Aires")).toBe("2026-08-10");
    expect(toLocalDate(instante, "Europe/Madrid")).toBe("2026-08-11");
  });

  it("rellena mes y día con cero para que comparar como texto sea comparar cronológicamente", () => {
    expect(toLocalDate(new Date("2026-01-05T12:00:00.000Z"), "America/Bogota")).toBe("2026-01-05");
  });

  it("el orden alfabético coincide con el cronológico — de eso depende toda comparación de fechas", () => {
    const enero = toLocalDate(new Date("2026-01-05T12:00:00.000Z"), "America/Bogota");
    const septiembre = toLocalDate(new Date("2026-09-02T12:00:00.000Z"), "America/Bogota");

    expect(enero < septiembre).toBe(true);
  });
});
