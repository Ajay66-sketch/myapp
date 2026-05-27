// mobile/src/screens/FlashcardReviewScreen.tsx
import React, { useState, useRef } from 'react';
import { StyleSheet, Text, View, Dimensions, PanResponder, Animated, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusStore } from '../store/useFocusStore';

const { width, height } = Dimensions.get('window');
const SWIPE_THRESHOLD = width * 0.35;

const MOCK_FLASHCARDS = [
  { id: '1', front: 'What is the characteristic equation for eigenvalues?', back: 'det(A - λI) = 0' },
  { id: '2', front: 'State the second law of thermodynamics.', back: 'The total entropy of an isolated system always increases over time.' },
  { id: '3', front: 'Define active recall conceptually.', back: 'Stimulating memory retrieval during learning for cognitive consolidation.' },
  { id: '4', front: 'What is Euler\'s identity?', back: 'e^(iπ) + 1 = 0' }
];

export default function FlashcardReviewScreen() {
  const [cards, setCards] = useState(MOCK_FLASHCARDS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  
  const { incrementStreak } = useFocusStore();

  const pan = useRef(new Animated.ValueXY()).current;
  const rotate = pan.x.interpolate({
    inputRange: [-width / 2, 0, width / 2],
    outputRange: ['-10deg', '0deg', '10deg'],
    extrapolate: 'clamp'
  });

  const cardOpacity = pan.x.interpolate({
    inputRange: [-width / 2, 0, width / 2],
    outputRange: [0.6, 1, 0.6]
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (e, gestureState) => {
        if (gestureState.dx > SWIPE_THRESHOLD) {
          // Swipe Right => Perfect recall (SM-2 Quality 5)
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Animated.timing(pan, {
            toValue: { x: width + 100, y: gestureState.dy },
            duration: 200,
            useNativeDriver: false
          }).start(() => nextCard(5));
        } else if (gestureState.dx < -SWIPE_THRESHOLD) {
          // Swipe Left => Fail recall (SM-2 Quality 1)
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Animated.timing(pan, {
            toValue: { x: -width - 100, y: gestureState.dy },
            duration: 200,
            useNativeDriver: false
          }).start(() => nextCard(1));
        } else {
          // Reset card back to center
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            friction: 4,
            useNativeDriver: false
          }).start();
        }
      }
    })
  ).current;

  const nextCard = (quality: number) => {
    pan.setValue({ x: 0, y: 0 });
    setIsFlipped(false);
    
    // Cycle cards array index
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // Reached end, loop back
      setCurrentIndex(0);
      incrementStreak();
    }
  };

  const handleFlip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsFlipped(!isFlipped);
  };

  const activeCard = cards[currentIndex];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SPACED REPETITION STUDY</Text>
      <Text style={styles.subtitle}>Swipe Right to Master, Left to Fail</Text>

      {/* Main Draggable Flashcard Workspace */}
      <View style={styles.cardContainer}>
        {currentIndex < cards.length ? (
          <Animated.View
            style={[
              styles.flashcard,
              {
                transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }],
                opacity: cardOpacity
              }
            ]}
            {...panResponder.panHandlers}
          >
            <TouchableOpacity activeOpacity={0.9} style={styles.cardTouch} onPress={handleFlip}>
              <View style={styles.cardHeader}>
                <Text style={styles.badgeText}>
                  {isFlipped ? '💡 EXPLANATION / BACK' : '❓ QUESTION / FRONT'}
                </Text>
                <Text style={styles.cardIndex}>
                  {currentIndex + 1} / {cards.length}
                </Text>
              </View>

              <View style={styles.cardBody}>
                <Text style={styles.cardContentText}>
                  {isFlipped ? activeCard.back : activeCard.front}
                </Text>
              </View>

              <Text style={styles.flipLabel}>Tap to Flip Card</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <View style={styles.completionCard}>
            <Text style={styles.doneIcon}>🏆</Text>
            <Text style={styles.doneTitle}>All Cards Cleared!</Text>
            <Text style={styles.doneSub}>Your spaced repetition memory matrix is perfectly calibrated.</Text>
          </View>
        )}
      </View>

      {/* Custom Control Buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.actionBtn, styles.hardBtn]} 
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Animated.timing(pan, { toValue: { x: -width - 100, y: 0 }, duration: 250, useNativeDriver: false }).start(() => nextCard(1));
          }}
        >
          <Text style={styles.btnText}>🔴 HARD (SM-2 Q1)</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionBtn, styles.easyBtn]} 
          onPress={() => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Animated.timing(pan, { toValue: { x: width + 100, y: 0 }, duration: 250, useNativeDriver: false }).start(() => nextCard(5));
          }}
        >
          <Text style={styles.btnText}>🟢 MASTER (SM-2 Q5)</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    padding: 20,
    paddingTop: 40,
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#8A8A9E',
    textAlign: 'center',
    marginBottom: 20,
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 20,
  },
  flashcard: {
    width: width - 40,
    height: height * 0.46,
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  cardTouch: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeText: {
    color: '#6366F1',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  cardIndex: {
    color: '#8A8A9E',
    fontSize: 12,
    fontWeight: '600',
  },
  cardBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContentText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 32,
  },
  flipLabel: {
    textAlign: 'center',
    color: '#8A8A9E',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  completionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 40,
    alignItems: 'center',
    width: width - 40,
  },
  doneIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  doneTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  doneSub: {
    color: '#8A8A9E',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  hardBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  easyBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
});
