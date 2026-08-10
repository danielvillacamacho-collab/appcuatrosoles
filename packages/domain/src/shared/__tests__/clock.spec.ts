import { describe, expect, it } from "vitest";
import { FixedClock, SystemClock } from "../clock.js";

describe("FixedClock", () => {
  it("siempre devuelve la misma fecha con la que se construyó", () => {
    const fixed = new Date("2026-08-10T23:00:00.000Z");
    const clock = new FixedClock(fixed);

    expect(clock.now()).toBe(fixed);
  });
});

describe("SystemClock", () => {
  it("devuelve una fecha real — es el único punto permitido de new Date() en el dominio", () => {
    const clock = new SystemClock();

    expect(clock.now()).toBeInstanceOf(Date);
  });
});
