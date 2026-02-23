import { createServer } from 'node:http';

import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import * as Y from 'yjs';

type WorkspaceRoom = {
  doc: Y.Doc;
  clients: Set<WebSocket>;
};

const rooms = new Map<string, WorkspaceRoom>();

function getRoom(workspaceId: string): WorkspaceRoom {
  const existing = rooms.get(workspaceId);
  if (existing) return existing;

  const room: WorkspaceRoom = {
    doc: new Y.Doc(),
    clients: new Set(),
  };

  rooms.set(workspaceId, room);
  return room;
}

function toBuffer(data: unknown): Buffer | null {
  if (data instanceof Buffer) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.from(data);
  return null;
}

const httpServer = createServer((_req, res) => {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ status: 'ok', service: 'sync' }));
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (socket, request) => {
  const requestUrl = new URL(request.url || '/', 'http://localhost');
  const workspaceId = requestUrl.searchParams.get('workspaceId') || 'default';

  const room = getRoom(workspaceId);
  room.clients.add(socket);

  const initialUpdate = Y.encodeStateAsUpdate(room.doc);
  socket.send(initialUpdate);

  socket.on('message', raw => {
    const update = toBuffer(raw);
    if (!update) return;

    Y.applyUpdate(room.doc, new Uint8Array(update));

    for (const client of room.clients) {
      if (client !== socket && client.readyState === client.OPEN) {
        client.send(update);
      }
    }
  });

  socket.on('close', () => {
    room.clients.delete(socket);

    if (room.clients.size === 0 && room.doc.store.clients.size === 0) {
      rooms.delete(workspaceId);
    }
  });
});

const host = process.env.SYNC_HOST || '0.0.0.0';
const port = Number(process.env.SYNC_PORT || 7071);

httpServer.listen(port, host, () => {
  console.log(`Finance OS sync fanout listening on ${host}:${port}`);
});
