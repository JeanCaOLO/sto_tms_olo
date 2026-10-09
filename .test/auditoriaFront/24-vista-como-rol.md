# Registro — Botones «Ver como: Liquidador / Desarrollador» (2026-10-08)

Pedido: dos botones para mostrarle al jefe cómo se ve el módulo para cada rol, con sus alcances. Es solo una vista de demostración.

## Qué se hizo
- `hooks/usePermissions.tsx`: `viewAs` (`'desarrollador'` | `'liquidador'`), `setViewAs` y `canPreview`. La preferencia se guarda en `sessionStorage` (solo esa pestaña; al cerrar vuelve a «Desarrollador»).
  - **Desarrollador** = los permisos reales del usuario (SuperUsuario/SuperAdministrador ven todo).
  - **Liquidador** = simula esa matriz: `tarifas` ver/crear/editar/exportar y `tarifas.config` solo ver y exportar; **todo lo demás del sistema queda oculto**. Con eso cambia todo lo que ya dependía de `can()`: menú lateral (solo Tarifas), pestañas de Reglas (sin Probador ni Alerta Margen), botones de escribir ocultos o deshabilitados, «Ver» en vez de «Editar», sin vista extendida.
- `components/feature/ViewAsToggle.tsx`: dos botones flotantes abajo a la derecha («Ver como | Liquidador | Desarrollador»), con `aria-pressed`. Al elegir Liquidador lleva a `/liquidaciones`. Solo los ve quien puede configurar el tarifador (`tarifas.config` editar: administradores y desarrolladores); un Liquidador real no los ve.
- Montado en `Header.tsx` (posición fija, no empuja nada; oculto al imprimir).
- **Solo cambia lo que se muestra**: el backend sigue aplicando los permisos reales del usuario, así que no es una forma de saltarse nada.

## Pruebas
- `ViewAsToggle.test.tsx` (2): un administrador alterna y los permisos cambian (`false,true,true,false` en vista Liquidador); quien no puede configurar no ve los botones.

## Verificación en navegador
SuperUsuario → botones visibles; «Liquidador»: menú solo con Tarifas, `/reglas-tarifa` con pestañas Reglas · Tarifarios · Bitácora y sin «Nueva Regla»; «Desarrollador» restaura todo. Se probó que en un primer intento un pill dentro del encabezado aplastaba el buscador; se pasó a flotante.

## Nota sobre los «congelamientos» del navegador
Se aisló la causa con pruebas por eliminación (se desactivaron por separado el botón, la medición de las tablas, los permisos y las descripciones): ninguna era la causa. Con el servidor de desarrollo, la PRIMERA carga tras editar archivos tarda hasta ~50 s en armar los módulos (la página se ve en blanco y la captura da «renderer frozen»); pasado ese tiempo carga normal. No es un bucle del código. Para presentarle al jefe conviene abrir el sistema una vez antes (o usar un build: `npm run build && npm run preview`), para que no vea esa espera.
