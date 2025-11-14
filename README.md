# 📻 Walkie Talkie App

A real-time push-to-talk communication app built with **Expo React Native** (frontend) and **Node.js** (backend). Features include real-time audio streaming, channel-based communication, and a modern, beautiful UI.

## ✨ Features

- 🎤 **Push-to-Talk** - Hold the button to broadcast your voice
- 🌐 **Real-time Communication** - Instant audio transmission using Socket.io
- 👥 **Multi-user Channels** - Create and join different channels
- 🎨 **Modern UI** - Beautiful gradient design with smooth animations
- 📱 **Cross-platform** - Works on iOS and Android
- 🔔 **Active Speaker Indicator** - See who's currently talking
- 👤 **User Presence** - View all users in your channel

## 🏗️ Tech Stack

### Frontend
- **Expo** - React Native framework
- **expo-av** - Audio recording and playback
- **socket.io-client** - Real-time bidirectional communication
- **expo-linear-gradient** - Beautiful gradient backgrounds
- **@expo/vector-icons** - Icon library

### Backend
- **Node.js** - JavaScript runtime
- **Express** - Web framework
- **Socket.io** - Real-time WebSocket communication
- **CORS** - Cross-origin resource sharing

## 📋 Prerequisites

- **Node.js** (v14 or higher)
- **npm** or **yarn**
- **Expo CLI** (`npm install -g expo-cli`)
- **iOS Simulator** (Mac) or **Android Emulator** or **Physical Device with Expo Go app**

## 🚀 Installation & Setup

### 1. Clone or Download the Project

```bash
cd "walkie talkie"
```

### 2. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Start the server
npm start
```

The backend server will run on `http://localhost:3000`

**Note:** The server will display your local IP address when it starts. You'll need this for the mobile app.

### 3. Frontend Setup

```bash
# Navigate to frontend directory (open a new terminal)
cd frontend

# Install dependencies
npm install
```

### 4. Configure Server URL

Before running the app, you need to update the server URL in `App.js`:

1. Find your computer's local IP address:
   - **Mac/Linux:** Run `ifconfig | grep "inet "` in terminal
   - **Windows:** Run `ipconfig` in command prompt
   
2. Open `frontend/App.js` and update line 22:

```javascript
const SERVER_URL = 'http://YOUR_LOCAL_IP:3000'; // e.g., 'http://192.168.1.100:3000'
```

### 5. Run the App

```bash
# Make sure you're in the frontend directory
npm start

# Then choose your platform:
# - Press 'i' for iOS Simulator (Mac only)
# - Press 'a' for Android Emulator
# - Scan QR code with Expo Go app on your physical device
```

## 📱 How to Use

1. **Launch the App** - Start the app on one or more devices
2. **Enter Username** - Type your display name
3. **Enter Channel** - Type a channel name (same channel for all users who want to communicate)
4. **Join Channel** - Tap the "Join Channel" button
5. **Talk** - Press and hold the large microphone button to talk
6. **Listen** - Release the button to stop broadcasting and listen to others

## 🎯 Project Structure

```
walkie-talkie/
├── backend/
│   ├── server.js           # Main server file with Socket.io logic
│   ├── package.json        # Backend dependencies
│   └── .env.example        # Environment variables template
│
└── frontend/
    ├── App.js              # Main React Native component
    ├── app.json            # Expo configuration
    ├── package.json        # Frontend dependencies
    ├── babel.config.js     # Babel configuration
    └── assets/             # App icons and splash screens
```

## 🔧 Configuration

### Backend Environment Variables

Create a `.env` file in the backend directory:

```env
PORT=3000
NODE_ENV=development
```

### Frontend Configuration

Update these values in `frontend/app.json` to customize your app:

- `name` - App name
- `slug` - URL-friendly name
- `version` - App version

## 🌐 API Endpoints

### REST Endpoints

- `GET /health` - Server health check
- `GET /channels` - List all active channels and users

### Socket.io Events

#### Client to Server
- `join-channel` - Join a communication channel
- `leave-channel` - Leave current channel
- `audio-data` - Send audio data to other users
- `start-talking` - Notify others that you started talking
- `stop-talking` - Notify others that you stopped talking

#### Server to Client
- `joined-channel` - Confirmation of joining a channel
- `user-joined` - Another user joined the channel
- `user-left` - A user left the channel
- `audio-stream` - Receive audio data from another user
- `user-talking` - User started/stopped talking notification

## 🐛 Troubleshooting

### Audio Not Working
- Ensure microphone permissions are granted
- Check that your device volume is up
- Try restarting the app

### Cannot Connect to Server
- Verify the SERVER_URL in App.js matches your computer's IP
- Ensure both devices are on the same WiFi network
- Check that the backend server is running
- Disable any firewall that might block port 3000

### App Crashes on Audio Recording
- Make sure you've granted microphone permissions
- Try on a different device
- Check Expo Go app is up to date

### No Audio Received
- Audio transmission happens after you release the button
- There might be a slight delay in transmission
- Ensure the sending device has microphone permission

## 📱 Testing with Multiple Devices

1. Start the backend server on your computer
2. Get your computer's local IP address
3. Update SERVER_URL in App.js
4. Run the app on multiple devices (simulators or physical devices)
5. Have all devices join the same channel
6. Test push-to-talk functionality

## 🔐 Security Considerations

⚠️ **This is a demonstration app**. For production use, consider:

- Adding user authentication
- Implementing end-to-end encryption
- Rate limiting on the backend
- Secure channel access (passwords/invites)
- Input validation and sanitization
- HTTPS/WSS for encrypted connections

## 🎨 Customization

### Change Color Theme

Edit the gradient colors in `frontend/App.js`:

```javascript
<LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} />
```

### Modify Audio Quality

Adjust recording settings in the `startRecording` function:

```javascript
sampleRate: 44100,  // Higher = better quality, more data
bitRate: 128000,    // Higher = better quality, more data
```

## 🚧 Known Limitations

- Audio is transmitted after releasing the button (not live streaming during recording)
- No audio buffering or quality optimization
- Basic error handling
- No persistent storage
- Server restarts clear all channels

## 🔮 Future Enhancements

- [ ] Live audio streaming (real-time chunks)
- [ ] Audio compression and optimization
- [ ] Recording history
- [ ] Private channels with passwords
- [ ] User profiles and avatars
- [ ] Push notifications
- [ ] Message/text chat alongside voice
- [ ] Audio effects and filters
- [ ] Web version
- [ ] Recording quality settings

## 📄 License

MIT License - feel free to use this project for learning and development.

## 🤝 Contributing

This is a demonstration project. Feel free to fork and modify as needed!

## 📞 Support

If you encounter any issues:

1. Check the troubleshooting section
2. Verify all dependencies are installed
3. Ensure you're using compatible Node.js and Expo versions
4. Check that firewall/network settings allow local connections

## 🎉 Credits

Built with ❤️ using Expo, React Native, and Node.js

---

**Happy Talking! 📻**

