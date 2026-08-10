import { describe, expect, it } from "vitest";
import { canAssignRole, type RoleAssignmentRef } from "../canAssignRole.js";
import { ROLE_NAMES, ROLE_SCOPES, type RoleName, type ScopeKind } from "../roles.js";

const CLUB_A = "club-a";
const CLUB_B = "club-b";
const ORG_1 = "org-1"; // pertenece al club A
const ORG_2 = "org-2"; // pertenece al club A también

const superadmin: RoleAssignmentRef = { role: "superadmin", scope: "platform", scopeId: null };
const adminClubA: RoleAssignmentRef = { role: "club_admin", scope: "club", scopeId: CLUB_A };
const adminClubB: RoleAssignmentRef = { role: "club_admin", scope: "club", scopeId: CLUB_B };
const adminOrg1: RoleAssignmentRef = {
  role: "organization_admin",
  scope: "organization",
  scopeId: ORG_1,
};
const comisarioClubA: RoleAssignmentRef = { role: "commissioner", scope: "club", scopeId: CLUB_A };
const jugadorClubA: RoleAssignmentRef = { role: "player", scope: "club", scopeId: CLUB_A };

/** Atajos para no repetir la forma de la solicitud en cada test. */
const enClub = (role: RoleName, clubId = CLUB_A) =>
  ({ role, scope: "club" as ScopeKind, scopeId: clubId, clubId }) as const;
const enOrg = (role: RoleName, orgId = ORG_1, clubId = CLUB_A) =>
  ({ role, scope: "organization" as ScopeKind, scopeId: orgId, clubId }) as const;
const enPlataforma = (role: RoleName) =>
  ({ role, scope: "platform" as ScopeKind, scopeId: null, clubId: null }) as const;

const permite = (actor: RoleAssignmentRef[], req: Parameters<typeof canAssignRole>[1]) =>
  canAssignRole({ roles: actor }, req).ok;

describe("canAssignRole · R-010-04, el caso que motiva la regla", () => {
  it("un administrador de organización NO puede otorgar el rol de comisario", () => {
    const resultado = canAssignRole({ roles: [adminOrg1] }, enClub("commissioner"));

    expect(resultado).toEqual({ ok: false, error: "actor_no_autorizado" });
  });

  it("un administrador de organización NO puede otorgar el rol de administrador del club", () => {
    expect(permite([adminOrg1], enClub("club_admin"))).toBe(false);
  });

  it("un administrador de club NO puede otorgar roles en una organización de OTRO club", () => {
    // El club B no manda en una organización del club A, aunque sea administrador de club.
    expect(permite([adminClubB], enOrg("instructor", ORG_1, CLUB_A))).toBe(false);
  });

  it("un administrador de club NO puede otorgar roles en otro club", () => {
    expect(permite([adminClubA], enClub("commissioner", CLUB_B))).toBe(false);
  });

  it("un administrador de organización NO puede otorgar roles en OTRA organización", () => {
    expect(permite([adminOrg1], enOrg("instructor", ORG_2))).toBe(false);
  });
});

