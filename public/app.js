const socket = io();

// ─── DOM ELEMENTS ──────────────────────────────────────────────────────────
// Onboarding
const obOverlay = document.getElementById('onboarding-overlay');
const obStep1 = document.getElementById('onboarding-step-1');
const obStep2 = document.getElementById('onboarding-step-2');
const obNext1 = document.getElementById('ob-next-1');
const obJoin = document.getElementById('ob-join');
const obName = document.getElementById('ob-name');
const obGoal = document.getElementById('ob-goal');
const obRoom = document.getElementById('ob-room');

// Dashboard
const dashboard = document.getElementById('app');
const globalOnlineCount = document.getElementById('global-online-count');
const roomTitle = document.getElementById('room-title');
const userGoal = document.getElementById('user-goal');
const leaveBtn = document.getElementById('leave-btn');

// Notification Center
const notifBtn = document.getElementById('notif-btn');
const notifBadge = document.getElementById('notif-badge');
const notifFlyout = document.getElementById('notif-flyout');
const notifList = document.getElementById('notif-list');
const notifReadAll = document.getElementById('notif-read-all');

// Timer (SVG & Text)
const timerDisplay = document.getElementById('timer-display');
const timerStatus = document.getElementById('timer-status');
const circle = document.querySelector('.progress-ring__circle');
const radius = circle.r.baseVal.value;
const circumference = radius * 2 * Math.PI;
circle.style.strokeDasharray = `${circumference} ${circumference}`;
circle.style.strokeDashoffset = 0;

const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');

// Social & Chat
const participantsList = document.getElementById('participants-list');
const participantsEmpty = document.getElementById('participants-empty');
const roomCount = document.getElementById('room-count');
const feedContainer = document.getElementById('feed-container');
const feedEmpty = document.getElementById('feed-empty');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const typingIndicator = document.getElementById('typing-indicator');

// AI Toast
const aiToastContainer = document.getElementById('ai-toast-container');

// State
let currentRoom = null;
let myId = null;
let typingTimeout = null;

// ─── UTILS ───────────────────────────────────────────────────────────────
const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const setProgress = (remaining, total) => {
  const percent = remaining / total;
  const offset = percent * circumference; // Inverted so it empties out
  circle.style.strokeDashoffset = offset;
};

// Dopamine hit confetti
const shootConfetti = () => {
  if (typeof confetti !== 'undefined') {
    const duration = 2000;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#5e6ad2', '#845EC2', '#FF6B6B']
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#5e6ad2', '#845EC2', '#FF6B6B']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  }
};

// AI Toast UI
const showAIToast = (insight) => {
  window.FocusTracker.track('ai_insight_viewed', { type: insight.type });
  const toast = document.createElement('div');
  toast.className = 'ai-toast';
  
  const titles = {
    'summary': 'Session Insight',
    'nudge': 'Coach Nudge',
    'burnout_warning': 'Vitality Alert',
    'recommendation': 'Recommendation'
  };

  const icons = {
    'summary': '<i class="ph ph-sparkle"></i>',
    'nudge': '<i class="ph ph-magic-wand"></i>',
    'burnout_warning': '<i class="ph ph-warning"></i>',
    'recommendation': '<i class="ph ph-lightbulb"></i>'
  };

  toast.innerHTML = `
    <div class="icon gradient-text">${icons[insight.type] || '<i class="ph ph-robot"></i>'}</div>
    <div class="content">
      <h4>${titles[insight.type] || 'AI Coach'}</h4>
      <p>${insight.content}</p>
    </div>
  `;
  aiToastContainer.appendChild(toast);

  // Remove gracefully
  setTimeout(() => {
    toast.style.animation = 'toastSlideOut 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    setTimeout(() => toast.remove(), 400);
  }, 6000);
};

// Toggle Empty States
const updateEmptyStates = () => {
  if (participantsList.children.length === 0) {
    participantsEmpty.classList.remove('hidden');
  } else {
    participantsEmpty.classList.add('hidden');
  }

  if (feedContainer.children.length === 0) {
    feedEmpty.classList.remove('hidden');
  } else {
    feedEmpty.classList.add('hidden');
  }
};

// ─── NOTIFICATION CENTER LOGIC ─────────────────────────────────────────────
const fetchNotifications = async () => {
  const userId = window.FocusTracker ? window.FocusTracker.userId : localStorage.getItem('focus_user_id');
  if (!userId) return;

  try {
    const res = await fetch('/api/v1/notifications', { headers: { 'x-user-id': userId } });
    const { data } = await res.json();
    renderNotifications(data);
  } catch (err) {
    console.error('Failed to fetch notifications');
  }
};

const renderNotifications = (notifications) => {
  if (!notifications || notifications.length === 0) {
    notifList.innerHTML = '<li class="empty-notif">No new notifications</li>';
    notifBadge.classList.add('hidden');
    return;
  }

  notifList.innerHTML = '';
  let unreadCount = 0;

  notifications.forEach(n => {
    if (!n.isRead) unreadCount++;
    const li = document.createElement('li');
    if (!n.isRead) li.classList.add('unread');
    
    // Map icons based on type
    let icon = 'ph-bell';
    if (n.type === 'streak') icon = 'ph-fire';
    else if (n.type === 'comeback') icon = 'ph-hand-waving';
    else if (n.type === 'social') icon = 'ph-users';
    
    li.innerHTML = `
      <div class="notif-item-header">
        <i class="ph ${icon}"></i>
        <h4>${n.title}</h4>
        <span class="notif-item-time">just now</span>
      </div>
      <div class="notif-item-body">${n.message}</div>
    `;
    notifList.appendChild(li);
  });

  if (unreadCount > 0) {
    notifBadge.classList.remove('hidden');
  } else {
    notifBadge.classList.add('hidden');
  }
};

notifBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  notifFlyout.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (!notifFlyout.contains(e.target) && !notifBtn.contains(e.target)) {
    notifFlyout.classList.add('hidden');
  }
});

