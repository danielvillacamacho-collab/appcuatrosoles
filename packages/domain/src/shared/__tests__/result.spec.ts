import { describe, expect, it } from "vitest";
import { err, ok } from "../result.js";

describe("Result", () => {
  it("ok() produce un resultado exitoso con su valor", () => {
    const result = ok(42);

    expect(result).toEqual({ ok: true, value: 42 });
  });

  it("err() produce un resultado fallido con su error", () => {
    const result = err("algo salió mal");

    expect(result).toEqual({ ok: false, error: "algo salió mal" });
  });
});
