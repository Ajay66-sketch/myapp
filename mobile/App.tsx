// mobile/App.tsx
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView, StatusBar, Dimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusStore } from './src/store/useFocusStore';

// Screen Imports
import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen from './src/screens/HomeScreen';
import StudyRoomScreen from './src/screens/StudyRoomScreen';
import AiChatScreen from './src/screens/AiChatScreen';
import FlashcardReviewScreen from './src/screens/FlashcardReviewScreen';
import FocusAnalyticsScreen from './src/screens/FocusAnalyticsScreen';

const { width } = Dimensions.get('window');

export default function App() {
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [activeTab, setActiveTab] = useState<'home' | 'studyRoom' | 'aiTutor' | 'flashcards' | 'analytics'>('home');
  
  const { loadState, tickPomodoro, pomodoroSeconds, pomodoroIsActive } = useFocusStore();

  useEffect(() => {
    // 1. Initial State Hydration from local disk
    loadState();

    // 2. Active Pomodoro Ticking Interval
    const interval = setInterval(() => {
      tickPomodoro();
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleTabPress = (tabName: typeof activeTab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tabName);
  };

  const handleFinishOnboarding = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowOnboarding(false);
  };

  // Safe navigation mapping helper
  const renderActiveScreen = () => {
    switch (activeTab) {
      case 'home':
        return <HomeScreen onNavigate={(screen) => setActiveTab(screen as any)} />;
      case 'studyRoom':
        return <StudyRoomScreen />;
      case 'aiTutor':
        return <AiChatScreen />;
      case 'flashcards':
        return <FlashcardReviewScreen />;
      case 'analytics':
        return <FocusAnalyticsScreen />;
      default:
        return <HomeScreen onNavigate={(screen) => setActiveTab(screen as any)} />;
    }
  };

  if (showOnboarding) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <OnboardingScreen onFinish={handleFinishOnboarding} />
      </View>
    );
  }

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Dynamic Island / Live Activity overlay */}
      {pomodoroIsActive && (
        <View style={styles.dynamicIsland}>
          <View style={styles.islandIndicator} />
          <Text style={styles.islandText}>⏱️ Focus Ticking: {formatTimer(pomodoroSeconds)}</Text>
        </View>
      )}

      {/* Main Screen Container */}
      <View style={styles.screenWrapper}>
        {renderActiveScreen()}
      </View>

      {/* Premium Glassmorphic Bottom Tab Bar */}
      <View style={styles.tabBar}>
        {[
          { key: 'home', label: 'Home', icon: '🏠' },
          { key: 'studyRoom', label: 'Rooms', icon: '🎧' },
          { key: 'aiTutor', label: 'Coach', icon: '🧠' },
          { key: 'flashcards', label: 'Cards', icon: '📇' },
          { key: 'analytics', label: 'Metrics', icon: '📈' }
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity 
              key={tab.key} 
              style={styles.tabItem} 
              onPress={() => handleTabPress(tab.key as any)}
            >
              <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>
                {tab.icon}
              </Text>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  screenWrapper: {
    flex: 1,
  },
  dynamicIsland: {
    alignSelf: 'center',
    backgroundColor: '#000000',
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    gap: 8,
  },
  islandIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },
  islandText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(10, 10, 15, 0.85)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 10,
    justifyContent: 'space-around',
    alignItems: 'center',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 76,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: width / 5,
  },
  tabIcon: {
    fontSize: 20,
    opacity: 0.4,
    marginBottom: 4,
  },
  tabIconActive: {
    opacity: 1,
    transform: [{ scale: 1.15 }],
  },
  tabLabel: {
    fontSize: 10,
    color: '#8A8A9E',
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#6366F1',
    fontWeight: '800',
  },
});
