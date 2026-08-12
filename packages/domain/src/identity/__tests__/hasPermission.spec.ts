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
  it("puede todo lo administrativo, en la plataforma, en cualquier club y en cualquier organización", () => {
    const administrativos = PERMISSIONS.filter((permiso) => permiso !== "handicap.edit");


    for (const permiso of administrativos) {
      for (const ambito of [PLATAFORMA, EN_EL_CLUB, EN_OTRO_CLUB, EN_LA_ORG, EN_ORG_DE_OTRO_CLUB]) {
        expect(hasPermission(actor(SUPERADMIN), permiso, ambito).ok).toBe(true);
      }
    }
  });

  it("NO fija handicaps, aunque sea dueño de la plataforma (`specs/030` R-030-02)", () => {
    // No es que no pueda tocarlos nunca: puede asignarse el rol de comisario, que para eso tiene
    // `role.assign`. La diferencia es que así **queda registrado** — una autoridad que se toma deja
    // rastro donde una autoridad que se tiene no deja ninguno.
    expect(hasPermission(actor(SUPERADMIN), "handicap.edit", EN_EL_CLUB).ok).toBe(false);
    expect(hasPermission(actor(SUPERADMIN), "handicap.edit", PLATAFORMA).ok).toBe(false);
  });
});

describe("hasPermission · administrador de club", () => {
  it("puede todo dentro de su club, salvo la plataforma y el deporte", () => {
    const negados = PERMISSIONS.filter(
      (permiso) => !hasPermission(actor(ADMIN_DEL_CLUB), permiso, EN_EL_CLUB).ok,
    );

    // Los dos con motivos distintos: la plataforma no es suya, y el handicap no es de nadie más
    // que del comisario (`specs/030` R-030-02).
    expect(negados).toEqual(["platform.club.manage", "handicap.edit"]);
  });

  it("NO fija handicaps: la autoridad deportiva no viene con la administrativa", () => {
    // Es la regla que este rol hace fácil de romper. Su fila se define **por resta**, así que un
    // permiso nuevo le llega solo — y si esto se hace mal no falla nada: el administrador puede
    // tocar handicaps para siempre y nadie se entera hasta que lo haga.
    expect(hasPermission(actor(ADMIN_DEL_CLUB), "handicap.edit", EN_EL_CLUB).ok).toBe(false);
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
    const DEPORTIVOS: string[] = [
      "commissioner/club → field.block",
      "commissioner/club → handicap.edit",
      "commissioner/club → practice.manage",
    ];
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

  it("el comisario tiene su autoridad deportiva y NADA más", () => {
    // La otra cara del test de arriba: que tenga permisos no puede volverse «tiene todos».
    const comisario = actor({ role: "commissioner", scope: "club", scopeId: CLUB });
    const suyos = PERMISSIONS.filter((permiso) => hasPermission(comisario, permiso, EN_EL_CLUB).ok);

    expect(suyos).toEqual(["field.block", "handicap.edit", "practice.manage"]);
  });

  it("el comisario de un club no fija handicaps de otro", () => {
    const comisario = actor({ role: "commissioner", scope: "club", scopeId: "otro-club" });

    expect(hasPermission(comisario, "handicap.edit", EN_EL_CLUB).ok).toBe(false);
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
    // **Recorre todos los roles, no sólo el superadministrador.** Hasta `specs/030` este test
    // preguntaba «¿puede el superadmin?», porque el superadmin podía todo y servía de donante
    // universal. `handicap.edit` rompió ese atajo —es del comisario y de nadie más— y el test
    // falló señalando el permiso, que es lo correcto: la pregunta nunca fue «¿puede el superadmin?»
    // sino «¿hay alguien que pueda?».
    const huerfanos = PERMISSIONS.filter((permiso: Permission) => !loPuedeAlguien(permiso));

    expect(huerfanos).toEqual([]);
  });

  it("cada rol administrativo tiene un conjunto EXACTO de permisos, escrito a mano", () => {
    // **Este test es el que faltaba, y hubo que arreglarlo dos veces.**
    //
    // Primero, porque no existía: el recorrido de «quién NO tiene autoridad» sólo camina los roles
    // operativos, así que un permiso concedido de más a un administrador era invisible. Al agregar
    // `handicap.edit` la suite entera pasó en verde, con el administrador del club pudiendo fijar
    // handicaps.
    //
    // Y después, porque la primera versión **seguía sin servir**: las listas esperadas de
    // `superadmin` y `club_admin` se calculaban con `PERMISSIONS.filter(...)`, así que un permiso
    // nuevo entraba a la vez en lo esperado y en lo real, y el test pasaba igual. Lo destapó
    // `practice.manage`, y sólo `organization_admin` —cuya lista sí estaba escrita a mano— habría
    // avisado.
    //
    // Por eso las tres van **escritas a mano y completas**. Es verbosa a propósito: las filas
    // administrativas se definen por resta, así que sus permisos crecen solos, y la única forma de
    // que agregar uno sea una decisión y no un descuido es que el test no compile la respuesta
    // sola.
    const esperado: Record<string, { ambito: PermissionTarget; permisos: Permission[] }> = {
      superadmin: {
        ambito: PLATAFORMA,
        // Todo menos la autoridad deportiva: `handicap.edit` es del comisario (`specs/030` R-030-02).
        permisos: [
          "user.create",
          "user.edit",
          "user.suspend",
          "user.archive",
          "user.export",
          "role.assign",
          "audit.view",
          "club.edit",
          "organization.manage",
          "season.manage",
          "membership.manage",
          "setting.edit",
          "platform.club.manage",
          "field.edit",
          "field.block",
          "practice.manage",
        ],
      },
      club_admin: {
        ambito: EN_EL_CLUB,
        // Ni la plataforma ni el handicap. Las prácticas **sí**: las organiza él (`specs/050`).
        permisos: [
          "user.create",
          "user.edit",
          "user.suspend",
          "user.archive",
          "user.export",
          "role.assign",
          "audit.view",
          "club.edit",
          "organization.manage",
          "season.manage",
          "membership.manage",
          "setting.edit",
          "field.edit",
          "field.block",
          "practice.manage",
        ],
      },
      organization_admin: {
        ambito: EN_LA_ORG,
        permisos: [
          "user.create",
          "user.edit",
          "user.suspend",
          "user.archive",
          "user.export",
          "role.assign",
          "audit.view",
          "organization.manage",
          "setting.edit",
        ],
      },
    };

    for (const [role, caso] of Object.entries(esperado)) {
      const asignacion = {
        role,
        scope: caso.ambito.scope,
        scopeId: caso.ambito.scopeId,
      } as RoleAssignmentRef;
      const suyos = PERMISSIONS.filter(
        (permiso) => hasPermission(actor(asignacion), permiso, caso.ambito).ok,
      );

      expect(suyos, `los permisos de ${role} cambiaron sin que nadie lo decidiera`).toEqual(
        caso.permisos,
      );
    }
  });
});

/** ¿Existe algún rol, en algún ámbito válido, que ejerza este permiso? */
function loPuedeAlguien(permiso: Permission): boolean {
  return ROLE_NAMES.some((role) =>
    ROLE_SCOPES[role].some((scope) => {
      const scopeId = scope === "platform" ? null : scope === "organization" ? ORG : CLUB;
      const asignacion = { role, scope, scopeId } as RoleAssignmentRef;

      return [PLATAFORMA, EN_EL_CLUB, EN_LA_ORG].some(
        (ambito) => hasPermission(actor(asignacion), permiso, ambito).ok,
      );
    }),
  );
}
