import { Global, Module } from "@nestjs/common";
import { SystemClock } from "@polo/domain";

/**
 * Token de inyección del reloj. Se inyecta con `@Inject(CLOCK)`.
 *
 * P-08 prohíbe `new Date()` fuera de un adaptador, y el ESLint del repo lo hace cumplir en **todo**
 * el código, no sólo en `packages/domain`. Que el reloj sea una dependencia inyectada no es
 * ceremonia: es lo que permite que un test escriba «dado que la sesión venció hace un segundo» sin
 * esperar ni manipular el reloj del sistema operativo.
 */
export const CLOCK = Symbol("Clock");

@Global()
@Module({
  providers: [{ provide: CLOCK, useClass: SystemClock }],
  exports: [CLOCK],
})
export class ClockModule {}
