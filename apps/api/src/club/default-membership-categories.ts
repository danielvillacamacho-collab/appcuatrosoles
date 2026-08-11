import type { Prisma } from "@prisma/client";

/**
 * Categorías con las que nace un club (`docs/02` §A).
 *
 * Son un **punto de partida, no un enum**: el club puede renombrarlas, cambiarles la cuota, agregar
 * otras o desactivar las que no use (P-04). Los importes son ejemplos deliberadamente redondos —
 * ningún club real cobra esto, y quien dé de alta un club los ajusta el primer día.
 *
 * Vive aquí y no en el seed porque ahora tiene dos consumidores: el alta de clubes (T-230) y el
 * seed de desarrollo. Dos listas que se contradicen es la forma más aburrida de que un club nuevo
 * salga distinto al de desarrollo.
 */
export const CATEGORIAS_POR_DEFECTO: {
  code: string;
  name: string;
  monthlyFeeCents: bigint;
  rights: Prisma.InputJsonValue;
}[] = [
  { code: "student", name: "Estudiante", monthlyFeeCents: 0n, rights: { requiere_aptitud: true } },
  {
    code: "temporary_member",
    name: "Miembro temporal",
    monthlyFeeCents: 10000000n,
    rights: { puede_postular_practicas: true },
  },
  {
    code: "permanent_member",
    name: "Miembro permanente",
    monthlyFeeCents: 20000000n,
    rights: { puede_postular_practicas: true, puede_reservar_taqueo: true },
  },
  {
    code: "partner",
    name: "Socio",
    monthlyFeeCents: 30000000n,
    rights: {
      puede_postular_practicas: true,
      puede_inscribir_copas: true,
      puede_reservar_taqueo: true,
    },
  },
  { code: "guest", name: "Invitado", monthlyFeeCents: 0n, rights: { puede_inscribir_copas: true } },
];
