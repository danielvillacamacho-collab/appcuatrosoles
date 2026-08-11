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
  it("puede todo dentro de su club, salvo administrar la plataforma", () => {
    const negados = PERMISSIONS.filter(
      (permiso) => !hasPermission(actor(ADMIN_DEL_CLUB), permiso, EN_EL_CLUB).ok,
    );

    expect(negados).toEqual(["platform.club.manage"]);
  });

  it("no puede dar de alta ni suspender clubes: un club que pudiera hacerlo podría suspender a otro", () => {
    expect(hasPermission(actor(ADMIN_DEL_CLUB), "platform.club.manage", PLATAFORMA).ok).toBe(false);
    expect(hasPermission(actor(ADMIN_DEL_CLUB), "platform.club.manage", EN_EL_CLUB).ok).toBe(false);
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
  it("puede administrar su organización y su gente", () => {
    const suyos = [
      "user.create",
      "user.edit",
      "user.suspend",
      "user.archive",
      "user.export",
      "role.assign",
      "audit.view",
      "organization.manage",
      "setting.edit",
    ] as const;

    for (const permiso of suyos) {
      expect(hasPermission(actor(ADMIN_DE_LA_ORG), permiso, EN_LA_ORG).ok).toBe(true);
    }
  });

  it("no toca lo que es del club: sus datos, sus temporadas ni sus categorías de membresía", () => {
    // Cuando las tres filas administrativas eran idénticas, esto pasaba: un administrador de
    // organización habría podido editar el club entero en cuanto existieran esas rutas.
    for (const ajeno of ["club.edit", "season.manage", "membership.manage", "platform.club.manage"] as const) {
      expect(hasPermission(actor(ADMIN_DE_LA_ORG), ajeno, EN_LA_ORG).ok).toBe(false);
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
  it("ningún rol operativo pasa ningún permiso administrativo, en ningún ámbito válido", () => {
    // Recorre roles × sus ámbitos válidos × todos los permisos. Si un rol ganara autoridad por
    // accidente —al agregar un permiso nuevo a la tabla, por ejemplo— aparece aquí.
    //
    // **El comisario sale de la lista con una excepción explícita**, no borrándolo del recorrido:
    // tiene `field.block` y nada más (`specs/040`, `docs/06` §4). Su autoridad es deportiva —sacar
    // una cancha de juego porque está impracticable— y sigue sin poder administrar nada.
    const OPERATIVOS = ["commissioner", "instructor", "groom", "treasurer", "player"] as const;
    const DEPORTIVOS: string[] = ["commissioner/club → field.block"];
    const infractores: string[] = [];

    for (const role of OPERATIVOS) {
      for (const scope of ROLE_SCOPES[role]) {
        const scopeId = scope === "organization" ? ORG : CLUB;
        const asignacion: RoleAssignmentRef = { role, scope, scopeId };

        for (const permiso of PERMISSIONS) {
          for (const ambito of [EN_EL_CLUB, EN_LA_ORG]) {
            const caso = `${role}/${scope} → ${permiso}`;

            if (hasPermission(actor(asignacion), permiso, ambito).ok && !DEPORTIVOS.includes(caso)) {
              infractores.push(caso);
            }
          }
        }
      }
    }

    expect(infractores).toEqual([]);
  });

  it("el comisario puede bloquear una cancha y NADA más", () => {
    // La otra cara del test de arriba: que tenga un permiso no puede volverse «tiene permisos».
    const comisario = actor({ role: "commissioner", scope: "club", scopeId: CLUB });
    const suyos = PERMISSIONS.filter((permiso) => hasPermission(comisario, permiso, EN_EL_CLUB).ok);

    expect(suyos).toEqual(["field.block"]);
  });

  it("el comisario de un club no bloquea canchas de otro", () => {
    const comisario = actor({ role: "commissioner", scope: "club", scopeId: "otro-club" });

    expect(hasPermission(comisario, "field.block", EN_EL_CLUB).ok).toBe(false);
  });

  it("sólo cuatro roles tienen alguna autoridad, y son los del catálogo", () => {
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

    expect([...conAutoridad].sort()).toEqual([
      "club_admin",
      "commissioner",
      "organization_admin",
      "superadmin",
    ]);
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
