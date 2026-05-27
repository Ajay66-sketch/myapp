// mobile/src/hooks/useBackgroundTimer.ts
// Robust React Native background-resilient Pomodoro timer hook.
// Persists active count status on background state and uses system-epoch calibrations on return to recover states.

import { useState, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useBackgroundTimer(initialSeconds: number = 1500, onComplete?: () => void) {
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const [isActive, setIsActive] = useState(false);
  const appState = useRef(AppState.currentState);

  const timeLeftRef = useRef(timeLeft);
  timeLeftRef.current = timeLeft;

  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  useEffect(() => {
    // 1. Recover any active timer saved prior to an unexpected crash
    recoverTimerState();

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  // Timer interval ticks
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(interval!);
            setIsActive(false);
            if (onComplete) onComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (interval) clearInterval(interval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, timeLeft]);

  /**
   * Recovers state dynamically after sudden crashes or OS kills
   */
  const recoverTimerState = async () => {
    try {
      const savedTimeJson = await AsyncStorage.getItem('scholar_timer_saved_time');
      const savedTimestampJson = await AsyncStorage.getItem('scholar_timer_timestamp');
      const savedActive = await AsyncStorage.getItem('scholar_timer_active');

      if (savedTimeJson && savedTimestampJson && savedActive === 'true') {
        const savedTime = parseInt(savedTimeJson, 10);
        const savedTimestamp = parseInt(savedTimestampJson, 10);
        
        const elapsed = Math.round((Date.now() - savedTimestamp) / 1000);
        const remaining = Math.max(0, savedTime - elapsed);

        if (remaining <= 0) {
          setTimeLeft(0);
          setIsActive(false);
          if (onComplete) onComplete();
        } else {
          setTimeLeft(remaining);
          setIsActive(true);
        }
      }
    } catch (err) {
      console.warn('[Timer Recovery] Failed to restore state:', err);
    }
  };

  /**
   * Reconciles epoch drift on AppState transitions
   */
  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
      // 1. App backgrounded: Persist timestamp and remaining duration
      if (isActiveRef.current) {
        try {
          await AsyncStorage.setItem('scholar_timer_saved_time', timeLeftRef.current.toString());
          await AsyncStorage.setItem('scholar_timer_timestamp', Date.now().toString());
          await AsyncStorage.setItem('scholar_timer_active', 'true');
        } catch (err) {
          console.warn('[Timer Background] Failed to persist state:', err);
        }
      }
    } else if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // 2. App returned active: Reconcile time differences
      if (isActiveRef.current) {
        try {
          const savedTimeJson = await AsyncStorage.getItem('scholar_timer_saved_time');
          const savedTimestampJson = await AsyncStorage.getItem('scholar_timer_timestamp');

          if (savedTimeJson && savedTimestampJson) {
            const savedTime = parseInt(savedTimeJson, 10);
            const savedTimestamp = parseInt(savedTimestampJson, 10);

            const elapsed = Math.round((Date.now() - savedTimestamp) / 1000);
            const remaining = Math.max(0, savedTime - elapsed);

            setTimeLeft(remaining);

            if (remaining <= 0) {
              setIsActive(false);
              if (onComplete) onComplete();
            }

            // Cleanup storage
            await AsyncStorage.multiRemove([
              'scholar_timer_saved_time',
              'scholar_timer_timestamp',
              'scholar_timer_active'
            ]);
          }
        } catch (err) {
          console.warn('[Timer Foreground] Failed to reconcile state:', err);
        }
      }
    }

    appState.current = nextAppState;
  };

  const startTimer = () => setIsActive(true);
  const pauseTimer = () => setIsActive(false);
  const resetTimer = (seconds: number = initialSeconds) => {
    setIsActive(false);
    setTimeLeft(seconds);
  };

  return { timeLeft, isActive, startTimer, pauseTimer, resetTimer };
}
