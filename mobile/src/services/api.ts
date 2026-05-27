// mobile/src/services/api.ts
// Mobile-first offline-first fetch API client for Scholar
// Handles automatic bearer authorization, local caches, and queued request syncs.

import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'http://localhost:5000/api/v1';

export interface PendingRequest {
  id: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  timestamp: number;
}

class ApiClient {
  private token: string | null = null;

  async setToken(token: string) {
    this.token = token;
    await AsyncStorage.setItem('scholar_auth_token', token);
  }

  async loadToken() {
    this.token = await AsyncStorage.getItem('scholar_auth_token');
  }

  /**
   * Safe fetch with offline queue and memory cache support
   */
  async request(url: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', body?: any) {
    await this.loadToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(`${BASE_URL}${url}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.status === 401) {
        // Handle session expiration
        await AsyncStorage.removeItem('scholar_auth_token');
        this.token = null;
      }

      const json = await response.json();

      // If GET, cache the results locally for offline reading
      if (method === 'GET' && response.ok) {
        await AsyncStorage.setItem(`cache:${url}`, JSON.stringify(json));
      }

      return { success: response.ok, status: response.status, data: json };
    } catch (error) {
      console.warn(`[API Client] Network failure calling ${url}. Operating offline...`);

      // 1. Check if we have cached results for GET requests
      if (method === 'GET') {
        const cached = await AsyncStorage.getItem(`cache:${url}`);
        if (cached) {
          return { success: true, status: 200, data: JSON.parse(cached), fromCache: true };
        }
      }

      // 2. Queue mutations (POST/PUT/DELETE) for automatic replay on reconnection
      if (method !== 'GET') {
        await this.queueOfflineRequest(url, method, body);
      }

      return { success: false, status: 0, error: 'OFFLINE_MODE', message: 'Offline. Request queued for sync.' };
    }
  }

  /**
   * Queue mutation requests inside AsyncStorage
   */
  private async queueOfflineRequest(url: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', body: any) {
    const queueJson = await AsyncStorage.getItem('scholar_offline_queue');
    const queue: PendingRequest[] = queueJson ? JSON.parse(queueJson) : [];
    
    queue.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      url,
      method,
      body,
      timestamp: Date.now()
    });

    await AsyncStorage.setItem('scholar_offline_queue', JSON.stringify(queue));
    console.log(`📡 [Offline Queue] Enqueued mutation task for ${url}`);
  }

  /**
   * Sync and replay all queued offline mutations to backend
   */
  async syncOfflineQueue() {
    const queueJson = await AsyncStorage.getItem('scholar_offline_queue');
    if (!queueJson) return;

    const queue: PendingRequest[] = JSON.parse(queueJson);
    if (queue.length === 0) return;

    console.log(`🔄 [Offline Queue] Found ${queue.length} pending mutations. Commencing synchronization...`);
    const remaining: PendingRequest[] = [];

    for (const req of queue) {
      const result = await this.request(req.url, req.method, req.body);
      if (!result.success && result.error === 'OFFLINE_MODE') {
        remaining.push(req); // Re-queue if still offline
      }
    }

    await AsyncStorage.setItem('scholar_offline_queue', JSON.stringify(remaining));
    console.log(`✅ [Offline Queue] Synced mutations complete. Remaining in queue: ${remaining.length}`);
  }
}

export const api = new ApiClient();
