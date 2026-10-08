// Servidor WebSocket LOCAL de demo: avisa a la UI de Planificacion que entraron
// pedidos nuevos (-> hay que "Regenerar plan"). Reemplaza el polling de 15s por
// un push instantaneo. SOLO PARA LOCAL — en AWS esto es API Gateway WebSocket.
//
// Sin dependencias: handshake RFC6455 + frames con http/crypto de Node.
// El server es puro TRANSPORTE: no lee la BD. El hook, al recibir el push,
// recalcula el conteo real contra el backend (:4000).
//
// Uso:
//   node ws-local.mjs                 # escucha WS en ws://localhost:4100
//   -> simular "llego un pedido":  curl http://localhost:4100/trigger
//      (o abre http://localhost:4100/trigger en el navegador)
//
// Demo end-to-end con conteo real:
//   1) genera un plan para un dia en la UI.
//   2) node agregar_viajes_para_recalcular.js <YYYY-MM-DD> 3   # inserta pedidos
//   3) curl http://localhost:4100/trigger                      # la UI avisa al instante
//
// ponytail: WS server propio y de un solo archivo; cuando exista API Gateway WS
// se tira este archivo y se cambia solo la URL del hook.
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.WS_LOCAL_PORT || 4100);
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const clients = new Set();

// Codifica un frame de texto server->client (sin mascara). Soporta < 64KiB.
function encode(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else {
    header = Buffer.from([0x81, 126, (len >> 8) & 0xff, len & 0xff]);
  }
  return Buffer.concat([header, payload]);
}

function broadcast(obj) {
  const frame = encode(JSON.stringify(obj));
  for (const sock of clients) {
    if (sock.writable) sock.write(frame);
  }
  console.log(`[ws-local] push a ${clients.size} cliente(s):`, obj);
}

const server = http.createServer((req, res) => {
  // CORS para que el fetch/XHR del trigger desde el navegador no se bloquee.
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url.startsWith('/trigger')) {
    broadcast({ type: 'pedidos-nuevos', at: new Date().toISOString() });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, clientes: clients.size }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(`ws-local activo. Clientes WS: ${clients.size}\nSimular pedido nuevo: GET /trigger\n`);
});

// Upgrade HTTP -> WebSocket (handshake RFC6455).
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  clients.add(socket);
  console.log(`[ws-local] cliente conectado. Total: ${clients.size}`);

  // Solo nos interesa detectar el cierre del cliente (opcode 0x8); el resto de
  // frames entrantes se ignora (no leemos payload del cliente en esta demo).
  socket.on('data', (buf) => {
    if (buf.length && (buf[0] & 0x0f) === 0x8) socket.end();
  });
  const drop = () => {
    clients.delete(socket);
    console.log(`[ws-local] cliente desconectado. Total: ${clients.size}`);
  };
  socket.on('close', drop);
  socket.on('error', drop);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[ws-local] WebSocket en ws://localhost:${PORT}  ·  trigger: http://localhost:${PORT}/trigger`);
});
