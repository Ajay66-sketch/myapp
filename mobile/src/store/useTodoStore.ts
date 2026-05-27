// mobile/src/store/useTodoStore.ts
// Offline-first Todo and Focus streak state store using Zustand.
// Auto-saves state to local AsyncStorage for persistent offline focus task tracking.

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/api';

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

interface TodoState {
  todos: Todo[];
  currentStreak: number;
  loading: boolean;
  loadState: () => Promise<void>;
  addTodo: (title: string) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  incrementStreak: () => Promise<void>;
}

export const useTodoStore = create<TodoState>((set, get) => ({
  todos: [],
  currentStreak: 0,
  loading: false,

  loadState: async () => {
    set({ loading: true });
    try {
      const savedTodos = await AsyncStorage.getItem('scholar_todos');
      const savedStreak = await AsyncStorage.getItem('scholar_streak');

      set({
        todos: savedTodos ? JSON.parse(savedTodos) : [],
        currentStreak: savedStreak ? parseInt(savedStreak, 10) : 0,
        loading: false
      });

      // Synchronize with remote server in background if online
      const result = await api.request('/users/me');
      if (result.success && result.data?.user) {
        const remoteStreak = result.data.user.streak || 0;
        await AsyncStorage.setItem('scholar_streak', remoteStreak.toString());
        set({ currentStreak: remoteStreak });
      }
    } catch (err) {
      set({ loading: false });
    }
  },

  addTodo: async (title: string) => {
    const newTodo: Todo = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title,
      completed: false
    };

    const updatedTodos = [...get().todos, newTodo];
    set({ todos: updatedTodos });
    await AsyncStorage.setItem('scholar_todos', JSON.stringify(updatedTodos));

    // Async sync with API
    api.request('/todos', 'POST', { title });
  },

  toggleTodo: async (id: string) => {
    const updatedTodos = get().todos.map((todo) =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    );

    set({ todos: updatedTodos });
    await AsyncStorage.setItem('scholar_todos', JSON.stringify(updatedTodos));

    // Async sync with API
    api.request(`/todos/${id}/toggle`, 'PUT');
  },

  incrementStreak: async () => {
    const nextStreak = get().currentStreak + 1;
    set({ currentStreak: nextStreak });
    await AsyncStorage.setItem('scholar_streak', nextStreak.toString());

    // Async sync with API
    api.request('/streaks/increment', 'POST');
  }
}));
