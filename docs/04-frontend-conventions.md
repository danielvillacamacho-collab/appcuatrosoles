# 04 — Convenciones de frontend

React 19 + Vite + TanStack Router/Query + Tailwind 4 + shadcn/ui (`ADR-003`, `ADR-004`).
Mobile-first porque la mayoría de los jugadores va a usar esto desde el celular en la
cancha, no desde un escritorio (`docs/06` operating manual — "ábrelo en tu teléfono" es la
prueba que más importa).

## 1. Design tokens — extraídos del brandbook, no inventados

Fuente: `docs/brand/brandbook_text.txt` y las pantallas de referencia en
`docs/brand/sistema-diseno-mockup.dc.html`. Se cargan en `packages/ui/tokens.css` como
variables CSS y se exponen a Tailwind vía `tailwind.config.ts`, nunca como valores hex sueltos
dentro de un componente.

```css
:root {
  /* Colores de marca (brandbook 2025) */
  --color-coquelicot: #F64A1F;   /* acento, llamados a la acción, alertas suaves */
  --color-brunswick:  #224331;   /* texto de marca, enlaces, verde institucional */
  --color-jonquil:    #FFCB00;   /* énfasis puntual, nunca como color de fondo grande */
  --color-black:      #000000;
  --color-white:      #FFFFFF;

  /* Neutros de aplicación (del mockup, no del brandbook — la app necesita más rango) */
  --color-cream:      #EFE9DB;   /* fondo por defecto en modo claro */
  --color-ink:        #1B241D;   /* texto principal en modo claro */
  --color-forest:     #16261C;   /* fondo en superficies oscuras (splash, cards oscuras) */
  --color-bone:        #FAF6EE;   /* texto sobre fondo oscuro */
  --color-sage:        #B9C4B4;   /* texto secundario sobre fondo oscuro */
  --color-muted:        #5B6058;   /* texto secundario sobre fondo claro */
}

/* Tipografía: Montserrat es la única familia (brandbook §16) */
--font-sans: 'Montserrat', system-ui, sans-serif;
--tracking-title: 0.15em;   /* uppercase, para eyebrows/etiquetas de sección */
```

**Regla:** un componente nuevo no introduce un color que no esté en esta lista sin pasar
primero por este archivo. Si hace falta un tono nuevo (p. ej. un rojo de error que no es el
Coquelicot de marca), se agrega aquí con su justificación, no inline en el componente.

**Contraste.** Coquelicot sobre crema y Jonquil sobre fondos oscuros ya están validados
visualmente en el brandbook; cualquier combinación nueva se verifica con una herramienta de
contraste WCAG AA antes de usarse en texto (no sólo en decoración). Esto también aplica a
`docs/brand` cuando un club cliente cargue su propio color (`specs/140` HU-140-04).

## 2. Mobile-first, en serio

> **Mobile-first no es mobile-only, y la diferencia costó una corrección entera.** La primera
> versión de las pantallas se construyó y se revisó sólo en un teléfono: el fondo del club vivía en
> el `<main>` de cada ruta y los contenedores estaban fijos en `max-w-2xl`. En un celular se veía
> perfecto. En un monitor, el color terminaba a los 672 px —el resto lo pintaba el navegador con su
> fondo por defecto— y un listado de usuarios quedaba encerrado en una columna angosta con media
> pantalla vacía al lado.
>
> Lo que quedó de eso, y ahora está probado en `src/test/responsive.spec.ts`:
>
> - **El fondo lo pinta el documento** (`html` en `index.css`), nunca una pantalla.
> - **El ancho lo decide un marco compartido** (`components/Pantalla.tsx`) por tramos, y no cada
>   ruta a mano. Dos anchos: `lectura` para textos y formularios, `tabla` para listados.
> - **Un listado cambia de forma, no sólo de ancho**: tarjetas en el celular, tabla con encabezados
>   desde `md`. Una tabla de cinco columnas en un teléfono obliga a desplazar en horizontal; una
>   pila de tarjetas en un monitor desperdicia el espacio que permite comparar de un vistazo.
> - **Los formularios sin sesión se quedan estrechos también en escritorio.** Un formulario de dos
>   campos estirado a 1400 px se lee peor, no mejor.

