// Componentes genéricos de interfaz. **Este paquete no conoce el dominio del polo** (`docs/04`
// §6): aquí no entra un `PracticeCard` ni un `HandicapBadge`, que van en su feature.
//
// Los de shadcn/ui se copian aquí cuando hagan falta (no como dependencia — `ADR-004`). Los que
// hay hoy son HTML nativo con la accesibilidad ya resuelta: un `<button>` y un `<input>` no
// necesitan Radix, un diálogo o un select con teclado sí.
export { Alert } from "./components/Alert.js";
export { Button, type ButtonProps } from "./components/Button.js";
export { TextField, type TextFieldProps } from "./components/TextField.js";
