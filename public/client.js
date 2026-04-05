let socket = null, token = null, userId = null, focusInterval = null, focusSeconds = 0, focusActive = false;
let currentStats = { distraction_score: 52, interruptions: 14, screen_time_minutes: 261, focus_sessions_completed: 0 };
let usageChart = null, hourlyChart = null;
let interventionCounter = 3;
let appUsage = { instagram: 168, youtube: 142, tiktok: 155, whatsapp: 70, twitter: 52, gaming: 80 };
let currentPage = 'dashboard';
let historyEvents = []; // store for history page

const loginPage = document.getElementById('loginPage');
const appContainer = document.getElementById('app');
const loginForm = document.getElementById('loginForm');
const pageContainer = document.getElementById('pageContainer');
const greetingSpan = document.getElementById('greetingName');
const sidebarUserName = document.getElementById('sidebarUserName');

async function apiCall(endpoint, method, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`/api${endpoint}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function updateUI() {
  const distractionScoreElem = document.getElementById('distractionScore');
  if (distractionScoreElem) distractionScoreElem.innerText = currentStats.distraction_score;
  const meterFill = document.getElementById('meterFill');
  if (meterFill) meterFill.style.width = `${currentStats.distraction_score}%`;
  const screenTimeElem = document.getElementById('screenTime');
  if (screenTimeElem) {
    let hrs = Math.floor(currentStats.screen_time_minutes / 60), mins = currentStats.screen_time_minutes % 60;
    screenTimeElem.innerText = `${hrs}h ${mins}m`;
  }
  const interruptionsElem = document.getElementById('interruptions');
  if (interruptionsElem) interruptionsElem.innerText = currentStats.interruptions;
  const focusSessionsElem = document.getElementById('focusSessions');
  if (focusSessionsElem) focusSessionsElem.innerText = currentStats.focus_sessions_completed || 0;
  const dopamineStateElem = document.getElementById('dopamineState');
  if (dopamineStateElem) {
    let state = currentStats.distraction_score > 70 ? "Overstimulated 🔥" : (currentStats.distraction_score > 40 ? "Moderate ⚠️" : "Balanced 😌");
    dopamineStateElem.innerText = state;
  }
  const aiTipElem = document.getElementById('aiTip');
  if (aiTipElem) {
    let tip = currentStats.distraction_score > 70 ? "High dopamine load. Start a focus session." : (currentStats.distraction_score > 40 ? "Moderate digital noise. Try quick detox." : "Great balance! Keep mindful habits.");
    aiTipElem.innerHTML = `✨ ${tip}`;
  }
  const instaTime = document.getElementById('instagramTime');
  if (instaTime) instaTime.innerText = `${Math.floor(appUsage.instagram/60)}h ${appUsage.instagram%60}m`;
  const ytTime = document.getElementById('youtubeTime');
  if (ytTime) ytTime.innerText = `${Math.floor(appUsage.youtube/60)}h ${appUsage.youtube%60}m`;
  const ttTime = document.getElementById('tiktokTime');
  if (ttTime) ttTime.innerText = `${Math.floor(appUsage.tiktok/60)}h ${appUsage.tiktok%60}m`;
  const waTime = document.getElementById('whatsappTime');
  if (waTime) waTime.innerText = `${Math.floor(appUsage.whatsapp/60)}h ${appUsage.whatsapp%60}m`;
  const twTime = document.getElementById('twitterTime');
  if (twTime) twTime.innerText = `${Math.floor(appUsage.twitter/60)}h ${appUsage.twitter%60}m`;
  const gameTime = document.getElementById('gamingTime');
  if (gameTime) gameTime.innerText = `${Math.floor(appUsage.gaming/60)}h ${appUsage.gaming%60}m`;

  if (usageChart && currentPage === 'dashboard') {
    usageChart.data.datasets[0].data = [currentStats.distraction_score/20, currentStats.interruptions/5, currentStats.screen_time_minutes/120];
    usageChart.update();
  }
  if (hourlyChart && currentPage === 'insights') {
    hourlyChart.data.datasets[0].data = [35,42,58,64,71,68,55,48];
    hourlyChart.update();
  }
}

function addAlert(msg, type = 'warning') {
  // Add to alert feed
  const alertDiv = document.getElementById('alertList');
  if (alertDiv) {
    const item = document.createElement('div');
    item.className = 'alert-item';
    if (type === 'info') item.classList.add('info');
    item.innerHTML = `<i class="fas fa-bell"></i> ${new Date().toLocaleTimeString()} · ${msg}`;
    alertDiv.prepend(item);
    if (alertDiv.children.length > 10) alertDiv.removeChild(alertDiv.lastChild);
  }
  // Add to history events array
  const fullMsg = `${new Date().toLocaleString()} — ${msg}`;
  historyEvents.unshift(fullMsg);
  if (historyEvents.length > 20) historyEvents.pop();
  // If history page is currently open, refresh it
  if (currentPage === 'history') {
    const historyDiv = document.getElementById('historyLog');
    if (historyDiv) {
      historyDiv.innerHTML = historyEvents.map(ev => `<div class="history-item">${ev}</div>`).join('');
      if (historyEvents.length === 0) historyDiv.innerHTML = '<div class="history-item">No distraction events yet. Simulate one to see logs.</div>';
    }
  }
}

async function quickDetox() {
  const res = await apiCall('/quick-detox', 'POST');
  currentStats.distraction_score = res.newScore;
  currentStats.screen_time_minutes = res.newScreenTime;
  updateUI();
  addAlert("✨ Quick detox applied! -15 distraction points.", 'info');
}

async function startFocus() {
  if (focusActive) return;
  focusActive = true;
  focusSeconds = 600;
  const startBtn = document.getElementById('startFocusBtn');
  if (startBtn) startBtn.disabled = true;
  const focusTimerElem = document.getElementById('focusTimer');
  if (focusTimerElem) focusTimerElem.innerText = '10:00';
  const focusStatusElem = document.getElementById('focusStatus');
  if (focusStatusElem) focusStatusElem.innerText = '🔒 Focus mode active – distractions blocked.';
  addAlert("🧠 Focus session started (10 min).", 'info');
  if (focusInterval) clearInterval(focusInterval);
  focusInterval = setInterval(async () => {
    if (focusSeconds <= 0) {
      clearInterval(focusInterval);
      focusActive = false;
      if (startBtn) startBtn.disabled = false;
      if (focusTimerElem) focusTimerElem.innerText = '00:00';
      if (focusStatusElem) focusStatusElem.innerText = '✅ Session completed! +10 focus points.';
      addAlert("🎯 Focus session completed! Dopamine reset achieved.", 'info');
      const res = await apiCall('/complete-focus', 'POST', { duration_seconds: 600, completed: true });
      currentStats.distraction_score = res.newScore;
      currentStats.focus_sessions_completed = res.newCompleted;
      updateUI();
    } else {
      focusSeconds--;
      let mins = Math.floor(focusSeconds / 60), secs = focusSeconds % 60;
      if (focusTimerElem) focusTimerElem.innerText = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
    }
  }, 1000);
}

async function simulateDistraction() {
  const reasons = ["Manual: Scrolled Instagram", "Manual: Opened TikTok", "Manual: Notification spam"];
  const reason = reasons[Math.floor(Math.random() * reasons.length)];
  const points = Math.floor(Math.random() * 5) + 2;
  const res = await apiCall('/add-distraction', 'POST', { reason, points });
  currentStats.distraction_score = res.newScore;
  currentStats.interruptions = res.newInterruptions;
  currentStats.screen_time_minutes = res.newScreenTime;
  interventionCounter++;
  if (reason.includes('Instagram')) appUsage.instagram += 5;
  if (reason.includes('TikTok')) appUsage.tiktok += 5;
  updateUI();
  addAlert(`⚠️ ${reason} +${points} distraction score`, 'warning');
}

function initSocket() {
  if (socket) socket.disconnect();
  socket = io({ auth: { token } });
  socket.on('stats_update', (data) => {
    if (data.distraction_score !== undefined) currentStats.distraction_score = data.distraction_score;
    if (data.interruptions !== undefined) currentStats.interruptions = data.interruptions;
    if (data.screen_time_minutes !== undefined) currentStats.screen_time_minutes = data.screen_time_minutes;
    if (data.focus_sessions_completed !== undefined) currentStats.focus_sessions_completed = data.focus_sessions_completed;
    updateUI();
  });
  socket.on('distraction_alert', (data) => {
    if (!focusActive) {
      currentStats.distraction_score = data.newScore;
      currentStats.interruptions = data.newInterruptions;
      currentStats.screen_time_minutes = data.newScreenTime;
      interventionCounter++;
      if (data.reason.includes('Instagram')) appUsage.instagram += 3;
      if (data.reason.includes('TikTok')) appUsage.tiktok += 3;
      updateUI();
      addAlert(`⚠️ ${data.reason} +${data.points} (real-time detection)`, 'warning');
    } else {
      addAlert(`🧘 Focus mode blocked: ${data.reason}`, 'info');
    }
  });
}

function renderDashboard() {
  return `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Distraction Index</div>
        <div class="stat-value" id="distractionScore">${currentStats.distraction_score}</div>
        <div class="meter-bar"><div class="meter-fill" id="meterFill" style="width:${currentStats.distraction_score}%"></div></div>
        <div class="stat-row"><span>📱 Screen time today</span><strong id="screenTime">${Math.floor(currentStats.screen_time_minutes/60)}h ${currentStats.screen_time_minutes%60}m</strong></div>
        <div class="stat-row"><span>🔔 Interruptions</span><strong id="interruptions">${currentStats.interruptions}</strong></div>
        <div class="stat-row"><span>🧠 Dopamine state</span><strong id="dopamineState">${currentStats.distraction_score > 70 ? 'Overstimulated 🔥' : (currentStats.distraction_score > 40 ? 'Moderate ⚠️' : 'Balanced 😌')}</strong></div>
        <button id="quickDetoxBtn" class="btn-secondary full-width"><i class="fas fa-leaf"></i> Quick Detox (−15)</button>
      </div>
      <div class="focus-card">
        <div class="card-title">Deep Work Mode</div>
        <div class="focus-timer" id="focusTimer">00:00</div>
        <button id="startFocusBtn" class="btn-primary full-width">Start 10 min Focus</button>
        <div id="focusStatus" class="focus-status"></div>
        <div class="ai-tip" id="aiTip">✨ Start a focus session to block distractions.</div>
      </div>
      <div class="alert-card">
        <div class="card-title">Real‑time Alerts</div>
        <div id="alertList" class="alert-feed"><div class="alert-item info">🟢 System online · AI active</div></div>
        <button id="simulateBtn" class="btn-outline full-width">+ Simulate distraction</button>
      </div>
    </div>
    <div style="margin-top:1.5rem;"><canvas id="usageChart" width="400" height="180"></canvas></div>
  `;
}

function renderTracking() {
  return `
    <div class="page-header"><h2><i class="fas fa-chart-pie"></i> App‑by‑App Distraction Breakdown</h2><p>Realistic simulation of today's usage (AI detection)</p></div>
    <div class="apps-grid">
      <div class="app-card"><i class="fab fa-instagram"></i><div>Instagram</div><div class="app-time" id="instagramTime">${Math.floor(appUsage.instagram/60)}h ${appUsage.instagram%60}m</div><div class="app-impact high">high impact</div></div>
      <div class="app-card"><i class="fab fa-youtube"></i><div>YouTube</div><div class="app-time" id="youtubeTime">${Math.floor(appUsage.youtube/60)}h ${appUsage.youtube%60}m</div><div class="app-impact high">high impact</div></div>
      <div class="app-card"><i class="fab fa-tiktok"></i><div>TikTok</div><div class="app-time" id="tiktokTime">${Math.floor(appUsage.tiktok/60)}h ${appUsage.tiktok%60}m</div><div class="app-impact high">high impact</div></div>
      <div class="app-card"><i class="fab fa-whatsapp"></i><div>WhatsApp</div><div class="app-time" id="whatsappTime">${Math.floor(appUsage.whatsapp/60)}h ${appUsage.whatsapp%60}m</div><div class="app-impact medium">medium</div></div>
      <div class="app-card"><i class="fab fa-twitter"></i><div>X / Twitter</div><div class="app-time" id="twitterTime">${Math.floor(appUsage.twitter/60)}h ${appUsage.twitter%60}m</div><div class="app-impact medium">medium</div></div>
      <div class="app-card"><i class="fas fa-gamepad"></i><div>Gaming</div><div class="app-time" id="gamingTime">${Math.floor(appUsage.gaming/60)}h ${appUsage.gaming%60}m</div><div class="app-impact medium">medium</div></div>
    </div>
    <div class="insight-note">⚠️ Based on your usage pattern, reducing Instagram and TikTok by 30% would lower your distraction index by ~15 points.</div>
  `;
}

function renderInsights() {
  return `
    <div class="page-header"><h2><i class="fas fa-lightbulb"></i> AI‑Driven Behavioural Insights</h2><p>Personalised recommendations</p></div>
    <div class="insights-list">
      <div class="insight-card">🔍 <strong>Peak distraction hours:</strong> 2–4 PM and 9–11 PM.</div>
      <div class="insight-card">📱 <strong>Top offender:</strong> Instagram – 34% of interruptions.</div>
      <div class="insight-card">🧘 <strong>Detox suggestion:</strong> 10 min of deep breathing reduces craving by 40%.</div>
      <div class="insight-card">⏰ <strong>Notification strategy:</strong> Turn off non‑essential alerts between 10 PM and 8 AM.</div>
    </div>
    <div class="chart-container"><canvas id="hourlyChart" width="400" height="200"></canvas></div>
  `;
}

function renderHistory() {
  const historyHtml = historyEvents.length === 0 
    ? '<div class="history-item">No distraction events yet. Simulate one or wait for real‑time alerts.</div>'
    : historyEvents.map(ev => `<div class="history-item">${ev}</div>`).join('');
  return `
    <div class="page-header"><h2><i class="fas fa-history"></i> Distraction Log</h2><p>Last 20 AI‑detected events</p></div>
    <div id="historyLog" class="history-log">${historyHtml}</div>
  `;
}

function renderAbout() {
  return `
    <div class="page-header"><h2><i class="fas fa-info-circle"></i> About Dopamine Detox AI</h2></div>
    <div class="about-card">
      <h3>Project Context</h3>
      <p>With increasing smartphone penetration, attention spans are reducing. Dopamine‑driven platforms like Instagram, YouTube, TikTok are designed to maximise engagement. Uncontrolled usage results in reduced focus, sleep disturbances, productivity loss, and addiction‑like behaviour.</p>
      <h3>Problem Statement</h3>
      <ul>
        <li>Endless scrolling without time awareness</li>
        <li>High screen time during study/work hours</li>
        <li>Sleep disruption due to late‑night usage</li>
        <li>Constant notification interruptions</li>
        <li>Lack of self‑awareness about usage patterns</li>
      </ul>
      <h3>Solution Architecture</h3>
      <p>This AI‑based digital distraction & dopamine management system uses real‑time monitoring, focus mode, and behavioural analytics. Built with Node.js, Express, SQLite, Socket.io, and a modern frontend with separate pages.</p>
      <p><i class="fas fa-check-circle"></i> Systematic Software Project Management practices applied.</p>
    </div>
  `;
}

function loadPage(page) {
  currentPage = page;
  let content = '';
  if (page === 'dashboard') content = renderDashboard();
  else if (page === 'tracking') content = renderTracking();
  else if (page === 'insights') content = renderInsights();
  else if (page === 'history') content = renderHistory();
  else if (page === 'about') content = renderAbout();
  pageContainer.innerHTML = content;
  // Re-attach event listeners
  if (page === 'dashboard') {
    document.getElementById('quickDetoxBtn')?.addEventListener('click', quickDetox);
    document.getElementById('startFocusBtn')?.addEventListener('click', startFocus);
    document.getElementById('simulateBtn')?.addEventListener('click', simulateDistraction);
    const ctx = document.getElementById('usageChart')?.getContext('2d');
    if (ctx) {
      if (usageChart) usageChart.destroy();
      usageChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: ['Distraction', 'Interruptions', 'Screen time'], datasets: [{ label: 'Current load', data: [currentStats.distraction_score/20, currentStats.interruptions/5, currentStats.screen_time_minutes/120], backgroundColor: '#3b82f6' }] }
      });
    }
  }
  if (page === 'insights') {
    const hourlyCtx = document.getElementById('hourlyChart')?.getContext('2d');
    if (hourlyCtx) {
      if (hourlyChart) hourlyChart.destroy();
      hourlyChart = new Chart(hourlyCtx, {
        type: 'line',
        data: { labels: ['8AM','10AM','12PM','2PM','4PM','6PM','8PM','10PM'], datasets: [{ label: 'Dopamine activity', data: [35,42,58,64,71,68,55,48], borderColor: '#f97316', tension:0.3 }] }
      });
    }
  }
  updateUI();
}

function handleRoute() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  const validPages = ['dashboard', 'tracking', 'insights', 'history', 'about'];
  const page = validPages.includes(hash) ? hash : 'dashboard';
  document.querySelectorAll('.menu-item').forEach(link => {
    if (link.getAttribute('data-page') === page) link.classList.add('active');
    else link.classList.remove('active');
  });
  loadPage(page);
}

async function login(email, password) {
  try {
    const res = await apiCall('/login', 'POST', { email, password });
    token = res.token;
    userId = res.user.id;
    const userName = res.user.name || email.split('@')[0];
    greetingSpan.innerText = userName;
    sidebarUserName.innerText = userName;
    const statsRes = await apiCall('/stats', 'GET');
    currentStats = statsRes;
    updateUI();
    initSocket();
    loginPage.style.display = 'none';
    appContainer.style.display = 'block';
    window.location.hash = 'dashboard';
    handleRoute();
    window.addEventListener('hashchange', handleRoute);
  } catch (err) {
    console.error('Login error, trying auto-register:', err);
    try {
      const registerRes = await apiCall('/register', 'POST', { email, password, name: email.split('@')[0] });
      token = registerRes.token;
      userId = registerRes.user.id;
      const userName = registerRes.user.name || email.split('@')[0];
      greetingSpan.innerText = userName;
      sidebarUserName.innerText = userName;
      const statsRes = await apiCall('/stats', 'GET');
      currentStats = statsRes;
      updateUI();
      initSocket();
      loginPage.style.display = 'none';
      appContainer.style.display = 'block';
      window.location.hash = 'dashboard';
      handleRoute();
      window.addEventListener('hashchange', handleRoute);
    } catch (regErr) {
      alert('Login failed: ' + regErr.message);
    }
  }
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  login(email, password);
});

document.getElementById('logoutBtnMain')?.addEventListener('click', () => {
  if (socket) socket.disconnect();
  token = null;
  loginPage.style.display = 'flex';
  appContainer.style.display = 'none';
  if (focusInterval) clearInterval(focusInterval);
  window.location.hash = '';
});

document.getElementById('themeToggleMain')?.addEventListener('click', () => {
  document.body.classList.toggle('dark');
});

loginPage.style.display = 'flex';
appContainer.style.display = 'none';