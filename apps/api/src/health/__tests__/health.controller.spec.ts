import { describe, expect, it } from "vitest";
import { HealthController } from "../health.controller.js";

describe("HealthController", () => {
  it("/health responde ok sin depender de nada externo", () => {
    const controller = new HealthController();
    expect(controller.health()).toEqual({ status: "ok" });
  });
});
