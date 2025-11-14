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
import * as FileSystem from 'expo-file-system/legacy';
import io from 'socket.io-client';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

// REPLACE WITH YOUR SERVER URL
const SERVER_URL = 'http://192.168.100.62:3000'; // Your computer's IP address

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
  const socketRef = useRef(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulseAnimationRef = useRef(null);

  useEffect(() => {
    setupAudio();
    connectToServer();

    return () => {
      // Disconnect socket
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      // Stop animations
      if (pulseAnimationRef.current) {
        pulseAnimationRef.current.stop();
        pulseAnimationRef.current = null;
      }
      pulseAnim.stopAnimation();
      glowAnim.stopAnimation();

      // Cleanup audio resources
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
        shouldDuckAndroid: true,
      });

      console.log('Audio mode configured');
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

    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
      setIsInChannel(false);
      setUsers([]);
      setActiveSpeaker(null);
    });

    newSocket.on('joined-channel', (data) => {
      console.log('Joined channel:', data);
      setUsers(data.users || []);
      setIsInChannel(true);
    });

    newSocket.on('user-joined', (data) => {
      console.log('User joined:', data);
      setUsers(data.users || []);
    });

    newSocket.on('user-left', (data) => {
      console.log('User left:', data);
      setUsers(data.users || []);
    });

    newSocket.on('audio-stream', async (data) => {
      console.log('Received audio stream from:', data.username);
      if (data.audioData) {
        setActiveSpeaker(data.username || 'Unknown');
        await playAudioData(data.audioData);
        // Clear indicator slightly after playback
        setTimeout(() => {
          setActiveSpeaker(null);
        }, 500);
      } else {
        console.warn('No audio data in stream');
      }
    });

    newSocket.on('user-talking', (data) => {
      if (data.isTalking) {
        setActiveSpeaker(data.username);
      } else {
        setActiveSpeaker(null);
      }
    });

    newSocket.on('error', (err) => {
      console.error('Socket error event:', err);
    });
  };

  const joinChannel = () => {
    if (!socketRef.current || !socketRef.current.connected) {
      Alert.alert('Error', 'Not connected to server');
      return;
    }

    if (!username.trim() || !currentChannel.trim()) {
      Alert.alert('Error', 'Please enter both username and channel name');
      return;
    }

    if (!hasPermission) {
      Alert.alert('Error', 'Microphone permission is required');
      return;
    }

    socketRef.current.emit('join-channel', {
      channelId: currentChannel.trim(),
      userName: username.trim(),
    });
  };

  const leaveChannel = () => {
    if (socketRef.current && isInChannel) {
      socketRef.current.emit('leave-channel');
    }
    setIsInChannel(false);
    setUsers([]);
    setActiveSpeaker(null);
  };

  const startRecording = async () => {
    if (!hasPermission) {
      Alert.alert('Error', 'Microphone permission is required');
      return;
    }
    if (!socketRef.current || !socketRef.current.connected) {
      Alert.alert('Error', 'Not connected to server');
      return;
    }

    // Prevent double-record
    if (recordingRef.current) {
      try {
        const status = await recordingRef.current.getStatusAsync();
        if (status.isRecording) {
          console.log('Already recording, skipping...');
          return;
        }
      } catch {
        recordingRef.current = null;
      }
    }

    try {
      setIsTalking(true);
      socketRef.current.emit('start-talking');

      // Start pulse animation
      if (pulseAnimationRef.current) {
        pulseAnimationRef.current.stop();
      }
      pulseAnimationRef.current = Animated.loop(
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
      );
      pulseAnimationRef.current.start();

      Animated.timing(glowAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Cleanup old recording
      if (recordingRef.current) {
        try {
          const status = await recordingRef.current.getStatusAsync();
          if (status.isRecording || status.canRecord) {
            await recordingRef.current.stopAndUnloadAsync();
          }
        } catch {}
        recordingRef.current = null;
      }

      if (Platform.OS === 'ios') {
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            playThroughEarpieceAndroid: false,
            shouldDuckAndroid: true,
            interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_MIX_WITH_OTHERS,
            interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
          });
        } catch (e) {
          console.log('iOS recording audio mode setup:', e);
        }
      }

      const recording = new Audio.Recording();

      // Lighter audio config for walkie-talkie
      const recordingOptions = {
        android: {
          extension: '.m4a',
          outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
          audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 64000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_MPEG4AAC,
          audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_MEDIUM,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 64000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 64000,
        },
      };

      await recording.prepareToRecordAsync(recordingOptions);
      await recording.startAsync();
      console.log('Recording started');
      recordingRef.current = recording;
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording');
      setIsTalking(false);
      stopAnimations();
    }
  };

  const stopAnimations = () => {
    if (pulseAnimationRef.current) {
      pulseAnimationRef.current.stop();
      pulseAnimationRef.current = null;
    }
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
    Animated.timing(glowAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const stopRecording = async () => {
    if (!socketRef.current || !socketRef.current.connected) {
      setIsTalking(false);
      stopAnimations();
      return;
    }

    try {
      if (!recordingRef.current) {
        console.log('No recording to stop');
        setIsTalking(false);
        stopAnimations();
        socketRef.current.emit('stop-talking');
        return;
      }

      let uri = null;
      try {
        const status = await recordingRef.current.getStatusAsync();
        if (status.isRecording) {
          uri = recordingRef.current.getURI();
          await recordingRef.current.stopAndUnloadAsync();
        } else {
          try {
            uri = recordingRef.current.getURI();
          } catch {
            uri = null;
          }
        }
      } catch (error) {
        console.error('Error stopping recording:', error);
        recordingRef.current = null;
        setIsTalking(false);
        stopAnimations();
        socketRef.current.emit('stop-talking');
        return;
      }

      if (uri) {
        try {
          const fileInfo = await FileSystem.getInfoAsync(uri);
          if (!fileInfo.exists || !fileInfo.size) {
            console.warn('Audio file missing or empty:', uri);
          } else {
            console.log('Audio file size:', fileInfo.size, 'bytes');
            const base64Audio = await FileSystem.readAsStringAsync(uri, {
              encoding: FileSystem.EncodingType.Base64,
            });

            if (base64Audio && base64Audio.length > 0) {
              console.log('Sending audio data, base64 length:', base64Audio.length);
              socketRef.current.emit('audio-data', { audioData: base64Audio });
            } else {
              console.warn('Empty audio data, not sending');
            }
          }
        } catch (readError) {
          console.error('Error reading audio file:', readError);
        }
      } else {
        console.warn('No URI for recorded audio');
      }

      recordingRef.current = null;
      setIsTalking(false);
      socketRef.current.emit('stop-talking');
      stopAnimations();
    } catch (error) {
      console.error('Failed to stop recording:', error);
      setIsTalking(false);
      stopAnimations();
    }
  };

  const playAudioData = async (base64Audio) => {
    if (!base64Audio || base64Audio.length === 0) {
      console.warn('Empty audio data received');
      return;
    }

    let tempFileUri = null;
    try {
      console.log('Starting audio playback, data length:', base64Audio.length);

      if (soundRef.current) {
        try {
          await soundRef.current.unloadAsync();
        } catch (unloadError) {
          console.log('Error unloading previous sound:', unloadError);
        }
        soundRef.current = null;
      }

      const fileName = 'last_audio.m4a'; // reuse same temp file
      tempFileUri = `${FileSystem.cacheDirectory}${fileName}`;
      console.log('Writing audio to:', tempFileUri);

      await FileSystem.writeAsStringAsync(tempFileUri, base64Audio, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const fileInfo = await FileSystem.getInfoAsync(tempFileUri);
      if (!fileInfo.exists || !fileInfo.size) {
        throw new Error('Audio file was not created or empty');
      }

      console.log('Audio file verified, size:', fileInfo.size);

      const { sound } = await Audio.Sound.createAsync(
        { uri: tempFileUri },
        {
          shouldPlay: true,
          volume: 1.0,
          isMuted: false,
        }
      );

      soundRef.current = sound;

      // Ensure playback mode
      if (Platform.OS === 'ios') {
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: true,
            playThroughEarpieceAndroid: false,
            shouldDuckAndroid: true,
            interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_MIX_WITH_OTHERS,
            interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
          });
        } catch (e) {
          console.log('iOS audio mode for playback failed:', e);
        }
      }

      await sound.setVolumeAsync(1.0);
      await sound.setIsMutedAsync(false);

      sound.setOnPlaybackStatusUpdate(async (status) => {
        if (status.error) {
          console.error('Playback error:', status.error);
        }
        if (status.didJustFinish) {
          try {
            await sound.unloadAsync();
          } catch (unloadError) {
            console.log('Error unloading sound:', unloadError);
          }
        }
      });
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  };

  const cleanupAudio = async () => {
    if (recordingRef.current) {
      try {
        const status = await recordingRef.current.getStatusAsync();
        if (status.isRecording || status.canRecord) {
          await recordingRef.current.stopAndUnloadAsync();
        }
      } catch {
        console.log('Recording already cleaned up');
      }
      recordingRef.current = null;
    }

    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
      } catch (error) {
        console.error('Error cleaning up sound:', error);
      }
      soundRef.current = null;
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

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.6],
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
            },
          ]}
        >
          <Animated.View
            style={[
              styles.talkButtonGlow,
              {
                opacity: glowOpacity,
              },
            ]}
          />
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
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  talkButtonGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#00d4ff',
    zIndex: -1,
  },
  talkButton: {
    width: 180,
    height: 180,
    borderRadius: 90,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    zIndex: 1,
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
