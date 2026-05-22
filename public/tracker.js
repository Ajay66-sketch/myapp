// public/tracker.js
// Lightweight event-based analytics SDK

class Tracker {
  constructor() {
    this.queue = [];
    this.userId = localStorage.getItem('focus_user_id') || this._generateId();
    localStorage.setItem('focus_user_id', this.userId);
    this.sessionId = this._generateId();
    this.sessionStartTime = Date.now();
    this.batchInterval = 5000; // 5 seconds
    this.apiEndpoint = '/api/v1/analytics/batch';
    this.timer = null;

    this._startBatchTimer();
    this._setupPageUnload();

    // Track app open automatically
    this.track('app_opened', { userAgent: navigator.userAgent });
  }

  _generateId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // Push an event to the local queue
  track(eventName, properties = {}) {
    this.queue.push({
      eventName,
      userId: this.userId,
      sessionId: this.sessionId,
      properties,
      timestamp: new Date().toISOString()
    });
  }

  // Identify user (link anonymous ID to actual username/id)
  identify(newUserId) {
    this.userId = newUserId;
    localStorage.setItem('focus_user_id', this.userId);
    this.track('user_identified', { userId: newUserId });
  }

  // Flush events to backend
  async flush() {
    if (this.queue.length === 0) return;

    const eventsToSend = [...this.queue];
    this.queue = []; // Clear queue optimistic

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: eventsToSend })
      });
      if (!response.ok) throw new Error('Failed to send events');
    } catch (err) {
      console.warn('Analytics tracking failed, requeueing events.');
      // Prepend failed events back
      this.queue = [...eventsToSend, ...this.queue];
    }
  }

  _startBatchTimer() {
    this.timer = setInterval(() => this.flush(), this.batchInterval);
  }

  _setupPageUnload() {
    window.addEventListener('beforeunload', () => {
      // Calculate session duration on exit
      const durationSeconds = Math.round((Date.now() - this.sessionStartTime) / 1000);
      this.track('session_duration', { durationSeconds });

      if (this.queue.length === 0) return;

      // Use sendBeacon for reliable delivery during unload
      const blob = new Blob([JSON.stringify({ events: this.queue })], { type: 'application/json' });
      navigator.sendBeacon(this.apiEndpoint, blob);
    });
  }
}

// Initialize globally
window.FocusTracker = new Tracker();
