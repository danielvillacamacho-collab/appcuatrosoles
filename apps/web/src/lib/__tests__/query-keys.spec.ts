import { describe, expect, it } from "vitest";
import { queryKeys } from "../query-keys.js";

describe("queryKeys (T-121, docs/04 §4)", () => {
  it("la clave de la raíz es prefijo de las que cuelgan de ella", () => {
    // De eso depende que invalidar `usuarios.todos` refresque el listado y el detalle con una
    // sola línea después de crear un usuario.
    const raiz = queryKeys.usuarios.todos;

    expect(queryKeys.usuarios.lista({}).slice(0, raiz.length)).toEqual([...raiz]);
    expect(queryKeys.usuarios.detalle("abc").slice(0, raiz.length)).toEqual([...raiz]);
  });

  it("dos filtros distintos son dos consultas distintas", () => {
    // Si compartieran clave, cambiar el filtro mostraría la lista anterior hasta que llegue la
    // nueva — y peor, la nueva sobreescribiría la caché de la anterior.
    expect(queryKeys.usuarios.lista({ estado: "invited" })).not.toEqual(
      queryKeys.usuarios.lista({ estado: "active" }),
    );
  });

  it("el mismo filtro produce la misma clave, sin importar cuántas veces se pida", () => {
    expect(queryKeys.usuarios.lista({ q: "maría" })).toEqual(queryKeys.usuarios.lista({ q: "maría" }));
  });

  it("el detalle de dos usuarios no comparte caché", () => {
    expect(queryKeys.usuarios.detalle("uno")).not.toEqual(queryKeys.usuarios.detalle("dos"));
  });
});
