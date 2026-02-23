const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

const wss = new WebSocket.Server({ server, maxPayload: 10240 });

// State
const rooms = new Map(); // roomId -> { id, name, isPublic, host: ws, client: ws }
const clientRooms = new Map(); // ws -> roomId

function generateRoomId() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function heartbeat() {
  this.isAlive = true;
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', heartbeat);
  console.log('Client connected');

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.error('Invalid JSON');
      return;
    }

    switch (data.type) {
      case 'create_game': {
        const roomId = generateRoomId();
        let roomName = data.name;
        if (typeof roomName !== 'string') roomName = `Game ${roomId}`;
        else roomName = roomName.substring(0, 30);

        const room = {
          id: roomId,
          name: roomName,
          isPublic: !!data.isPublic,
          host: ws,
          client: null
        };
        rooms.set(roomId, room);
        clientRooms.set(ws, roomId);

        ws.send(JSON.stringify({ type: 'game_created', roomId, name: room.name, isPublic: room.isPublic }));
        console.log(`Room created: ${roomId} (${room.name}) Public: ${room.isPublic}`);
        break;
      }

      case 'list_games': {
        const publicGames = [];
        for (const [id, room] of rooms) {
          if (room.isPublic && !room.client) { // Only show open public rooms
            publicGames.push({ id, name: room.name });
          }
        }
        ws.send(JSON.stringify({ type: 'game_list', games: publicGames }));
        break;
      }

      case 'join_game': {
        const roomId = typeof data.roomId === 'string' ? data.roomId : '';
        const room = rooms.get(roomId);

        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
          return;
        }

        if (room.client) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
          return;
        }

        room.client = ws;
        clientRooms.set(ws, roomId);

        // Notify Host
        room.host.send(JSON.stringify({ type: 'player_joined' }));

        // Notify Client
        ws.send(JSON.stringify({ type: 'joined_game', roomId, name: room.name }));

        console.log(`Player joined room: ${roomId}`);
        break;
      }

      // Signaling Messages (Route to the other peer in the room)
      case 'offer':
      case 'answer':
      case 'candidate': {
        const roomId = clientRooms.get(ws);
        if (!roomId) return;

        const room = rooms.get(roomId);
        if (!room) return;

        const target = ws === room.host ? room.client : room.host;
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify(data));
        }
        break;
      }

      case 'restart': {
        // Route restart to other peer
        const roomId = clientRooms.get(ws);
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;
        const target = ws === room.host ? room.client : room.host;
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify(data));
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    const roomId = clientRooms.get(ws);
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        // If host leaves, destroy room
        if (ws === room.host) {
          if (room.client && room.client.readyState === WebSocket.OPEN) {
            room.client.send(JSON.stringify({ type: 'host_disconnected' }));
          }
          rooms.delete(roomId);
          console.log(`Room destroyed: ${roomId}`);
        }
        // If client leaves, notify host
        else if (ws === room.client) {
          room.client = null;
          if (room.host && room.host.readyState === WebSocket.OPEN) {
            room.host.send(JSON.stringify({ type: 'client_disconnected' }));
          }
          console.log(`Client left room: ${roomId}`);
        }
      }
      clientRooms.delete(ws);
    }
    console.log('Client disconnected');
  });
});

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('Terminating inactive connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Lobby Server started on port ${PORT}`);
});
