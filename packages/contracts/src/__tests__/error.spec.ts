import { describe, expect, it } from "vitest";
import { ApiErrorResponse } from "../error.js";

describe("ApiErrorResponse", () => {
  it("valida la forma única de error de docs/03-api-conventions.md §2", () => {
    const result = ApiErrorResponse.safeParse({
      error: {
        code: "PRACTICE_ALREADY_FULL",
        message: "Esta práctica ya alcanzó el número máximo de jugadores.",
        requestId: "req_01J000000000000000000000",
      },
    });

    expect(result.success).toBe(true);
  });

  it("rechaza un error sin code, message o requestId", () => {
    const result = ApiErrorResponse.safeParse({ error: { message: "algo falló" } });

    expect(result.success).toBe(false);
  });
});
