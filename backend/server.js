const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// channelId -> Map(socketId -> { id, username })
const channels = new Map();

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    channels: Array.from(channels.keys()),
    ts: new Date().toISOString(),
  });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  let currentChannel = null;
  let username = 'Anonymous';

  socket.on('join-channel', ({ channelId, username: name }) => {
    try {
      if (!channelId) return;

      // Leave old
      if (currentChannel) {
        leaveChannel(socket, currentChannel);
      }

      currentChannel = channelId;
      username = name && name.trim() ? name.trim() : 'Anonymous';

      if (!channels.has(currentChannel)) {
        channels.set(currentChannel, new Map());
      }

      const channelUsers = channels.get(currentChannel);
      channelUsers.set(socket.id, { id: socket.id, username });

      socket.join(currentChannel);

      console.log(
        `User ${username} (${socket.id}) joined channel ${currentChannel}, total: ${channelUsers.size}`
      );

      socket.emit('joined-channel', {
        channelId: currentChannel,
        users: Array.from(channelUsers.values()),
        selfId: socket.id,
      });

      socket.to(currentChannel).emit('user-joined', {
        user: { id: socket.id, username },
      });
    } catch (e) {
      console.error('join-channel error', e);
      socket.emit('error', { message: 'Failed to join channel' });
    }
  });

  socket.on('leave-channel', () => {
    if (currentChannel) {
      leaveChannel(socket, currentChannel);
      currentChannel = null;
    }
  });

  // WebRTC signaling
  socket.on('webrtc-offer', ({ to, description }) => {
    if (!to || !description) return;
    io.to(to).emit('webrtc-offer', { from: socket.id, description });
  });

  socket.on('webrtc-answer', ({ to, description }) => {
    if (!to || !description) return;
    io.to(to).emit('webrtc-answer', { from: socket.id, description });
  });

  socket.on('webrtc-ice-candidate', ({ to, candidate }) => {
    if (!to || !candidate) return;
    io.to(to).emit('webrtc-ice-candidate', { from: socket.id, candidate });
  });

  socket.on('user-talking', ({ isTalking }) => {
    if (!currentChannel) return;
    const channelUsers = channels.get(currentChannel);
    const user = channelUsers?.get(socket.id);
    io.to(currentChannel).emit('user-talking', {
      userId: socket.id,
      username: user?.username || 'Unknown',
      isTalking: !!isTalking,
    });
  });

  socket.on('disconnect', (reason) => {
    console.log('Client disconnected:', socket.id, reason);
    if (currentChannel) {
      leaveChannel(socket, currentChannel);
      currentChannel = null;
    }
  });
});

function leaveChannel(socket, channelId) {
  const channelUsers = channels.get(channelId);
  if (!channelUsers) return;

  const user = channelUsers.get(socket.id);
  channelUsers.delete(socket.id);
  socket.leave(channelId);

  io.to(channelId).emit('user-left', {
    userId: socket.id,
    username: user?.username,
  });

  if (channelUsers.size === 0) {
    channels.delete(channelId);
    console.log('Channel removed (empty):', channelId);
  }

  console.log(
    `User ${user?.username || 'Unknown'} (${socket.id}) left channel ${channelId}, remaining: ${channelUsers.size}`
  );
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 WebRTC signaling server running on ${PORT}`);
});