- Se diseña y se construye para 375–430px de ancho primero; el layout de escritorio es una
  extensión (breakpoints `sm/md/lg` de Tailwind), no al revés.
- Objetivos táctiles mínimo 44×44px. Ningún control interactivo por debajo de eso, sin
  excepción — incluye la grilla de chukkers y la lista de jugadores, que son las pantallas
  con más densidad de información.
- La navegación principal en mobile es una barra inferior fija (patrón ya usado en el mockup
  de `docs/brand`), no un menú hamburguesa escondido: las acciones de uso diario (calendario,
  postularme, mi cuenta) están a un tap.
- PWA (`ADR-010`): manifiesto e iconos desde el día uno de `apps/web`, service worker de
  carcasa desde la Fase 1, cola de escritura diferida (para el tablero de petiseros sin señal)
  se agrega en la fase que le corresponde — no antes.

## 3. Rutas

TanStack Router, rutas tipadas por archivo en `apps/web/src/routes`. Convención de nombres en
inglés (regla de oro 1 de `CLAUDE.md`); el copy de la ruta (breadcrumbs, títulos de pestaña)
sale de `i18n/es-CO.ts`, nunca hardcodeado en el archivo de ruta.

```
routes/
├── _authenticated/
│   ├── practices/
│   │   ├── index.tsx        # listado
│   │   └── $practiceId.tsx  # detalle + postulación
│   ├── calendar/index.tsx
│   └── me/account.tsx
├── login.tsx
└── _authenticated.tsx       # guard de sesión + resolución de club activo
```

## 4. Estado: qué va en TanStack Query y qué va en Zustand

- **TanStack Query** para todo lo que viene del servidor: listados, detalle, mutaciones. Cada
  feature define sus hooks en `features/<feature>/api/` usando los esquemas de
  `packages/contracts` — nunca `fetch` suelto dentro de un componente.
- **Zustand**, con moderación, sólo para estado de UI que no sobrevive un refresh y que no es
  del servidor: filtros activos del calendario, borrador en edición de la grilla de chukkers
  antes de guardar. Si un dato se puede derivar de una query, no se duplica en un store.
- Claves de query estructuradas y centralizadas (`queryKeys.practices.detail(id)`), no strings
  sueltos repetidos en cada archivo — evita el "invalidé la query mal escrita" tres meses
  después.

## 5. Formularios

React Hook Form + Zod, con el **mismo esquema** que valida en el backend (compartido desde
`packages/contracts` cuando la forma coincide 1:1; si el formulario agrega campos de UI que no
van al API, se deriva con `.pick()`/`.omit()`, nunca se duplica a mano). Mensajes de error de
validación en español, centralizados junto al resto del copy.

## 6. Componentes

- shadcn/ui se copia a `packages/ui/components`, no se instala como dependencia (`ADR-004`) —
  el agente puede modificar un componente base sin pelear con `node_modules`.
- Todo componente interactivo hereda accesibilidad de Radix (foco, teclado, ARIA); no se
  reimplementa un `<div onClick>` donde existe un primitivo accesible.
- Un componente de dominio (`PracticeCard`, `HandicapBadge`, `WalletBalance`) vive en
  `features/<feature>/components`; un componente genérico de UI (`Button`, `Badge`, `Sheet`)
  vive en `packages/ui` y no conoce el dominio del polo.

## 7. Copy e idioma

Regla de oro 1 (`CLAUDE.md`): español en la UI, centralizado en `apps/web/src/i18n/es-CO.ts`.
Ningún componente escribe un string visible al usuario inline. Esto no es sólo para una
futura internacionalización — es lo que permite que el club revise y corrija el lenguaje del
producto (voz de marca: "cálida, auténtica, invitacional" — brandbook §6) sin tocar código.

## 8. Presupuesto de bundle

El bundle inicial comprimido no supera 200 KB (`ADR-014` punto 9); CI lo mide en cada build.
Import dinámico por ruta para pantallas pesadas (grilla de chukkers, tablero de reportes).
Ningún paquete nuevo se agrega "porque es útil" sin medir su costo contra este presupuesto.
