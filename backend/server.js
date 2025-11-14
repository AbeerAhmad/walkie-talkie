const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Socket.io with safer buffer limit
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 5e6, // 5 MB (enough for short clips)
});

// Store active channels and their users
const channels = new Map();

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    channels: Array.from(channels.keys()),
    timestamp: new Date().toISOString(),
  });
});

// Channel info
app.get('/channels', (req, res) => {
  const channelInfo = Array.from(channels.entries()).map(([id, users]) => ({
    id,
    userCount: users.size,
    users: Array.from(users.values()),
  }));
  res.json(channelInfo);
});

io.on('connection', (socket) => {
  // console.log(`New client connected: ${socket.id}`);
  // console.log(`Total connections: ${io.sockets.sockets.size}`);

  let currentChannel = null;
  let username = 'Anonymous';

  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });

  // Join a channel
  socket.on('join-channel', (data) => {
    try {
      if (!data) {
        console.warn(`Socket ${socket.id} tried to join channel without data`);
        socket.emit('error', { message: 'Invalid join request' });
        return;
      }

      const { channelId, userName } = data;

      if (!channelId || typeof channelId !== 'string' || channelId.trim() === '') {
        console.warn(`Socket ${socket.id} tried to join with invalid channelId`);
        socket.emit('error', { message: 'Invalid channel ID' });
        return;
      }

      // Leave previous channel
      if (currentChannel) {
        leaveChannel(socket, currentChannel);
      }

      currentChannel = channelId.trim();
      username =
        userName && typeof userName === 'string' && userName.trim() !== ''
          ? userName.trim()
          : 'Anonymous';

      // Create channel if not exists
      if (!channels.has(currentChannel)) {
        channels.set(currentChannel, new Map());
        // console.log(`New channel created: ${currentChannel}`);
      }

      // Add user to channel
      channels.get(currentChannel).set(socket.id, { id: socket.id, username });
      socket.join(currentChannel);

      // console.log(`User ${username} (${socket.id}) joined channel: ${currentChannel}`);

      // Notify user
      socket.emit('joined-channel', {
        channelId: currentChannel,
        users: Array.from(channels.get(currentChannel).values()),
      });

      // Notify others
      socket.to(currentChannel).emit('user-joined', {
        userId: socket.id,
        username,
        users: Array.from(channels.get(currentChannel).values()),
      });
    } catch (error) {
      console.error(`Error handling join-channel from ${socket.id}:`, error);
      socket.emit('error', { message: 'Failed to join channel' });
    }
  });

  // Audio data (single clip after user releases button)
  socket.on('audio-data', (data) => {
    try {
      if (!currentChannel) {
        console.warn(`User ${username} (${socket.id}) tried to send audio but not in a channel`);
        return;
      }

      if (!data || !data.audioData || typeof data.audioData !== 'string') {
        console.warn(`User ${username} (${socket.id}) sent invalid audio data`);
        return;
      }

      // const audioDataLength = data.audioData.length;
      // console.log(
      //   `User ${username} (${socket.id}) sending audio to channel ${currentChannel}, base64 length: ${audioDataLength}`
      // );

      const channelUsers = channels.get(currentChannel);
      // const userCount = channelUsers ? channelUsers.size : 0;
      // const recipientCount = userCount > 0 ? userCount - 1 : 0;

      socket.to(currentChannel).emit('audio-stream', {
        userId: socket.id,
        username,
        audioData: data.audioData,
        timestamp: Date.now(),
      });

      // console.log(`Audio broadcasted to ${recipientCount} user(s) in channel ${currentChannel}`);
    } catch (error) {
      console.error(`Error handling audio data from ${username} (${socket.id}):`, error);
    }
  });

  // Push-to-talk start
  socket.on('start-talking', () => {
    try {
      if (currentChannel) {
        socket.to(currentChannel).emit('user-talking', {
          userId: socket.id,
          username,
          isTalking: true,
        });
        // console.log(`User ${username} (${socket.id}) started talking in channel ${currentChannel}`);
      }
    } catch (error) {
      console.error(`Error handling start-talking from ${socket.id}:`, error);
    }
  });

  // Push-to-talk stop
  socket.on('stop-talking', () => {
    try {
      if (currentChannel) {
        socket.to(currentChannel).emit('user-talking', {
          userId: socket.id,
          username,
          isTalking: false,
        });
        // console.log(`User ${username} (${socket.id}) stopped talking in channel ${currentChannel}`);
      }
    } catch (error) {
      console.error(`Error handling stop-talking from ${socket.id}:`, error);
    }
  });

  // Leave channel
  socket.on('leave-channel', () => {
    if (currentChannel) {
      leaveChannel(socket, currentChannel);
      currentChannel = null;
    }
  });

  // Disconnect
  socket.on('disconnect', (reason) => {
    // console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
    if (currentChannel) {
      leaveChannel(socket, currentChannel);
      currentChannel = null;
    }
    // console.log(`Remaining connections: ${io.sockets.sockets.size}`);
  });
});

// Helper for leaving a channel
function leaveChannel(socket, channelId) {
  if (!channels.has(channelId)) return;

  const channelUsers = channels.get(channelId);
  const user = channelUsers.get(socket.id);

  channelUsers.delete(socket.id);
  socket.leave(channelId);

  socket.to(channelId).emit('user-left', {
    userId: socket.id,
    username: user?.username,
    users: Array.from(channelUsers.values()),
  });

  if (channelUsers.size === 0) {
    channels.delete(channelId);
    // console.log(`Channel ${channelId} removed (empty)`);
  }

  // console.log(`User ${user?.username || 'Unknown'} (${socket.id}) left channel: ${channelId}`);
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Walkie Talkie Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Channels info: http://localhost:${PORT}/channels`);
});

server.on('error', (error) => {
  console.error('Server error:', error);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
