const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configure CORS for Express
app.use(cors());
app.use(express.json());

// Configure Socket.io with CORS
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e8 // 100 MB for audio data
});

// Store active channels and their users
const channels = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    channels: Array.from(channels.keys()),
    timestamp: new Date().toISOString()
  });
});

// Get channel info
app.get('/channels', (req, res) => {
  const channelInfo = Array.from(channels.entries()).map(([id, users]) => ({
    id,
    userCount: users.size,
    users: Array.from(users.values())
  }));
  res.json(channelInfo);
});

io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);
  
  let currentChannel = null;
  let username = 'Anonymous';

  // Join a channel
  socket.on('join-channel', (data) => {
    const { channelId, userName } = data;
    
    // Leave previous channel if exists
    if (currentChannel) {
      leaveChannel(socket, currentChannel);
    }
    
    currentChannel = channelId;
    username = userName || 'Anonymous';
    
    // Create channel if it doesn't exist
    if (!channels.has(channelId)) {
      channels.set(channelId, new Map());
    }
    
    // Add user to channel
    channels.get(channelId).set(socket.id, { id: socket.id, username });
    socket.join(channelId);
    
    console.log(`User ${username} (${socket.id}) joined channel: ${channelId}`);
    
    // Notify user of successful join
    socket.emit('joined-channel', {
      channelId,
      users: Array.from(channels.get(channelId).values())
    });
    
    // Notify other users in the channel
    socket.to(channelId).emit('user-joined', {
      userId: socket.id,
      username,
      users: Array.from(channels.get(channelId).values())
    });
  });

  // Handle audio data streaming
  socket.on('audio-data', (data) => {
    if (currentChannel) {
      // Broadcast audio to all other users in the channel
      socket.to(currentChannel).emit('audio-stream', {
        userId: socket.id,
        username,
        audioData: data.audioData,
        timestamp: Date.now()
      });
    }
  });

  // Handle push-to-talk start
  socket.on('start-talking', () => {
    if (currentChannel) {
      socket.to(currentChannel).emit('user-talking', {
        userId: socket.id,
        username,
        isTalking: true
      });
    }
  });

  // Handle push-to-talk stop
  socket.on('stop-talking', () => {
    if (currentChannel) {
      socket.to(currentChannel).emit('user-talking', {
        userId: socket.id,
        username,
        isTalking: false
      });
    }
  });

  // Leave channel
  socket.on('leave-channel', () => {
    if (currentChannel) {
      leaveChannel(socket, currentChannel);
      currentChannel = null;
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    if (currentChannel) {
      leaveChannel(socket, currentChannel);
    }
  });
});

// Helper function to leave a channel
function leaveChannel(socket, channelId) {
  if (channels.has(channelId)) {
    const channelUsers = channels.get(channelId);
    const user = channelUsers.get(socket.id);
    
    channelUsers.delete(socket.id);
    socket.leave(channelId);
    
    // Notify other users
    socket.to(channelId).emit('user-left', {
      userId: socket.id,
      username: user?.username,
      users: Array.from(channelUsers.values())
    });
    
    // Remove channel if empty
    if (channelUsers.size === 0) {
      channels.delete(channelId);
      console.log(`Channel ${channelId} removed (empty)`);
    }
    
    console.log(`User ${user?.username} (${socket.id}) left channel: ${channelId}`);
  }
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Walkie Talkie Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready for connections`);
});

