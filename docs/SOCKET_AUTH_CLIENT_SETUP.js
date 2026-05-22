// ──────────────────────────────────────────────────────────────────────────────
// SOCKET.IO JWT AUTHENTICATION - CLIENT SETUP GUIDE
// ──────────────────────────────────────────────────────────────────────────────
//
// This guide explains how to set up Socket.IO client with JWT authentication.
// The server now requires:
// 1. Valid JWT token in socket handshake
// 2. Device fingerprint for device tracking
// 3. Automatic token refresh on expiration
// 4. Reconnection with new token
//
// ──────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SOCKET.IO CONNECTION WITH JWT AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════════

import io from 'socket.io-client';

// Helper: Get access token from storage
function getAccessToken() {
  // Token stored in httpOnly cookie OR localStorage
  // Client-side: usually in cookie that browser automatically sends
  // Alternative: read from localStorage if using token-based storage
  return localStorage.getItem('accessToken') || getCookie('accessToken');
}

// Helper: Generate device fingerprint
// In production, use a library like 'fingerprintjs2' for more robust fingerprinting
function generateDeviceFingerprint() {
  const screenRes = `${window.screen.width}x${window.screen.height}`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const userAgent = navigator.userAgent;
  
  // Create simple fingerprint from device characteristics
  const fingerprint = btoa(`${userAgent}|${screenRes}|${timezone}`);
  
  // Store in session storage so same device maintains same fingerprint
  const stored = sessionStorage.getItem('deviceFingerprint');
  if (stored) return stored;
  
  sessionStorage.setItem('deviceFingerprint', fingerprint);
  return fingerprint;
}

