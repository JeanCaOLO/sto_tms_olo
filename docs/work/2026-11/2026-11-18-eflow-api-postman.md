# 2026-11-18 — API eFlow (EPRAC): prueba de GETs y colección en Postman

- Colección `eFlow-Api-General` (Autenticacion, TestConexion, ObtenerExpediciones y 4 POST de escritura).
- Prueba (solo GET + Autenticacion): **la API no responde**. El host 10.17.224.20 está alcanzable
  (80, 443, 8080 y 1433 abiertos) pero el puerto 87 de la API rechaza la conexión, y en los otros
  puertos `/api/TestConexion` da 404. El servicio de la API parece detenido. No se corrió ningún POST.
- `URL_EPRAC_EFLOW` termina en `/api` y las rutas de la colección ya empiezan con `/api`: usada tal
  cual daría `/api/api/...`. En Postman `BaseUrl` va sin `/api`.
- Postman (My Workspace): colección "eFlow API General (EPRAC)" con script que guarda el token, tests
  de status y los POST en una carpeta "Escritura (no correr sin coordinar)"; entorno "eFlow EPRAC"
  con BaseUrl y Usuario/Password como secretos vacíos (no se subieron credenciales a Postman).
