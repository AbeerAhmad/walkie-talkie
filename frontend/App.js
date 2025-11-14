import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import io from 'socket.io-client';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

// REPLACE WITH YOUR SERVER URL
const SERVER_URL = 'http://192.168.1.100:3000'; // Change to your computer's IP address

export default function App() {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentChannel, setCurrentChannel] = useState('');
  const [username, setUsername] = useState('');
  const [isInChannel, setIsInChannel] = useState(false);
  const [users, setUsers] = useState([]);
  const [isTalking, setIsTalking] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState(null);
  const [hasPermission, setHasPermission] = useState(false);

  const recordingRef = useRef(null);
  const soundRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setupAudio();
    connectToServer();

    return () => {
      if (socket) {
        socket.disconnect();
      }
      cleanupAudio();
    };
  }, []);

  const setupAudio = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      setHasPermission(status === 'granted');
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        playThroughEarpieceAndroid: false,
      });
    } catch (error) {
      console.error('Failed to setup audio:', error);
      Alert.alert('Error', 'Failed to setup audio permissions');
    }
  };

  const connectToServer = () => {
    const newSocket = io(SERVER_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    newSocket.on('joined-channel', (data) => {
      console.log('Joined channel:', data);
      setUsers(data.users);
      setIsInChannel(true);
    });

    newSocket.on('user-joined', (data) => {
      console.log('User joined:', data);
      setUsers(data.users);
    });

    newSocket.on('user-left', (data) => {
      console.log('User left:', data);
      setUsers(data.users);
    });

    newSocket.on('audio-stream', async (data) => {
      await playAudioData(data.audioData);
    });

    newSocket.on('user-talking', (data) => {
      if (data.isTalking) {
        setActiveSpeaker(data.username);
      } else {
        setActiveSpeaker(null);
      }
    });

    setSocket(newSocket);
  };

  const joinChannel = () => {
    if (!username.trim() || !currentChannel.trim()) {
      Alert.alert('Error', 'Please enter both username and channel name');
      return;
    }

    if (!hasPermission) {
      Alert.alert('Error', 'Microphone permission is required');
      return;
    }

    socket.emit('join-channel', {
      channelId: currentChannel.trim(),
      userName: username.trim(),
    });
  };

  const leaveChannel = () => {
    if (socket && isInChannel) {
      socket.emit('leave-channel');
      setIsInChannel(false);
      setUsers([]);
      setActiveSpeaker(null);
    }
  };

  const startRecording = async () => {
    if (!hasPermission) {
      Alert.alert('Error', 'Microphone permission is required');
      return;
    }

    try {
      setIsTalking(true);
      socket.emit('start-talking');
      
      // Start pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();

      Animated.timing(glowAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
          audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_MPEG4AAC,
          audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
      });

      await recording.startAsync();
      recordingRef.current = recording;

      // Stream audio data periodically
      const streamInterval = setInterval(async () => {
        if (recordingRef.current) {
          try {
            const uri = recordingRef.current.getURI();
            if (uri) {
              // In a production app, you'd read the audio file and send chunks
              // For simplicity, we'll just signal that we're recording
            }
          } catch (error) {
            console.error('Error streaming audio:', error);
          }
        }
      }, 100);

      recordingRef.current.streamInterval = streamInterval;
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording');
      setIsTalking(false);
    }
  };

  const stopRecording = async () => {
    try {
      if (recordingRef.current) {
        // Clear interval
        if (recordingRef.current.streamInterval) {
          clearInterval(recordingRef.current.streamInterval);
        }

        await recordingRef.current.stopAndUnloadAsync();
        const uri = recordingRef.current.getURI();
        
        if (uri && socket) {
          // Read the audio file and send it
          const response = await fetch(uri);
          const blob = await response.blob();
          const reader = new FileReader();
          
          reader.onloadend = () => {
            const base64Audio = reader.result.split(',')[1];
            socket.emit('audio-data', { audioData: base64Audio });
          };
          
          reader.readAsDataURL(blob);
        }

        recordingRef.current = null;
      }

      setIsTalking(false);
      socket.emit('stop-talking');
      
      // Stop animations
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      Animated.timing(glowAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  const playAudioData = async (base64Audio) => {
    try {
      // Clean up previous sound
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      // Convert base64 to playable audio
      const sound = new Audio.Sound();
      await sound.loadAsync({
        uri: `data:audio/m4a;base64,${base64Audio}`,
      });
      
      soundRef.current = sound;
      await sound.playAsync();
      
      // Unload after playing
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  };

  const cleanupAudio = async () => {
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (error) {
        console.error('Error cleaning up recording:', error);
      }
    }
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch (error) {
        console.error('Error cleaning up sound:', error);
      }
    }
  };

  const renderUser = ({ item }) => (
    <View style={styles.userItem}>
      <View style={styles.userAvatar}>
        <FontAwesome5 name="user" size={20} color="#fff" />
      </View>
      <Text style={styles.userName}>{item.username}</Text>
      {activeSpeaker === item.username && (
        <MaterialIcons name="graphic-eq" size={24} color="#00d4ff" />
      )}
    </View>
  );

  if (!isInChannel) {
    return (
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.container}>
        <StatusBar style="light" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.content}
        >
          <View style={styles.header}>
            <Ionicons name="radio" size={80} color="#00d4ff" />
            <Text style={styles.title}>Walkie Talkie</Text>
            <Text style={styles.subtitle}>Push to Talk Communication</Text>
          </View>

          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, isConnected && styles.statusDotConnected]} />
            <Text style={styles.statusText}>
              {isConnected ? 'Connected to Server' : 'Connecting...'}
            </Text>
          </View>

          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <MaterialIcons name="person" size={24} color="#00d4ff" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your username"
                placeholderTextColor="#8892b0"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputWrapper}>
              <MaterialIcons name="group" size={24} color="#00d4ff" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter channel name"
                placeholderTextColor="#8892b0"
                value={currentChannel}
                onChangeText={setCurrentChannel}
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              style={[styles.joinButton, !isConnected && styles.joinButtonDisabled]}
              onPress={joinChannel}
              disabled={!isConnected}
            >
              <LinearGradient
                colors={isConnected ? ['#00d4ff', '#0099cc'] : ['#666', '#444']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.joinButtonGradient}
              >
                <Text style={styles.joinButtonText}>Join Channel</Text>
                <MaterialIcons name="arrow-forward" size={24} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {hasPermission ? '🎤 Microphone Ready' : '⚠️ Microphone Permission Required'}
            </Text>
          </View>
        </KeyboardAvoidingView>
      </LinearGradient>
    );
  }

  const glowColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(0, 212, 255, 0)', 'rgba(0, 212, 255, 0.5)'],
  });

  return (
    <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.container}>
      <StatusBar style="light" />
      
      <View style={styles.channelHeader}>
        <View>
          <Text style={styles.channelName}>#{currentChannel}</Text>
          <Text style={styles.channelUsers}>{users.length} users online</Text>
        </View>
        <TouchableOpacity style={styles.leaveButton} onPress={leaveChannel}>
          <MaterialIcons name="exit-to-app" size={24} color="#ff4757" />
        </TouchableOpacity>
      </View>

      {activeSpeaker && (
        <View style={styles.activeSpeakerBanner}>
          <MaterialIcons name="graphic-eq" size={24} color="#00d4ff" />
          <Text style={styles.activeSpeakerText}>{activeSpeaker} is talking</Text>
        </View>
      )}

      <View style={styles.usersContainer}>
        <Text style={styles.usersTitle}>Active Users</Text>
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => item.id}
          style={styles.usersList}
          contentContainerStyle={styles.usersListContent}
        />
      </View>

      <View style={styles.talkContainer}>
        <Text style={styles.talkInstructions}>
          {isTalking ? 'Release to stop talking' : 'Press and hold to talk'}
        </Text>
        
        <Animated.View
          style={[
            styles.talkButtonShadow,
            {
              transform: [{ scale: pulseAnim }],
              shadowColor: glowColor,
            },
          ]}
        >
          <TouchableOpacity
            style={[styles.talkButton, isTalking && styles.talkButtonActive]}
            onPressIn={startRecording}
            onPressOut={stopRecording}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={isTalking ? ['#ff4757', '#ff6348'] : ['#00d4ff', '#0099cc']}
              style={styles.talkButtonGradient}
            >
              <MaterialIcons
                name={isTalking ? 'mic' : 'mic-none'}
                size={80}
                color="#fff"
              />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        <Text style={styles.talkStatus}>
          {isTalking ? '🔴 Broadcasting' : '⚪ Ready'}
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#8892b0',
    marginTop: 8,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ff4757',
    marginRight: 8,
  },
  statusDotConnected: {
    backgroundColor: '#2ecc71',
  },
  statusText: {
    color: '#8892b0',
    fontSize: 14,
  },
  inputContainer: {
    width: '100%',
    maxWidth: 400,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.3)',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 16,
  },
  joinButton: {
    marginTop: 10,
    borderRadius: 12,
    overflow: 'hidden',
  },
  joinButtonDisabled: {
    opacity: 0.5,
  },
  joinButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 32,
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 8,
  },
  footer: {
    marginTop: 40,
  },
  footerText: {
    color: '#8892b0',
    fontSize: 14,
  },
  channelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  channelName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  channelUsers: {
    fontSize: 14,
    color: '#8892b0',
    marginTop: 4,
  },
  leaveButton: {
    padding: 10,
    backgroundColor: 'rgba(255, 71, 87, 0.2)',
    borderRadius: 10,
  },
  activeSpeakerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 212, 255, 0.2)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    borderRadius: 10,
    marginBottom: 20,
  },
  activeSpeakerText: {
    color: '#00d4ff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  usersContainer: {
    flex: 1,
    paddingHorizontal: 20,
  },
  usersTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  usersList: {
    flex: 1,
  },
  usersListContent: {
    paddingBottom: 20,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.2)',
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 212, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userName: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  talkContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  talkInstructions: {
    color: '#8892b0',
    fontSize: 16,
    marginBottom: 30,
    textAlign: 'center',
  },
  talkButtonShadow: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 30,
    elevation: 10,
  },
  talkButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  talkButtonActive: {
    borderColor: 'rgba(255, 71, 87, 0.5)',
  },
  talkButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  talkStatus: {
    marginTop: 30,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
});