notifReadAll.addEventListener('click', async () => {
  const userId = window.FocusTracker ? window.FocusTracker.userId : localStorage.getItem('focus_user_id');
  if (!userId) return;
  try {
    await fetch('/api/v1/notifications/read-all', { method: 'PATCH', headers: { 'x-user-id': userId } });
    // Optimistic update
    document.querySelectorAll('#notif-list li.unread').forEach(li => li.classList.remove('unread'));
    notifBadge.classList.add('hidden');
  } catch (err) {
    console.error('Failed to mark read');
  }
});

// ─── ONBOARDING FLOW ─────────────────────────────────────────────────────
const handleStep1Next = () => {
  const name = obName.value.trim() || 'Anonymous';
  socket.emit('user:identify', { username: name });
  window.FocusTracker.identify(name);
  window.FocusTracker.track('onboarding_step_1_completed');
  
  obStep1.classList.add('fade-out');
  setTimeout(() => {
    obStep1.classList.remove('active', 'fade-out');
    obStep2.classList.add('active');
    obGoal.focus();
  }, 300);
};

obNext1.addEventListener('click', handleStep1Next);
obName.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleStep1Next();
});

const handleStep2Join = () => {
  const goal = obGoal.value.trim() || 'Deep Work';
  const roomId = obRoom.value.trim() || 'general';
  
  socket.emit('room:join', { roomId });
  
  currentRoom = roomId;
  userGoal.innerText = `Intention: ${goal}`;
  roomTitle.innerText = `Room: ${roomId}`;
  
  window.FocusTracker.track('onboarding_completed');
  window.FocusTracker.track('room_joined', { roomId, goal });
  
  // Transition UI
  obOverlay.classList.remove('active');
  setTimeout(() => {
    dashboard.classList.add('active');
    fetchNotifications(); // Fetch notifications on entry
  }, 400);
  updateEmptyStates();
};

obJoin.addEventListener('click', handleStep2Join);
[obGoal, obRoom].forEach(el => {
  el.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleStep2Join();
  });
});

// ─── SOCKET LISTENERS ─────────────────────────────────────────────────────
socket.on('connect', () => { myId = socket.id; });

socket.on('global:stats', ({ onlineCount }) => {
  globalOnlineCount.innerText = onlineCount;
});

// Room State
socket.on('room:state', ({ timer, participants }) => {
  updateTimerUI(timer);
  participantsList.innerHTML = '';
  participants.forEach(p => addParticipant(p.socketId, p.username));
  roomCount.innerText = participants.length;
  updateEmptyStates();
});

const updateTimerUI = (timer) => {
  timerDisplay.innerText = formatTime(timer.remainingTime);
  timerStatus.innerText = timer.state === 'running' ? 'In Flow' : timer.state;
  setProgress(timer.remainingTime, timer.duration || 25*60);
  
  if (timer.state === 'running') {
    circle.classList.add('running');
    startBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
  } else {
    circle.classList.remove('running');
    startBtn.classList.remove('hidden');
    pauseBtn.classList.add('hidden');
  }

  // Dopamine release on completion
  if (timer.state === 'completed' && circle.classList.contains('running')) {
    circle.classList.remove('running');
    window.FocusTracker.track('focus_completed', { duration: timer.duration });
    shootConfetti();
  }
};

socket.on('timer:sync', updateTimerUI);

// Participants
socket.on('room:user_joined', ({ socketId, user }) => {
  addParticipant(socketId, user.username);
  roomCount.innerText = parseInt(roomCount.innerText) + 1;
  updateEmptyStates();
});

socket.on('room:user_left', ({ socketId }) => {
  const el = document.getElementById(`user-${socketId}`);
  if (el) el.remove();
  roomCount.innerText = Math.max(0, parseInt(roomCount.innerText) - 1);
  updateEmptyStates();
});

