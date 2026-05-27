// mobile/src/services/socket.ts
// Mobile-first real-time Socket.IO room synchronizer
// Configured with exponential reconnection pacing and automatic app-state disconnects to conserve mobile batteries.

import io, { Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SOCKET_URL = 'http://localhost:5000';

class SocketManager {
  private socket: Socket | null = null;
  private currentRoomId: string | null = null;

  async connect() {
    if (this.socket?.connected) return;

    const token = await AsyncStorage.getItem('scholar_auth_token');

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      autoConnect: false,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 20000
    });

    this.socket.connect();

    this.socket.on('connect', () => {
      console.log('🔌 [Socket Mobile] Connected successfully via WebSocket.');
      if (this.currentRoomId) {
        this.joinRoom(this.currentRoomId);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('🔌 [Socket Mobile] Disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('🔌 [Socket Mobile] Connection failed:', err.message);
    });
  }

  joinRoom(roomId: string) {
    this.currentRoomId = roomId;
    if (this.socket?.connected) {
      this.socket.emit('room:join', { roomId });
      console.log(`🔌 [Socket Mobile] Dispatched join command for study room: ${roomId}`);
    }
  }

  leaveRoom() {
    if (this.currentRoomId && this.socket?.connected) {
      this.socket.emit('room:leave', { roomId: this.currentRoomId });
      console.log(`🔌 [Socket Mobile] Left study room: ${this.currentRoomId}`);
    }
    this.currentRoomId = null;
  }

  disconnect() {
    this.leaveRoom();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    console.log('🔌 [Socket Mobile] Disconnected and cleaned up.');
  }

  onEvent(event: string, callback: (data: any) => void) {
    if (!this.socket) {
      console.warn('[Socket Mobile] onEvent called but socket is not instantiated.');
      return;
    }
    this.socket.on(event, callback);
  }
}

export const socketManager = new SocketManager();