describe("canAssignRole · quién sí puede", () => {
  it("el administrador del club otorga comisario dentro de su club", () => {
    expect(canAssignRole({ roles: [adminClubA] }, enClub("commissioner"))).toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("el administrador del club otorga roles en una organización de su club", () => {
    expect(permite([adminClubA], enOrg("instructor"))).toBe(true);
    expect(permite([adminClubA], enOrg("groom"))).toBe(true);
    expect(permite([adminClubA], enOrg("organization_admin"))).toBe(true);
  });

  it("el administrador de organización otorga profesor y petisero en SU organización", () => {
    expect(permite([adminOrg1], enOrg("instructor"))).toBe(true);
    expect(permite([adminOrg1], enOrg("groom"))).toBe(true);
  });

  it("el superadministrador puede otorgar en cualquier club", () => {
    expect(permite([superadmin], enClub("club_admin", CLUB_A))).toBe(true);
    expect(permite([superadmin], enClub("club_admin", CLUB_B))).toBe(true);
    expect(permite([superadmin], enOrg("instructor", ORG_1, CLUB_A))).toBe(true);
  });
});

describe("canAssignRole · superadministrador: sólo otro superadministrador (docs/06 §4)", () => {
  it("un superadministrador puede crear otro superadministrador", () => {
    expect(permite([superadmin], enPlataforma("superadmin"))).toBe(true);
  });

  it("un administrador de club NO puede crear un superadministrador", () => {
    expect(permite([adminClubA], enPlataforma("superadmin"))).toBe(false);
  });
});

describe("canAssignRole · un administrador de organización no puede clonar su propio poder", () => {
  it("NO puede nombrar a otro administrador de organización, ni en la suya", () => {
    // Decisión de menor privilegio (docs/06 §4): si pudiera, una sola cuenta comprometida se
    // multiplicaría sin que ningún administrador del club se entere. Los nombra el club.
    expect(permite([adminOrg1], enOrg("organization_admin", ORG_1))).toBe(false);
  });

  it("sí puede otorgar la tesorería de su organización", () => {
    expect(permite([adminOrg1], enOrg("treasurer", ORG_1))).toBe(true);
  });
});

describe("canAssignRole · tener un rol no es poder repartirlo", () => {
  it("el comisario, máxima autoridad deportiva, NO otorga roles", () => {
    // Su autoridad es sobre handicaps, equipos y resultados; no es administrativa. Es
    // intencional, no un olvido.
    expect(permite([comisarioClubA], enClub("commissioner"))).toBe(false);
    expect(permite([comisarioClubA], enOrg("instructor"))).toBe(false);
  });

  it("un jugador no otorga nada", () => {
    expect(permite([jugadorClubA], enClub("player"))).toBe(false);
  });

  it("sin ninguna asignación, no se puede otorgar nada", () => {
    expect(permite([], enClub("player"))).toBe(false);
  });
});

describe("canAssignRole · los permisos se acumulan (R-010-03)", () => {
  it("quien es jugador y además administrador del club, otorga como administrador", () => {
    // Ningún rol resta lo que otro concede: basta con que UNA asignación autorice.
    expect(permite([jugadorClubA, adminClubA], enClub("commissioner"))).toBe(true);
  });

  it("acumular roles sin autoridad no crea autoridad", () => {
    expect(permite([jugadorClubA, comisarioClubA], enClub("commissioner"))).toBe(false);
  });
});

describe("canAssignRole · un rol sólo existe en su ámbito", () => {
  it("un comisario «de organización» no tiene sentido y se rechaza", () => {
    expect(canAssignRole({ roles: [superadmin] }, enOrg("commissioner"))).toEqual({
      ok: false,
      error: "rol_no_admite_ese_ambito",
    });
  });

  it("un superadministrador «de club» no tiene sentido y se rechaza", () => {
    expect(canAssignRole({ roles: [superadmin] }, enClub("superadmin"))).toEqual({
      ok: false,
      error: "rol_no_admite_ese_ambito",
    });
  });

  it("la tesorería es el único rol válido en dos ámbitos: club y organización", () => {
    expect(permite([superadmin], enClub("treasurer"))).toBe(true);
    expect(permite([superadmin], enOrg("treasurer"))).toBe(true);

    const enDosAmbitos = ROLE_NAMES.filter((role) => ROLE_SCOPES[role].length > 1);
    expect(enDosAmbitos).toEqual(["treasurer"]);
  });
});

describe("canAssignRole · datos incoherentes se rechazan antes de evaluar permisos", () => {
  it("un rol de plataforma con un ámbito concreto es incoherente", () => {
    expect(
      canAssignRole(
        { roles: [superadmin] },
        { role: "superadmin", scope: "platform", scopeId: CLUB_A, clubId: null },
      ),
    ).toEqual({ ok: false, error: "ambito_incoherente" });
  });

  it("un rol de club sin identificador de ámbito es incoherente", () => {
    expect(
      canAssignRole(
        { roles: [superadmin] },
        { role: "commissioner", scope: "club", scopeId: null, clubId: null },
      ),
    ).toEqual({ ok: false, error: "ambito_incoherente" });
  });

  it("un rol de club cuyo club no coincide con su propio ámbito es incoherente", () => {
    expect(
      canAssignRole(
        { roles: [superadmin] },
        { role: "commissioner", scope: "club", scopeId: CLUB_A, clubId: CLUB_B },
      ),
    ).toEqual({ ok: false, error: "ambito_incoherente" });
  });

  it("un rol de organización sin saber a qué club pertenece no se puede evaluar", () => {
    // Sin ese dato no hay forma de saber si un club_admin manda ahí: se rechaza en vez de adivinar.
    expect(
      canAssignRole(
        { roles: [adminClubA] },
        { role: "instructor", scope: "organization", scopeId: ORG_1, clubId: null },
      ),
    ).toEqual({ ok: false, error: "club_del_ambito_desconocido" });
  });
});

describe("canAssignRole · matriz completa: nadie obtiene autoridad por accidente", () => {
  const ACTORES: ReadonlyArray<{ nombre: string; roles: RoleAssignmentRef[] }> = [
    { nombre: "superadmin", roles: [superadmin] },
    { nombre: "club_admin del club A", roles: [adminClubA] },
    { nombre: "organization_admin de org-1", roles: [adminOrg1] },
    { nombre: "commissioner del club A", roles: [comisarioClubA] },
    { nombre: "player del club A", roles: [jugadorClubA] },
    { nombre: "sin roles", roles: [] },
  ];

  /** Los únicos actores con alguna autoridad para otorgar. */
  const CON_AUTORIDAD = ["superadmin", "club_admin del club A", "organization_admin de org-1"];

  it("sólo tres tipos de actor pueden otorgar algo, en algún ámbito", () => {
    const conAlgunaAutoridad = ACTORES.filter(({ roles }) =>
      ROLE_NAMES.some((role) =>
        ROLE_SCOPES[role].some((scope) => {
          const req =
            scope === "platform"
              ? enPlataforma(role)
              : scope === "club"
                ? enClub(role)
                : enOrg(role);
          return permite(roles, req);
        }),
      ),
    ).map((a) => a.nombre);

    expect(conAlgunaAutoridad).toEqual(CON_AUTORIDAD);
  });

  it("ningún actor puede otorgar un rol en un club que no es el suyo", () => {
    const ajenos = ACTORES.filter((a) => a.nombre !== "superadmin").filter(({ roles }) =>
      ROLE_NAMES.some((role) => ROLE_SCOPES[role].includes("club") && permite(roles, enClub(role, CLUB_B))),
    );

    expect(ajenos).toEqual([]);
  });
});
