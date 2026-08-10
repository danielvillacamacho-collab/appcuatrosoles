/**
 * constitution.md P-08 — prohibido `new Date()`/`Date.now()` dentro de packages/domain.
 * Toda función que necesita "ahora" recibe este puerto inyectado. apps/api usa SystemClock;
 * los tests usan FixedClock para poder escribir "dado que son las 5:59 p.m." de forma exacta.
 */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    // eslint-disable-next-line no-restricted-syntax -- único punto permitido: el adaptador real.
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private readonly fixed: Date) {}

  now(): Date {
    return this.fixed;
  }
}
