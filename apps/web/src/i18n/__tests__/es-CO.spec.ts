import { describe, expect, it } from "vitest";
import { copy } from "../es-CO.js";

describe("copy es-CO", () => {
  it("centraliza el texto visible del scaffold, no vacío", () => {
    expect(copy.app.title.length).toBeGreaterThan(0);
    expect(copy.app.scaffoldNotice.length).toBeGreaterThan(0);
  });
});
