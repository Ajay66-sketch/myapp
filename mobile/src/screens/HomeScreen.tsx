// mobile/src/screens/HomeScreen.tsx
import React, { useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusStore } from '../store/useFocusStore';
import { useBackgroundTimer } from '../hooks/useBackgroundTimer';

const { width } = Dimensions.get('window');

export default function HomeScreen({ onNavigate }: { onNavigate: (screen: string) => void }) {
  const { currentStreak, incrementStreak, batteryMode, setBatteryMode } = useFocusStore();
  
  // Custom hook usage with complete background persistence
  const { timeLeft, isActive, startTimer, pauseTimer, resetTimer } = useBackgroundTimer(1500, async () => {
    // Complete trigger
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await incrementStreak();
  });

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartStop = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isActive) {
      pauseTimer();
    } else {
      startTimer();
    }
  };

  const handleReset = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetTimer();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Premium Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Hey Alan,</Text>
          <Text style={styles.subtitleText}>Ready to locked-in today?</Text>
        </View>
        
        {/* Streak Component with Animated Pulse */}
        <TouchableOpacity 
          style={styles.streakBadge} 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            incrementStreak();
          }}
        >
          <Text style={styles.flameEmoji}>🔥</Text>
          <Text style={styles.streakText}>{currentStreak} Days</Text>
        </TouchableOpacity>
      </View>

      {/* Glassmorphic Focus Timer Card */}
      <View style={styles.timerCard}>
        <Text style={styles.timerTitle}>POMODORO CYCLE</Text>
        <Text style={styles.timerCountdown}>{formatTime(timeLeft)}</Text>
        <Text style={styles.timerModeText}>Active Focus Session</Text>

        <View style={styles.timerControls}>
          <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
            <Text style={styles.buttonText}>Reset</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.playButton, isActive && styles.pauseActive]} 
            onPress={handleStartStop}
          >
            <Text style={styles.playButtonText}>{isActive ? 'PAUSE' : 'START'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick Action Matrix */}
      <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
      <View style={styles.actionGrid}>
        <TouchableOpacity style={styles.actionCard} onPress={() => onNavigate('studyRoom')}>
          <Text style={styles.actionIcon}>🎧</Text>
          <Text style={styles.actionTitle}>Focus Rooms</Text>
          <Text style={styles.actionSub}>Ambient Beats</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard} onPress={() => onNavigate('aiTutor')}>
          <Text style={styles.actionIcon}>🧠</Text>
          <Text style={styles.actionTitle}>Socratic Coach</Text>
          <Text style={styles.actionSub}>Interactive AI</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard} onPress={() => onNavigate('flashcards')}>
          <Text style={styles.actionIcon}>📇</Text>
          <Text style={styles.actionTitle}>Flashcards</Text>
          <Text style={styles.actionSub}>SM-2 Spaced</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard} onPress={() => onNavigate('analytics')}>
          <Text style={styles.actionIcon}>📈</Text>
          <Text style={styles.actionTitle}>Analytics</Text>
          <Text style={styles.actionSub}>Weakness Logs</Text>
        </TouchableOpacity>
      </View>

      {/* Battery-Saving Mode Toggle Card */}
      <View style={styles.configCard}>
        <Text style={styles.configTitle}>🔋 BATTERY SAVING GATES</Text>
        <View style={styles.toggleRow}>
          {['high-performance', 'battery-saver'].map((mode) => (
            <TouchableOpacity 
              key={mode} 
              style={[styles.toggleBtn, batteryMode === mode && styles.toggleBtnActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setBatteryMode(mode as any);
              }}
            >
              <Text style={[styles.toggleBtnText, batteryMode === mode && styles.toggleBtnTextActive]}>
                {mode === 'high-performance' ? 'Maximum Sync' : 'Battery Saver'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  content: {
    padding: 20,
    paddingTop: 40,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'System',
  },
  subtitleText: {
    fontSize: 14,
    color: '#8A8A9E',
    marginTop: 4,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  flameEmoji: {
    fontSize: 18,
    marginRight: 6,
  },
  streakText: {
    color: '#EF4444',
    fontWeight: 'bold',
    fontSize: 14,
  },
  timerCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 24,
    alignItems: 'center',
    marginBottom: 28,
  },
  timerTitle: {
    color: '#6366F1',
    fontWeight: '800',
    letterSpacing: 2,
    fontSize: 11,
    marginBottom: 8,
  },
  timerCountdown: {
    color: '#FFFFFF',
    fontSize: 64,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  timerModeText: {
    color: '#8A8A9E',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 20,
  },
  timerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  resetButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  playButton: {
    backgroundColor: '#6366F1',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 40,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  pauseActive: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  playButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6366F1',
    letterSpacing: 2,
    marginBottom: 16,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 28,
  },
  actionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    width: (width - 52) / 2,
    padding: 16,
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  actionSub: {
    fontSize: 12,
    color: '#8A8A9E',
    marginTop: 4,
  },
  configCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: 16,
  },
  configTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#8A8A9E',
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: '#6366F1',
  },
  toggleBtnText: {
    color: '#8A8A9E',
    fontWeight: '600',
    fontSize: 13,
  },
  toggleBtnTextActive: {
    color: '#FFFFFF',
  },
});
