import { describe, expect, it } from "vitest";
import type { RoleAssignmentRef } from "../canAssignRole.js";
import {
  hasPermission,
  PERMISSIONS,
  type Permission,
  type PermissionTarget,
} from "../hasPermission.js";
import { ROLE_NAMES, ROLE_SCOPES } from "../roles.js";

const CLUB = "club-los-pinos";
const OTRO_CLUB = "club-ajeno";
const ORG = "org-cuatro-soles";
const OTRA_ORG = "org-ajena";

const PLATAFORMA: PermissionTarget = { scope: "platform", scopeId: null, clubId: null };
const EN_EL_CLUB: PermissionTarget = { scope: "club", scopeId: CLUB, clubId: CLUB };
const EN_OTRO_CLUB: PermissionTarget = { scope: "club", scopeId: OTRO_CLUB, clubId: OTRO_CLUB };
const EN_LA_ORG: PermissionTarget = { scope: "organization", scopeId: ORG, clubId: CLUB };
const EN_OTRA_ORG: PermissionTarget = { scope: "organization", scopeId: OTRA_ORG, clubId: CLUB };
/** Una organización que vive dentro de **otro** club. */
const EN_ORG_DE_OTRO_CLUB: PermissionTarget = {
  scope: "organization",
  scopeId: OTRA_ORG,
  clubId: OTRO_CLUB,
};

const SUPERADMIN: RoleAssignmentRef = { role: "superadmin", scope: "platform", scopeId: null };
const ADMIN_DEL_CLUB: RoleAssignmentRef = { role: "club_admin", scope: "club", scopeId: CLUB };
const ADMIN_DE_LA_ORG: RoleAssignmentRef = {
  role: "organization_admin",
  scope: "organization",
  scopeId: ORG,
};

function actor(...roles: RoleAssignmentRef[]): { roles: RoleAssignmentRef[] } {
  return { roles };
}

describe("hasPermission · superadministrador", () => {
  it("puede todo, en la plataforma, en cualquier club y en cualquier organización", () => {
    for (const permiso of PERMISSIONS) {
      for (const ambito of [PLATAFORMA, EN_EL_CLUB, EN_OTRO_CLUB, EN_LA_ORG, EN_ORG_DE_OTRO_CLUB]) {
        expect(hasPermission(actor(SUPERADMIN), permiso, ambito).ok).toBe(true);
      }
    }
  });
});

describe("hasPermission · administrador de club", () => {
  it("puede todos los permisos del módulo dentro de su club", () => {
    for (const permiso of PERMISSIONS) {
      expect(hasPermission(actor(ADMIN_DEL_CLUB), permiso, EN_EL_CLUB).ok).toBe(true);
    }
  });

  it("alcanza también a las organizaciones que viven dentro de su club", () => {
    expect(hasPermission(actor(ADMIN_DEL_CLUB), "user.create", EN_LA_ORG).ok).toBe(true);
  });

  it("no alcanza a otro club", () => {
    expect(hasPermission(actor(ADMIN_DEL_CLUB), "user.create", EN_OTRO_CLUB)).toEqual({
      ok: false,
      error: "actor_not_authorized",
    });
  });

  it("no alcanza a una organización de otro club", () => {
    expect(hasPermission(actor(ADMIN_DEL_CLUB), "user.create", EN_ORG_DE_OTRO_CLUB).ok).toBe(false);
  });

  it("no administra la plataforma: configurar reglas globales es de superadmin", () => {
    expect(hasPermission(actor(ADMIN_DEL_CLUB), "user.create", PLATAFORMA).ok).toBe(false);
  });
});

describe("hasPermission · administrador de organización (R-010-04 en la puerta)", () => {
  it("puede dentro de su propia organización", () => {
    for (const permiso of PERMISSIONS) {
      expect(hasPermission(actor(ADMIN_DE_LA_ORG), permiso, EN_LA_ORG).ok).toBe(true);
    }
  });

  it("no puede sobre el club entero, ni siquiera el suyo", () => {
    // Es R-010-04 aplicado en la capa de guard: el ámbito de club le queda fuera del alcance.
    expect(hasPermission(actor(ADMIN_DE_LA_ORG), "role.assign", EN_EL_CLUB)).toEqual({
      ok: false,
      error: "actor_not_authorized",
    });
  });

  it("no puede sobre otra organización del mismo club", () => {
    expect(hasPermission(actor(ADMIN_DE_LA_ORG), "user.suspend", EN_OTRA_ORG).ok).toBe(false);
  });

  it("no puede sobre la plataforma", () => {
    expect(hasPermission(actor(ADMIN_DE_LA_ORG), "audit.view", PLATAFORMA).ok).toBe(false);
  });
});

