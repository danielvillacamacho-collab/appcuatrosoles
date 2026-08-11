import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * Desmonta lo montado entre test y test.
 *
 * Sin esto, dos tests que rendericen la misma pantalla dejan dos copias en el DOM y
 * `getByRole` falla con «encontré varios» — un fallo que no dice nada sobre lo que se estaba
 * probando y que aparece sólo cuando el archivo crece.
 */
afterEach(() => {
  cleanup();
});
