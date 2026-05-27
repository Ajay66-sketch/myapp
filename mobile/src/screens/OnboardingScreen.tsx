// mobile/src/screens/OnboardingScreen.tsx
// High-conversion, premium gesture-optimized mobile onboarding screen.
// Styled in deep glassmorphic dark-mode aesthetics for modern startup look.

import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Dimensions, SafeAreaView } from 'react-native';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    title: 'Cognitive Focus Pacing',
    subtitle: 'Block creative burnout using dynamic Pomodoro intervals tailored to prefrontal cortex activities.',
    icon: '⏱️'
  },
  {
    title: 'AI Academic Companion',
    subtitle: 'Upload textbooks, generate active recall flashcards, and run vector similarity search notes.',
    icon: '🧠'
  },
  {
    title: 'Viral Social Surge',
    subtitle: 'Form focus study groups, maintain daily streaks, and invite peers to unlock dual XP boosters.',
    icon: '⚡'
  }
];

export default function OnboardingScreen({ onFinish }: { onFinish: () => void }) {
  const [activeSlide, setActiveSlide] = useState(0);

  const handleNext = () => {
    if (activeSlide < SLIDES.length - 1) {
      setActiveSlide(activeSlide + 1);
    } else {
      onFinish();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.progressContainer}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressBar,
              { backgroundColor: i <= activeSlide ? '#6366F1' : '#2D2D3A' }
            ]}
          />
        ))}
      </View>

      <View style={styles.content}>
        <Text style={styles.icon}>{SLIDES[activeSlide].icon}</Text>
        <Text style={styles.title}>{SLIDES[activeSlide].title}</Text>
        <Text style={styles.subtitle}>{SLIDES[activeSlide].subtitle}</Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.skipButton} onPress={onFinish}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextText}>
            {activeSlide === SLIDES.length - 1 ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F15',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  icon: {
    fontSize: 80,
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  skipText: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButton: {
    backgroundColor: '#6366F1',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  nextText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
