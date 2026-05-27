// mobile/src/store/useFocusStore.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, PendingRequest } from '../services/api';

interface FocusState {
  todos: { id: string; title: string; completed: boolean }[];
  currentStreak: number;
  activeRoomId: string | null;
  roomUsersCount: number;
  pomodoroSeconds: number;
  pomodoroIsActive: boolean;
  syncQueue: PendingRequest[];
  socketConnected: boolean;
  batteryMode: 'high-performance' | 'battery-saver' | 'sleep';
  weakTopics: { topic: string; confidence: number }[];
  overallConfidence: number;
  
  loadState: () => Promise<void>;
  addTodo: (title: string) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  incrementStreak: () => Promise<void>;
  setRoom: (roomId: string | null, usersCount?: number) => void;
  setSocketStatus: (connected: boolean) => void;
  setBatteryMode: (mode: 'high-performance' | 'battery-saver' | 'sleep') => void;
  tickPomodoro: () => void;
  startPomodoro: () => void;
  pausePomodoro: () => void;
  resetPomodoro: (seconds?: number) => void;
  queueRequest: (url: string, method: PendingRequest['method'], body?: any) => Promise<void>;
  syncPendingQueue: () => Promise<void>;
  syncStudyData: () => Promise<void>;
}

export const useFocusStore = create<FocusState>((set, get) => ({
  todos: [],
  currentStreak: 0,
  activeRoomId: null,
  roomUsersCount: 0,
  pomodoroSeconds: 1500,
  pomodoroIsActive: false,
  syncQueue: [],
  socketConnected: false,
  batteryMode: 'high-performance',
  weakTopics: [],
  overallConfidence: 3.0,

  loadState: async () => {
    try {
      const savedTodos = await AsyncStorage.getItem('scholar_todos');
      const savedStreak = await AsyncStorage.getItem('scholar_streak');
      const savedTimer = await AsyncStorage.getItem('scholar_pomodoro_seconds');
      const savedBattery = await AsyncStorage.getItem('scholar_battery_mode');
      const savedWeakness = await AsyncStorage.getItem('scholar_weaknesses');
      const savedQueue = await AsyncStorage.getItem('scholar_offline_queue');

      set({
        todos: savedTodos ? JSON.parse(savedTodos) : [],
        currentStreak: savedStreak ? parseInt(savedStreak, 10) : 0,
        pomodoroSeconds: savedTimer ? parseInt(savedTimer, 10) : 1500,
        batteryMode: (savedBattery as any) || 'high-performance',
        weakTopics: savedWeakness ? JSON.parse(savedWeakness) : [],
        syncQueue: savedQueue ? JSON.parse(savedQueue) : []
      });

      // Commence background synching
      get().syncStudyData();
      get().syncPendingQueue();
    } catch (err) {
      console.warn('[Focus Store] Failed to load local state:', err);
    }
  },

  addTodo: async (title: string) => {
    const newTodo = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title,
      completed: false
    };
    const updated = [...get().todos, newTodo];
    set({ todos: updated });
    await AsyncStorage.setItem('scholar_todos', JSON.stringify(updated));
    await get().queueRequest('/todos', 'POST', { title });
  },

  toggleTodo: async (id: string) => {
    const updated = get().todos.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    set({ todos: updated });
    await AsyncStorage.setItem('scholar_todos', JSON.stringify(updated));
    await get().queueRequest(`/todos/${id}/toggle`, 'PUT');
  },

  incrementStreak: async () => {
    const next = get().currentStreak + 1;
    set({ currentStreak: next });
    await AsyncStorage.setItem('scholar_streak', next.toString());
    await get().queueRequest('/streaks/increment', 'POST');
  },

  setRoom: (roomId, usersCount = 0) => {
    set({ activeRoomId: roomId, roomUsersCount: usersCount });
  },

  setSocketStatus: (connected) => {
    set({ socketConnected: connected });
  },

  setBatteryMode: async (mode) => {
    set({ batteryMode: mode });
    await AsyncStorage.setItem('scholar_battery_mode', mode);
  },

  tickPomodoro: () => {
    const { pomodoroSeconds, pomodoroIsActive } = get();
    if (pomodoroIsActive && pomodoroSeconds > 0) {
      const nextSeconds = pomodoroSeconds - 1;
      set({ pomodoroSeconds: nextSeconds });
      AsyncStorage.setItem('scholar_pomodoro_seconds', nextSeconds.toString());
    }
  },

  startPomodoro: () => {
    set({ pomodoroIsActive: true });
  },

  pausePomodoro: () => {
    set({ pomodoroIsActive: false });
  },

  resetPomodoro: (seconds = 1500) => {
    set({ pomodoroSeconds: seconds, pomodoroIsActive: false });
    AsyncStorage.setItem('scholar_pomodoro_seconds', seconds.toString());
  },

  queueRequest: async (url, method, body) => {
    const newReq: PendingRequest = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      url,
      method,
      body,
      timestamp: Date.now()
    };
    const updated = [...get().syncQueue, newReq];
    set({ syncQueue: updated });
    await AsyncStorage.setItem('scholar_offline_queue', JSON.stringify(updated));
  },

  syncPendingQueue: async () => {
    const { syncQueue } = get();
    if (syncQueue.length === 0) return;

    const remaining: PendingRequest[] = [];
    for (const req of syncQueue) {
      const result = await api.request(req.url, req.method, req.body);
      if (!result.success && result.error === 'OFFLINE_MODE') {
        remaining.push(req);
      }
    }
    set({ syncQueue: remaining });
    await AsyncStorage.setItem('scholar_offline_queue', JSON.stringify(remaining));
  },

  syncStudyData: async () => {
    // Sync student profile and strengths/weaknesses from backend
    const res = await api.request('/socratic/weakness-summary');
    if (res.success && res.data) {
      // Stub sync weakTopics for preview
      const fallbackWeakness = [
        { topic: 'Eigenvalues & Vectors', confidence: 2 },
        { topic: 'Fluid Heat Transfer', confidence: 3 },
        { topic: 'Maxwell Equations', confidence: 1 }
      ];
      set({ weakTopics: fallbackWeakness, overallConfidence: 3.2 });
      await AsyncStorage.setItem('scholar_weaknesses', JSON.stringify(fallbackWeakness));
    }
  }
}));
