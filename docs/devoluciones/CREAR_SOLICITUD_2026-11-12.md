# Crear solicitud desde Devoluciones

**Estado:** implementado y probado localmente; sin despliegue ni migración compartida aplicada. Corte: 2026-11-12.

## Comportamiento

- Una sola entrada de menú: **Devoluciones**. `/mis-devoluciones` redirige a `/devoluciones` para conservar enlaces anteriores.
- La sección **Solicitudes** contiene el botón **Crear solicitud**. Abre el formulario dentro de un diálogo; no navega a otro módulo.
- Cliente usa la empresa asociada a su usuario, sin selector ni alcance de recepción operativa. Superusuarios y gerentes eligen una empresa permitida por organización, scopes y países del rol. Se conserva el permiso de creación; una etiqueta de rol no sustituye sus grants.
- El catálogo de creación incluye empresas autorizadas que aún no tienen solicitudes. No se limita a las empresas que aparezcan en la bandeja histórica.
- Guardar conserva artículos, foto/video, límites e idempotencia existentes. Al confirmar se refresca la bandeja. Errores y envíos inciertos no muestran un éxito falso.
- El intento y borrador viven en memoria por usuario/empresa fuera de la bandeja que se remonta al cambiar país. Reabrir un envío incierto conserva clave/payload/subidas; cambiar usuario crea un workspace separado. No se guardaron estos borradores en localStorage.
- Durante un envío o confirmación incierta se bloquean cierre y cambio de empresa del diálogo. Las subidas y solicitudes usan la misma empresa/autor en backend; el payload de Cliente no puede elegir otra empresa.

## Contratos y archivos

Se reutilizan las rutas admin existentes. `GET /solicitudes-devolucion/asignacion?empresas=1&pais=...` devuelve opciones autorizadas únicamente a los creadores operativos permitidos. Sin `empresas=1`, conserva la respuesta de empresa fija del Cliente.

Los POST de solicitud y firma de subida aceptan `customer_id` para superusuarios/gerentes autorizados; el servidor vuelve a validar el alcance. Para Cliente, organización/empresa/autor siguen saliendo de su identidad. La organización y el autor no se aceptan del navegador.

La guarda de ruta, el menú y la página de inicio comparten el criterio de acceso a Devoluciones. Acceder al contenedor con permiso de solicitudes no habilita APIs de recepción ni bandeja operativa.

## Dependencia SQL68

SQL67 exige que autor y empresa tengan asignación personal. Por ello, **antes de publicar la captura operativa debe aplicarse la propuesta `68_return_requests_operator_capture.sql` por el responsable autorizado**. Conserva la empresa/autor históricos y admite gerente/superusuario de la misma organización, sin convertir solicitudes existentes. Los scopes y permisos siguen siendo responsabilidad del backend.

Se preparó rollback que restaura la regla de captura anterior sin borrar solicitudes ya creadas. Ambos caminos se probaron exclusivamente en PostgreSQL en memoria. **No se aplicó SQL68 en Aurora ni se desplegó backend/frontend.** Una API local conectada a un esquema que todavía conserva solo SQL67 rechazará la captura de un operador sin empresa asignada.

## Verificación

Las pruebas primero reprodujeron la ausencia del botón, el bloqueo de Cliente en RouteGuard y la pérdida del borrador/clave al cambiar país durante el envío. Después comprobaron creación Cliente/Gerente/SuperUsuario, scopes, permisos y reintento con la misma clave.

Chrome con API interceptada completó los tres roles sin excepciones de JavaScript y con **cero llamadas reenviadas al backend**. No se crearon solicitudes reales. Evidencia local: `TMS/.test/integracion_2026-11-12/crear-solicitud-navegador.json` y capturas `crear-solicitud-*.png`.

El cierre de suites y staging se registra en `CIERRE_CONTINUACION_2026-11-12.md` de esta carpeta.

## Siguiente etapa funcional

La continuación posterior implementó autoaprobación de solicitudes nuevas y Novedades con texto, según [la entrega local](SOLICITUDES_AUTOMATICAS_Y_NOVEDADES_2026-11-12.md). Además de SQL68 requiere los scripts 69 y 70 antes de publicar el código actualizado. El seguimiento real, el paso a Por recibir con foto de recolecta y [el receptor de Planificación](PENDIENTE_PLANIFICACION_RECOLECTAS.md) quedan pendientes. El botón no certifica esa integración.