// Initialize Socket.IO connection WITH JWT authentication
const socket = io('http://localhost:5000', {
  // ──── Authentication ────────────────────────────────────────────────────
  auth: {
    token: getAccessToken(),        // JWT access token
    deviceId: generateDeviceFingerprint(),  // Device fingerprint
  },
  
  // ──── Reconnection Strategy ─────────────────────────────────────────────
  // Automatically reconnects with exponential backoff
  reconnection: true,
  reconnectionDelay: 100,          // Start with 100ms delay
  reconnectionDelayMax: 3000,      // Max 3 seconds between attempts
  reconnectionAttempts: 5,         // Try 5 times before giving up
  
  // ──── Transport Protocol ────────────────────────────────────────────────
  transports: ['websocket', 'polling'],  // Try websocket first, fallback to polling
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. HANDLE CONNECTION SUCCESS
// ═══════════════════════════════════════════════════════════════════════════════

socket.on('connect:success', (data) => {
  console.log('✅ Connected to Socket.IO server');
  console.log('Socket ID:', data.socketId);
  console.log('User ID:', data.userId);
  
  // Update UI to show connected status
  updateConnectionStatus('connected');
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. HANDLE AUTHENTICATION ERRORS
// ═══════════════════════════════════════════════════════════════════════════════

socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
  
  // Parse error data if available
  let errorData;
  try {
    errorData = JSON.parse(error.message);
  } catch (e) {
    errorData = { error: 'connection_error', message: error.message };
  }
  
  // Handle different error types
  switch (errorData?.error) {
    case 'auth:no_token':
      console.error('No authentication token. User must log in.');
      redirectToLogin();
      break;
      
    case 'auth:invalid_token':
      console.error('Invalid token. Attempting to refresh...');
      refreshTokenAndReconnect();
      break;
      
    case 'auth:expired':
      console.error('Token expired. Attempting to refresh...');
      refreshTokenAndReconnect();
      break;
      
    case 'auth:device_mismatch':
      console.error('Device fingerprint mismatch. Please log in again.');
      redirectToLogin();
      break;
      
    default:
      console.error('Connection failed:', errorData?.message);
      updateConnectionStatus('error', errorData?.message);
  }
});

socket.on('auth:error', (error) => {
  console.error('🔐 Auth error:', error);
  
  if (error.recoverable) {
    // Token expired or similar - can be fixed by refresh
    refreshTokenAndReconnect();
  } else {
    // Fatal auth error - must log out
    logoutUser();
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. HANDLE TOKEN EXPIRATION
// ═══════════════════════════════════════════════════════════════════════════════

socket.on('auth:expiring', (data) => {
  console.warn(`⏰ Token expiring in ${data.expiresIn} seconds`);
  
  // Proactively refresh token before it expires
  refreshAccessToken().then(() => {
    // Send new token to server
    socket.emit('socket:reauth', {
      token: getAccessToken(),
    }, (response) => {
      if (response?.success) {
        console.log('✅ Token refreshed and socket reauthorized');
      } else {
        console.error('Failed to reauth socket:', response?.error);
        redirectToLogin();
      }
    });
  }).catch(err => {
    console.error('Token refresh failed:', err);
    redirectToLogin();
  });
});

socket.on('auth:expired', () => {
  console.error('❌ Token expired during session');
  
  // Try to refresh token
  refreshAccessToken().then(() => {
    // Reconnect with new token
    socket.disconnect();
    socket.auth.token = getAccessToken();
    socket.connect();
  }).catch(() => {
    // Refresh failed - must log out
    logoutUser();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. TOKEN REFRESH FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

async function refreshAccessToken() {
  try {
    const response = await fetch('/api/v1/auth/refresh-token', {
      method: 'POST',
      credentials: 'include',  // Send cookies
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error('Token refresh failed');
    }
    
    const data = await response.json();
    
    // Update token in storage
    const newToken = data.accessToken;
    if (newToken) {
      localStorage.setItem('accessToken', newToken);
      // Also update socket auth for next reconnection
      socket.auth.token = newToken;
    }
    
    return data;
  } catch (error) {
    console.error('Failed to refresh token:', error);
    throw error;
  }
}

async function refreshTokenAndReconnect() {
  try {
    await refreshAccessToken();
    
    // Disconnect and reconnect with new token
    socket.disconnect();
    socket.auth.token = getAccessToken();
    socket.connect();
  } catch (error) {
    console.error('Reconnection failed:', error);
    redirectToLogin();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. PROTECTED EVENT HANDLERS (EXAMPLE)
// ═══════════════════════════════════════════════════════════════════════════════

// All event handlers are now authenticated
// The server validates JWT before allowing any events

// Join room
socket.emit('room:join', { roomId: 'room-123' }, (response) => {
  if (response?.error) {
    console.error('Failed to join room:', response.error);
  } else {
    console.log('✅ Joined room:', response?.roomId);
  }
});

// Listen for room state
socket.on('room:state', (data) => {
  console.log('Room state:', data);
  updateRoomUI(data);
});

// Send chat message (auto-rate limited by server)
socket.emit('room:chat', { 
  roomId: 'room-123',
  message: 'Hello everyone!' 
}, (response) => {
  if (response?.error) {
    console.error('Chat error:', response.error);
    if (response.error.error === 'auth:rate_limited') {
      alert(`Too many messages. Wait ${response.error.resetIn}ms before trying again.`);
    }
  } else {
    console.log('Message sent');
  }
});

// Start timer
socket.emit('timer:start', {
  roomId: 'room-123',
  duration: 25 * 60  // 25 minutes in seconds
}, (response) => {
  if (response?.error) {
    console.error('Timer error:', response.error);
  }
});

// Listen for timer updates
socket.on('timer:sync', (timer) => {
  console.log('Timer:', timer);
  updateTimerUI(timer);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. DISCONNECT HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

socket.on('disconnect', (reason) => {
  console.log('❌ Disconnected:', reason);
  updateConnectionStatus('disconnected');
  
  // Reasons:
  // - 'io server disconnect' = server disconnected
  // - 'io client disconnect' = client requested disconnect
  // - 'ping timeout' = no response from server
  // - etc.
  
  if (reason === 'io server disconnect') {
    // Server disconnect means auth failed
    // Attempt to refresh token and reconnect
    setTimeout(() => {
      refreshTokenAndReconnect();
    }, 1000);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. RATE LIMITING HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

socket.on('error', (error) => {
  console.error('Socket error:', error);
  
  if (error.error === 'auth:rate_limited') {
    // User exceeded rate limit
    // resetIn = milliseconds until rate limit resets
    console.warn(`Rate limited. Try again in ${error.resetIn}ms`);
    
    // Disable buttons temporarily
    disableSendButton();
    setTimeout(() => enableSendButton(), error.resetIn);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
}

function updateConnectionStatus(status, message = '') {
  const el = document.getElementById('connection-status');
  if (el) {
    el.textContent = status === 'connected' ? '🟢 Connected' : '🔴 Disconnected';
    if (message) console.log(message);
  }
}

function redirectToLogin() {
  window.location.href = '/login';
}

function logoutUser() {
  localStorage.removeItem('accessToken');
  sessionStorage.removeItem('deviceFingerprint');
  redirectToLogin();
}

function updateRoomUI(data) {
  // Update room display with timer and participants
}

function updateTimerUI(timer) {
  // Update timer display
}

function disableSendButton() {
  document.getElementById('send-button')?.setAttribute('disabled', 'disabled');
}

function enableSendButton() {
  document.getElementById('send-button')?.removeAttribute('disabled');
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. REACT COMPONENT EXAMPLE
// ═══════════════════════════════════════════════════════════════════════════════

/*
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

export function StudyRoom() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Create socket with JWT auth
    const newSocket = io('http://localhost:5000', {
      auth: {
        token: localStorage.getItem('accessToken'),
        deviceId: sessionStorage.getItem('deviceFingerprint') || generateDeviceFingerprint(),
      },
    });

    // Connection events
    newSocket.on('connect:success', () => {
      setConnected(true);
      setError(null);
    });

    newSocket.on('connect_error', (err) => {
      setError(err.message);
      if (err.data?.error === 'auth:expired') {
        // Try to refresh and reconnect
        refreshTokenAndReconnect(newSocket);
      }
    });

    newSocket.on('auth:expiring', (data) => {
      // Proactively refresh token
      refreshAccessToken().then(() => {
        newSocket.emit('socket:reauth', { 
          token: localStorage.getItem('accessToken') 
        });
      });
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, []);

  return (
    <div>
      <div className={`status ${connected ? 'connected' : 'disconnected'}`}>
        {connected ? '🟢 Connected' : '🔴 Disconnected'}
        {error && <p className="error">{error}</p>}
      </div>
      {/* Room UI here */}
    </div>
  );
}
*/

// ═══════════════════════════════════════════════════════════════════════════════
// KEY CHANGES FROM OLD IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════════
//
// OLD (Unauthenticated):
// - socket.emit('user:identify', { username })  ❌ Anyone could claim any identity
// - No JWT verification
// - Timer could be manipulated by anyone
//
// NEW (Authenticated):
// - JWT token required in handshake auth
// - socket.onAuth() wraps all events with auth checks
// - Device fingerprint prevents token theft
// - Rate limiting prevents spam
// - Username comes from verified JWT token
// - All events validated by server
//
// ═══════════════════════════════════════════════════════════════════════════════

export { socket, getAccessToken, generateDeviceFingerprint };
