# 🚀 Quick Start Guide

Get your Walkie Talkie app running in 5 minutes!

## Step 1: Install Dependencies (2 minutes)

Open two terminal windows.

**Terminal 1 - Backend:**
```bash
cd "/Users/abeerahmad/Desktop/walkie talkie/backend"
npm install
```

**Terminal 2 - Frontend:**
```bash
cd "/Users/abeerahmad/Desktop/walkie talkie/frontend"
npm install
```

## Step 2: Start Backend Server (30 seconds)

In Terminal 1:
```bash
npm start
```

You should see:
```
🚀 Walkie Talkie Server running on port 3000
📡 WebSocket server ready for connections
```

**Important:** Note the IP address displayed (or find it using `ifconfig | grep inet` on Mac).

## Step 3: Configure Frontend (1 minute)

1. Open `frontend/App.js`
2. Find line 22
3. Replace `192.168.1.100` with YOUR computer's IP address:

```javascript
const SERVER_URL = 'http://YOUR_IP_HERE:3000';
```

Example: `'http://192.168.1.45:3000'`

## Step 4: Start Frontend (1 minute)

In Terminal 2:
```bash
npm start
```

Then:
- Press `i` for iOS Simulator (Mac only)
- Press `a` for Android Emulator
- Or scan QR code with Expo Go app on your phone

## Step 5: Test It Out! (30 seconds)

1. Enter a username (e.g., "John")
2. Enter a channel name (e.g., "test")
3. Tap "Join Channel"
4. Press and hold the big blue microphone button to talk!

## 🎉 Testing with Multiple Devices

1. Open the app on another device/simulator
2. Use the same channel name
3. Take turns pressing the talk button
4. You should hear each other!

## ⚠️ Troubleshooting

**"Cannot connect to server"**
- Make sure backend is running (`npm start` in backend folder)
- Verify SERVER_URL has correct IP address
- Ensure both devices on same WiFi network

**"Microphone permission denied"**
- Go to device Settings → App Permissions
- Enable microphone for Expo Go

**"No audio heard"**
- Check device volume
- Audio transmits AFTER releasing the button
- Grant microphone permissions

## 📞 Need Help?

Check the main README.md for detailed documentation!

---

**You're all set! Happy talking! 📻**

