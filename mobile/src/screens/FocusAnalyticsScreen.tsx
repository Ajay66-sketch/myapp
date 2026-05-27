// mobile/src/screens/FocusAnalyticsScreen.tsx
import React from 'react';
import { StyleSheet, Text, View, ScrollView, Dimensions } from 'react-native';
import { useFocusStore } from '../store/useFocusStore';

const { width } = Dimensions.get('window');

export default function FocusAnalyticsScreen() {
  const { weakTopics, overallConfidence } = useFocusStore();

  // Custom mock analytics data representing weekly focus durations
  const WEEKLY_FOCUS_DATA = [
    { day: 'Mon', hours: 2.5 },
    { day: 'Tue', hours: 4.2 },
    { day: 'Wed', hours: 1.8 },
    { day: 'Thu', hours: 5.0 },
    { day: 'Fri', hours: 3.5 },
    { day: 'Sat', hours: 6.2 },
    { day: 'Sun', hours: 2.1 }
  ];

  const maxHours = Math.max(...WEEKLY_FOCUS_DATA.map(d => d.hours));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>FOCUS ANALYTICS</Text>
      <Text style={styles.subtitle}>Insightful Study Metrics</Text>

      {/* Core Highlights Panel */}
      <View style={styles.highlightsPanel}>
        <View style={styles.highlightBlock}>
          <Text style={styles.highlightTitle}>TOTAL FOCUS</Text>
          <Text style={styles.highlightVal}>25.3 Hr</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.highlightBlock}>
          <Text style={styles.highlightTitle}>CONFIDENCE</Text>
          <Text style={styles.highlightVal}>{overallConfidence.toFixed(1)} / 5.0</Text>
        </View>
      </View>

      {/* Customized Weekly Bar Chart using native components for peak performance */}
      <Text style={styles.sectionTitle}>WEEKLY FOCUS TIME</Text>
      <View style={styles.chartCard}>
        <View style={styles.chartYAxis}>
          <Text style={styles.axisLabel}>{maxHours.toFixed(1)}h</Text>
          <Text style={styles.axisLabel}>{(maxHours / 2).toFixed(1)}h</Text>
          <Text style={styles.axisLabel}>0.0h</Text>
        </View>

        <View style={styles.chartBars}>
          {WEEKLY_FOCUS_DATA.map((item, idx) => {
            const barHeight = (item.hours / maxHours) * 120;
            return (
              <View key={idx} style={styles.barWrapper}>
                <View style={[styles.bar, { height: barHeight }]} />
                <Text style={styles.barLabel}>{item.day}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Socratic Academic Weaknesses logs - Notion-style organization */}
      <Text style={styles.sectionTitle}>ACADEMIC WEAKNESS MATRIX</Text>
      <View style={styles.weaknessCard}>
        {weakTopics.length > 0 ? (
          weakTopics.map((item, idx) => (
            <View key={idx} style={styles.weaknessItem}>
              <View style={styles.weaknessHeader}>
                <Text style={styles.weaknessName}>{item.topic}</Text>
                <Text style={styles.weaknessPercent}>Confidence: {item.confidence}/5</Text>
              </View>
              
              {/* Custom styled progress bars */}
              <View style={styles.meterContainer}>
                <View 
                  style={[
                    styles.meterBar, 
                    { 
                      width: `${(item.confidence / 5) * 100}%`,
                      backgroundColor: item.confidence <= 2 ? '#EF4444' : '#EAB308'
                    }
                  ]} 
                />
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyWeakness}>
            <Text style={styles.emptyWeaknessText}>No active learning weaknesses found. Awesome job!</Text>
          </View>
        )}
      </View>

      {/* Gamification Stats Card */}
      <View style={styles.gamificationCard}>
        <Text style={styles.gameTitle}>⚡ XP DUAL-BOOSTERS UNLOCKED</Text>
        <Text style={styles.gameSub}>Your study habits have qualified you for a 1.5x experience multiplier during peak morning focus hours.</Text>
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
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#8A8A9E',
    marginBottom: 24,
  },
  highlightsPanel: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: 20,
    marginBottom: 28,
  },
  highlightBlock: {
    flex: 1,
    alignItems: 'center',
  },
  highlightTitle: {
    color: '#6366F1',
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  highlightVal: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6366F1',
    letterSpacing: 2,
    marginBottom: 16,
  },
  chartCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
    padding: 20,
    flexDirection: 'row',
    marginBottom: 28,
  },
  chartYAxis: {
    justifyContent: 'space-between',
    height: 120,
    marginRight: 16,
    paddingBottom: 20,
  },
  axisLabel: {
    color: '#8A8A9E',
    fontSize: 10,
    fontWeight: '600',
  },
  chartBars: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
    paddingBottom: 20,
  },
  barWrapper: {
    alignItems: 'center',
    width: (width - 120) / 7,
  },
  bar: {
    width: 8,
    backgroundColor: '#6366F1',
    borderRadius: 4,
  },
  barLabel: {
    color: '#8A8A9E',
    fontSize: 10,
    marginTop: 8,
    fontWeight: '600',
  },
  weaknessCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    padding: 20,
    gap: 16,
    marginBottom: 28,
  },
  weaknessItem: {
    gap: 8,
  },
  weaknessHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weaknessName: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  weaknessPercent: {
    color: '#8A8A9E',
    fontSize: 12,
  },
  meterContainer: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  meterBar: {
    height: '100%',
    borderRadius: 3,
  },
  emptyWeakness: {
    padding: 16,
    alignItems: 'center',
  },
  emptyWeaknessText: {
    color: '#8A8A9E',
    fontSize: 13,
  },
  gamificationCard: {
    backgroundColor: 'rgba(99, 102, 241, 0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.15)',
    padding: 20,
  },
  gameTitle: {
    color: '#6366F1',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  gameSub: {
    color: '#8A8A9E',
    fontSize: 13,
    lineHeight: 20,
  },
});