describe("hasPermission · los permisos se acumulan, pero acumular no crea autoridad (R-010-03)", () => {
  it("jugador + administrador de club ejerce como administrador", () => {
    const jugadorYAdmin = actor({ role: "player", scope: "club", scopeId: CLUB }, ADMIN_DEL_CLUB);

    expect(hasPermission(jugadorYAdmin, "user.create", EN_EL_CLUB).ok).toBe(true);
  });

  it("jugador + comisario sigue sin poder administrar cuentas", () => {
    const jugadorYComisario = actor(
      { role: "player", scope: "club", scopeId: CLUB },
      { role: "commissioner", scope: "club", scopeId: CLUB },
    );

    expect(hasPermission(jugadorYComisario, "user.create", EN_EL_CLUB).ok).toBe(false);
  });
});

describe("hasPermission · quién NO tiene autoridad administrativa", () => {
  it("ningún rol operativo pasa ningún permiso, en ningún ámbito válido", () => {
    // Recorre roles × sus ámbitos válidos × todos los permisos. Si un rol ganara autoridad por
    // accidente —al agregar un permiso nuevo a la tabla, por ejemplo— aparece aquí.
    const OPERATIVOS = ["commissioner", "instructor", "groom", "treasurer", "player"] as const;
    const infractores: string[] = [];

    for (const role of OPERATIVOS) {
      for (const scope of ROLE_SCOPES[role]) {
        const scopeId = scope === "organization" ? ORG : CLUB;
        const asignacion: RoleAssignmentRef = { role, scope, scopeId };

        for (const permiso of PERMISSIONS) {
          for (const ambito of [EN_EL_CLUB, EN_LA_ORG]) {
            if (hasPermission(actor(asignacion), permiso, ambito).ok) {
              infractores.push(`${role}/${scope} → ${permiso}`);
            }
          }
        }
      }
    }

    expect(infractores).toEqual([]);
  });

  it("sólo tres roles tienen alguna autoridad administrativa, y son los del catálogo", () => {
    const conAutoridad = ROLE_NAMES.filter((role) =>
      ROLE_SCOPES[role].some((scope) =>
        PERMISSIONS.some((permiso) =>
          [PLATAFORMA, EN_EL_CLUB, EN_LA_ORG].some((ambito) => {
            const scopeId = scope === "platform" ? null : scope === "organization" ? ORG : CLUB;

            return hasPermission(actor({ role, scope, scopeId }), permiso, ambito).ok;
          }),
        ),
      ),
    );

    expect([...conAutoridad].sort()).toEqual(["club_admin", "organization_admin", "superadmin"]);
  });

  it("un actor sin ningún rol no pasa nada", () => {
    expect(hasPermission(actor(), "user.create", EN_EL_CLUB)).toEqual({
      ok: false,
      error: "actor_not_authorized",
    });
  });
});

describe("hasPermission · un ámbito incoherente se rechaza antes de evaluar permisos", () => {
  const casos: { nombre: string; target: PermissionTarget; error: string }[] = [
    {
      nombre: "plataforma con identificador de ámbito",
      target: { scope: "platform", scopeId: CLUB, clubId: null },
      error: "scope_inconsistent",
    },
    {
      nombre: "club sin identificador de ámbito",
      target: { scope: "club", scopeId: null, clubId: CLUB },
      error: "scope_inconsistent",
    },
    {
      nombre: "ámbito de club cuyo club no coincide consigo mismo",
      target: { scope: "club", scopeId: CLUB, clubId: OTRO_CLUB },
      error: "scope_inconsistent",
    },
    {
      nombre: "organización sin saber a qué club pertenece",
      target: { scope: "organization", scopeId: ORG, clubId: null },
      error: "scope_club_unknown",
    },
  ];

  for (const caso of casos) {
    it(`${caso.nombre} → ${caso.error}, incluso para un superadministrador`, () => {
      // Se rechaza por dato incoherente y no por falta de permisos, y se rechaza igual para quien
      // puede todo: son bugs distintos y confundirlos esconde el verdadero.
      expect(hasPermission(actor(SUPERADMIN), "user.create", caso.target)).toEqual({
        ok: false,
        error: caso.error,
      });
    });
  }
});

describe("hasPermission · el catálogo de permisos", () => {
  it("no tiene nombres repetidos", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it("cada permiso del catálogo es ejercible por alguien — ninguno queda muerto", () => {
    const huerfanos = PERMISSIONS.filter(
      (permiso: Permission) => !hasPermission(actor(SUPERADMIN), permiso, PLATAFORMA).ok,
    );

    expect(huerfanos).toEqual([]);
  });
});
