import { describe, expect, it } from "vitest";
import { resolveTenant, type ClubRef } from "../resolveTenant.js";

const BASE = "polo.app";

const LOS_PINOS: ClubRef = { id: "club-1", slug: "lospinos", status: "active" };
const OTRO_CLUB: ClubRef = { id: "club-2", slug: "el-rincon", status: "active" };
const SUSPENDIDO: ClubRef = { id: "club-3", slug: "moroso", status: "suspended" };

const CLUBES = [LOS_PINOS, OTRO_CLUB, SUSPENDIDO];

describe("resolveTenant · resuelve el club por su subdominio (R-020-01)", () => {
  it("un subdominio conocido resuelve a su club", () => {
    expect(resolveTenant("lospinos.polo.app", BASE, CLUBES)).toEqual({
      ok: true,
      value: LOS_PINOS,
    });
  });

  it("cada subdominio resuelve al suyo, nunca al de al lado", () => {
    expect(resolveTenant("el-rincon.polo.app", BASE, CLUBES)).toEqual({
      ok: true,
      value: OTRO_CLUB,
    });
  });

  it("ignora el puerto: en desarrollo el host viene con él", () => {
    expect(resolveTenant("lospinos.polo.app:3000", BASE, CLUBES)).toEqual({
      ok: true,
      value: LOS_PINOS,
    });
  });

  it("ignora mayúsculas: un host es indiferente a ellas y el slug se guarda en minúsculas", () => {
    expect(resolveTenant("LosPinos.Polo.App", BASE, CLUBES)).toEqual({
      ok: true,
      value: LOS_PINOS,
    });
  });

  it("ignora el punto final de un nombre absoluto", () => {
    // `lospinos.polo.app.` es el mismo host. Quien lo escriba así entraría al club sin que
    // ninguna comparación de texto ingenua lo reconociera.
    expect(resolveTenant("lospinos.polo.app.", BASE, CLUBES)).toEqual({
      ok: true,
      value: LOS_PINOS,
    });
  });

  it("funciona en desarrollo, donde el dominio base es «localhost»", () => {
    expect(resolveTenant("club-demo.localhost:3000", "localhost", [
      { id: "demo", slug: "club-demo", status: "active" },
    ])).toEqual({ ok: true, value: { id: "demo", slug: "club-demo", status: "active" } });
  });
});

describe("resolveTenant · lo que no resuelve, que es donde vive la seguridad", () => {
  it("el apex de la instalación no es un club", () => {
    // Si `polo.app` resolviera al club «polo», el sitio de la instalación se convertiría en un
    // tenant el día que alguien registre ese slug.
    expect(resolveTenant("polo.app", BASE, CLUBES)).toEqual({ ok: false, error: "sin_subdominio" });
  });

  it("un host de otro dominio se rechaza sin intentar interpretarlo", () => {
    // Un `Host` falsificado apuntando a nuestro servidor. No se recorta ni se adivina: se rechaza.
    expect(resolveTenant("lospinos.otrositio.com", BASE, CLUBES)).toEqual({
      ok: false,
      error: "host_invalido",
    });
  });

  it("un subdominio de más nivel NO se recorta al primero", () => {
    // Ésta es la trampa que convierte un bug en una fuga: si `a.lospinos.polo.app` resolviera a
    // «lospinos», cualquiera serviría un club desde una dirección que no es la suya —y las cookies
    // de sesión, que se comparten entre subdominios, viajarían hasta ahí.
    expect(resolveTenant("a.lospinos.polo.app", BASE, CLUBES)).toEqual({
      ok: false,
      error: "subdominio_invalido",
    });
  });

  it("un subdominio desconocido no resuelve a nada", () => {
    expect(resolveTenant("inventado.polo.app", BASE, CLUBES)).toEqual({
      ok: false,
      error: "club_desconocido",
    });
  });

  it("«www» no es un club, aunque alguien lo registre", () => {
    expect(resolveTenant("www.polo.app", BASE, [{ id: "x", slug: "www", status: "active" }])).toEqual(
      { ok: false, error: "subdominio_invalido" },
    );
  });

  it("un club suspendido no resuelve — y para el cliente es idéntico a que no exista", () => {
    expect(resolveTenant("moroso.polo.app", BASE, CLUBES)).toEqual({
      ok: false,
      error: "club_suspendido",
    });
  });

  it("un host vacío o sólo espacios se rechaza", () => {
    expect(resolveTenant("", BASE, CLUBES).ok).toBe(false);
    expect(resolveTenant("   ", BASE, CLUBES).ok).toBe(false);
  });

  it("sin dominio base configurado no resuelve nada: no se inventa uno", () => {
    expect(resolveTenant("lospinos.polo.app", "", CLUBES)).toEqual({
      ok: false,
      error: "host_invalido",
    });
  });

  it("sin clubes, ningún host resuelve", () => {
    expect(resolveTenant("lospinos.polo.app", BASE, [])).toEqual({
      ok: false,
      error: "club_desconocido",
    });
  });
});

describe("resolveTenant · propiedades que ningún caso suelto garantiza", () => {
  it("ningún host resuelve a un club cuyo slug no sea exactamente su subdominio", () => {
    const hosts = [
      "lospinos.polo.app",
      "el-rincon.polo.app",
      "LOSPINOS.polo.app",
      "lospinos.polo.app:8443",
      "lospinos.polo.app.",
    ];

    for (const host of hosts) {
      const resultado = resolveTenant(host, BASE, CLUBES);

      if (resultado.ok) {
        const subdominio = host.toLowerCase().split(":")[0]?.replace(/\.$/, "").split(".")[0];
        expect(resultado.value.slug).toBe(subdominio);
      }
    }
  });

  it("ninguna variante rara de un host ajeno consigue resolver a un club", () => {
    // Barre las formas en que alguien intentaría colar un host: prefijos, sufijos, dominios
    // parecidos y separadores distintos. La lista de los que pasaron debe estar vacía.
    const intentos = [
      "lospinos.polo.app.evil.com",
      "evil.com/lospinos.polo.app",
      "lospinos.polo.appx",
      "lospinospolo.app",
      "lospinos_polo.app",
      "lospinos..polo.app",
      ".lospinos.polo.app",
      "lospinos.polo.app@evil.com",
      "xn--lospinos.polo.app",
    ];

    const colados = intentos.filter((host) => resolveTenant(host, BASE, CLUBES).ok);

    expect(colados).toEqual([]);
  });

  it("agregar un club no cambia a qué resuelven los hosts de los demás (P-05)", () => {
    const antes = resolveTenant("lospinos.polo.app", BASE, CLUBES);
    const despues = resolveTenant("lospinos.polo.app", BASE, [
      ...CLUBES,
      { id: "club-4", slug: "nuevo", status: "active" },
    ]);

    expect(despues).toEqual(antes);
  });
});
