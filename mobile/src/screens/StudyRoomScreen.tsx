// mobile/src/screens/StudyRoomScreen.tsx
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusStore } from '../store/useFocusStore';
import { socketManager } from '../services/socket';

const FOCUS_ROOMS = [
  { id: 'cyberpunk-library', name: 'Cyberpunk Library', bpm: '60 BPM Lo-Fi', icon: '🌆', listeners: 142 },
  { id: 'deep-space-nebula', name: 'Deep Space Nebula', bpm: '45 BPM Ambient', icon: '🌌', listeners: 89 },
  { id: 'cozy-coffee-house', name: 'Cozy Rain Cafe', bpm: '72 BPM Acoustic', icon: '☕', listeners: 231 },
  { id: 'minecraft-alpha', name: 'Minecraft Alpha Beats', bpm: '55 BPM Synth', icon: '🧱', listeners: 407 }
];

export default function StudyRoomScreen() {
  const { activeRoomId, roomUsersCount, setRoom, socketConnected, setSocketStatus } = useFocusStore();
  const [isPlayingBeat, setIsPlayingBeat] = useState(false);

  useEffect(() => {
    // Connect to Socket server
    socketManager.connect();
    setSocketStatus(true); // Stub socket status to online for mobile experience demo
    
    return () => {
      socketManager.disconnect();
      setSocketStatus(false);
    };
  }, []);

  const handleRoomPress = (roomId: string, name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (activeRoomId === roomId) {
      socketManager.leaveRoom();
      setRoom(null, 0);
      setIsPlayingBeat(false);
    } else {
      socketManager.joinRoom(roomId);
      // Stub simulated dynamic users count
      const randomCount = Math.floor(Math.random() * 50) + 12;
      setRoom(roomId, randomCount);
      setIsPlayingBeat(true);
    }
  };

  const handleToggleBeat = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsPlayingBeat(!isPlayingBeat);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AMBIENT FOCUS ROOMS</Text>
      
      {/* Socket Reconnection Status Banner */}
      <View style={[styles.socketBanner, socketConnected ? styles.socketOnline : styles.socketOffline]}>
        <View style={[styles.statusDot, socketConnected ? styles.dotOnline : styles.dotOffline]} />
        <Text style={styles.socketText}>
          {socketConnected ? 'CONNECTED TO REALTIME HARBOR' : 'OFFLINE MODE (QUEUED INTEGRATION)'}
        </Text>
      </View>

      {/* Main Focus Room Active Card */}
      {activeRoomId ? (
        <View style={styles.activeRoomCard}>
          <Text style={styles.activeRoomBpm}>
            {FOCUS_ROOMS.find(r => r.id === activeRoomId)?.bpm}
          </Text>
          <Text style={styles.activeRoomName}>
            {FOCUS_ROOMS.find(r => r.id === activeRoomId)?.name}
          </Text>
          <Text style={styles.activeRoomStats}>
            ⚡ {roomUsersCount} study buds are in sync with you
          </Text>

          <View style={styles.playerControls}>
            <TouchableOpacity style={styles.playerButton} onPress={handleToggleBeat}>
              <Text style={styles.playerBtnText}>
                {isPlayingBeat ? '⏸ PAUSE LO-FI' : '▶️ RESUME LO-FI'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.playerButton, styles.leaveButton]} 
              onPress={() => handleRoomPress(activeRoomId, '')}
            >
              <Text style={styles.leaveText}>LEAVE</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>🎧</Text>
          <Text style={styles.emptyTitle}>Tune Into Ambient Audio</Text>
          <Text style={styles.emptySub}>Select a focus portal to sync Pomodoro cycles and listen to lo-fi beats with other users globally.</Text>
        </View>
      )}

      {/* Portal List */}
      <Text style={styles.sectionTitle}>SELECT AN ORBITAL</Text>
      <FlatList
        data={FOCUS_ROOMS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isActive = item.id === activeRoomId;
          return (
            <TouchableOpacity 
              style={[styles.roomItem, isActive && styles.roomItemActive]}
              onPress={() => handleRoomPress(item.id, item.name)}
            >
              <Text style={styles.roomIcon}>{item.icon}</Text>
              
              <View style={styles.roomMeta}>
                <Text style={styles.roomName}>{item.name}</Text>
                <Text style={styles.roomBpm}>{item.bpm}</Text>
              </View>

              <View style={styles.roomRight}>
                <Text style={styles.roomListeners}>👥 {item.listeners}</Text>
                {isActive && <View style={styles.pulseActive} />}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    padding: 20,
    paddingTop: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  socketBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 20,
    gap: 8,
  },
  socketOnline: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  socketOffline: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOnline: {
    backgroundColor: '#10B981',
  },
  dotOffline: {
    backgroundColor: '#EF4444',
  },
  socketText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  activeRoomCard: {
    backgroundColor: 'rgba(99, 102, 241, 0.08)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    padding: 24,
    marginBottom: 28,
  },
  activeRoomBpm: {
    color: '#6366F1',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  activeRoomName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 6,
    marginBottom: 6,
  },
  activeRoomStats: {
    color: '#8A8A9E',
    fontSize: 13,
    marginBottom: 20,
  },
  playerControls: {
    flexDirection: 'row',
    gap: 12,
  },
  playerButton: {
    flex: 1,
    backgroundColor: '#6366F1',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  playerBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  leaveButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  leaveText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: 32,
    alignItems: 'center',
    marginBottom: 28,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptySub: {
    color: '#8A8A9E',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6366F1',
    letterSpacing: 2,
    marginBottom: 16,
  },
  roomItem: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  roomItemActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
    borderColor: 'rgba(99, 102, 241, 0.2)',
  },
  roomIcon: {
    fontSize: 28,
    marginRight: 16,
  },
  roomMeta: {
    flex: 1,
  },
  roomName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  roomBpm: {
    color: '#8A8A9E',
    fontSize: 12,
    marginTop: 4,
  },
  roomRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roomListeners: {
    color: '#8A8A9E',
    fontSize: 12,
    fontWeight: '600',
  },
  pulseActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6366F1',
  },
});