function addParticipant(socketId, username) {
  if (document.getElementById(`user-${socketId}`)) return;
  const li = document.createElement('li');
  li.id = `user-${socketId}`;
  const initial = username.charAt(0).toUpperCase();
  li.innerHTML = `
    <div class="avatar">${initial}</div>
    <span>${username} ${socketId === myId ? '<span class="sub-text">(You)</span>' : ''}</span>
  `;
  participantsList.appendChild(li);
}

// Activity Feed & Chat
socket.on('room:activity', ({ type, username, message }) => {
  const item = document.createElement('div');
  item.className = `feed-item ${type}`;
  if (type === 'chat') {
    item.innerHTML = `<span class="user">${username}</span> ${message}`;
  } else {
    item.innerHTML = `<i class="ph ph-info" style="vertical-align: middle; margin-right: 4px;"></i> ${message}`;
  }
  feedContainer.appendChild(item);
  feedContainer.scrollTop = feedContainer.scrollHeight;
  updateEmptyStates();
});

socket.on('room:typing', ({ username, isTyping }) => {
  if (isTyping) {
    typingIndicator.innerText = `${username} is typing...`;
    typingIndicator.classList.remove('hidden');
  } else {
    typingIndicator.classList.add('hidden');
  }
});

// ─── NOTIFICATIONS & TOASTS ─────────────────────────────────────────────────────
socket.on('ai:nudge', (insight) => {
  showAIToast(insight);
});

// Generic notification toast handler (social, streak, etc)
socket.on('notification:received', (notification) => {
  // Show toast
  const toast = document.createElement('div');
  toast.className = 'ai-toast';
  
  let icon = 'ph-bell';
  if (notification.type === 'streak') icon = 'ph-fire';
  else if (notification.type === 'social') icon = 'ph-users';
  
  toast.innerHTML = `
    <div class="icon gradient-text"><i class="ph ${icon}"></i></div>
    <div class="content">
      <h4>${notification.title}</h4>
      <p>${notification.message}</p>
    </div>
  `;
  aiToastContainer.appendChild(toast);
  
  // Play subtle chime (if configured)
  try {
    const audio = new Audio('https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3?filename=success-1-6297.mp3');
    audio.volume = 0.2;
    audio.play().catch(e => {}); // Ignore autoplay blocks
  } catch (e) {}

  setTimeout(() => {
    toast.style.animation = 'toastSlideOut 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    setTimeout(() => toast.remove(), 400);
  }, 5000);

  // Update notification center badge
  notifBadge.classList.remove('hidden');
  
  // Locally append the notification to the flyout without refetching from DB
  const li = document.createElement('li');
  li.classList.add('unread');
  li.innerHTML = `
    <div class="notif-item-header">
      <i class="ph ${icon}"></i>
      <h4>${notification.title}</h4>
      <span class="notif-item-time">just now</span>
    </div>
    <div class="notif-item-body">${notification.message}</div>
  `;
  const emptyNotif = notifList.querySelector('.empty-notif');
  if (emptyNotif) emptyNotif.remove();
  notifList.prepend(li);
});

// Simulate AI Coach dopamine hit on completion for unauthenticated demo
let sessionCompleteSimulated = false;
socket.on('timer:sync', (timer) => {
  if (timer.state === 'completed' && !sessionCompleteSimulated) {
    sessionCompleteSimulated = true;
    setTimeout(() => {
      showAIToast({
        type: 'nudge',
        content: `✨ Incredible focus! You just crushed your goal: "${obGoal.value.trim() || 'Deep Work'}". Your streak is alive.`
      });
    }, 2500); // Wait for confetti to settle slightly
  }
});

// ─── CONTROLS ─────────────────────────────────────────────────────────────
leaveBtn.addEventListener('click', () => {
  if (currentRoom) {
    window.FocusTracker.track('room_left', { roomId: currentRoom });
    socket.emit('room:leave', { roomId: currentRoom });
    currentRoom = null;
    
    // Reset UI
    dashboard.classList.remove('active');
    setTimeout(() => {
      obStep2.classList.remove('active');
      obStep1.classList.add('active');
      obOverlay.classList.add('active');
      feedContainer.innerHTML = '';
      participantsList.innerHTML = '';
      updateEmptyStates();
    }, 800);
  }
});

startBtn.addEventListener('click', () => {
  if (currentRoom) {
    window.FocusTracker.track('focus_started');
    // 10-second timer for demo
    socket.emit('timer:start', { roomId: currentRoom, duration: 10 }); 
    sessionCompleteSimulated = false;
  }
});

pauseBtn.addEventListener('click', () => {
  if (currentRoom) socket.emit('timer:pause', { roomId: currentRoom });
});

chatInput.addEventListener('input', () => {
  if (!currentRoom) return;
  socket.emit('room:typing', { roomId: currentRoom, isTyping: true });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('room:typing', { roomId: currentRoom, isTyping: false });
  }, 1000);
});

const sendMessage = () => {
  const text = chatInput.value.trim();
  if (text && currentRoom) {
    socket.emit('room:chat', { roomId: currentRoom, message: text });
    chatInput.value = '';
    socket.emit('room:typing', { roomId: currentRoom, isTyping: false });
  }
};

sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});
