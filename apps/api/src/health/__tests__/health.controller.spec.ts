import { describe, expect, it } from "vitest";
import { HealthController } from "../health.controller.js";

describe("HealthController", () => {
  it("/health responde ok sin depender de nada externo", () => {
    const controller = new HealthController();
    expect(controller.health()).toEqual({ status: "ok" });
  });

  it("/ready responde ok — se amplía con la conexión a Postgres a partir de T-001", () => {
    const controller = new HealthController();
    expect(controller.ready()).toEqual({ status: "ok" });
  });
});
