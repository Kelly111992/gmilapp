// Socket.io connection
const socket = io();

// DOM Elements
const authScreen = document.getElementById('authScreen');
const inboxView = document.getElementById('inboxView');
const liveView = document.getElementById('liveView');
const extractedView = document.getElementById('extractedView');
const authBtn = document.getElementById('authBtn');
const refreshBtn = document.getElementById('refreshBtn');
const credentialsWarning = document.getElementById('credentialsWarning');
const authMessage = document.getElementById('authMessage');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const emailAddress = document.getElementById('emailAddress');
const emailsContainer = document.getElementById('emailsContainer');
const liveFeed = document.getElementById('liveFeed');
const extractedLog = document.getElementById('extractedLog');
const unreadBadge = document.getElementById('unreadBadge');
const extractBadge = document.getElementById('extractBadge');
const emailModal = document.getElementById('emailModal');
const modalOverlay = document.getElementById('modalOverlay');
const modalClose = document.getElementById('modalClose');
const toastContainer = document.getElementById('toastContainer');
const newEmailAlert = document.getElementById('newEmailAlert');
const copyJsonBtn = document.getElementById('copyJsonBtn');

// State
let currentView = 'inbox';
let emails = [];
let liveEmails = [];
let extractedData = [];

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const view = item.dataset.view;
        switchView(view);
    });
});

function switchView(view) {
    currentView = view;

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === view);
    });

    inboxView.style.display = view === 'inbox' ? 'block' : 'none';
    liveView.style.display = view === 'live' ? 'block' : 'none';
    extractedView.style.display = view === 'extracted' ? 'block' : 'none';
}

// Modal Tabs
document.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;

        document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(tabName + 'Tab').classList.add('active');
    });
});

// Auth button
authBtn.addEventListener('click', () => {
    // Redirigir directamente a la ruta de login
    window.location.href = '/login';

    authBtn.disabled = true;
    authBtn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0;"></div> Redirigiendo...';
});

// Refresh button
refreshBtn.addEventListener('click', () => {
    socket.emit('refreshEmails');
    refreshBtn.querySelector('svg').style.animation = 'spin 0.5s ease';
    setTimeout(() => {
        refreshBtn.querySelector('svg').style.animation = '';
    }, 500);
});

// Copy JSON button
copyJsonBtn?.addEventListener('click', () => {
    const jsonText = document.getElementById('jsonOutput').textContent;
    navigator.clipboard.writeText(jsonText).then(() => {
        showToast('success', '¡Copiado!', 'JSON copiado al portapapeles');
    });
});

// Modal controls
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', closeModal);

function closeModal() {
    emailModal.classList.remove('active');
}

// Socket Events
socket.on('connect', () => {
    console.log('✅ Conectado al servidor');
});

socket.on('needsCredentials', (data) => {
    credentialsWarning.style.display = 'block';
    authBtn.style.display = 'none';
    authMessage.textContent = data.message;
});

socket.on('needsAuth', (data) => {
    authScreen.style.display = 'flex';
    inboxView.style.display = 'none';
    liveView.style.display = 'none';
    extractedView.style.display = 'none';

    // No abrimos ventana automáticamente para evitar bloqueos del navegador
    // El usuario ya hizo click en el botón que lo redirige a /login
    if (data.authUrl && !authBtn.disabled) {
        showToast('info', 'Autenticación', 'Haz click en el botón para conectar con Google');
    }
});

socket.on('authenticated', (data) => {
    console.log('✅ Autenticado:', data);
    updateStatus(true, data.email);
    showToast('success', '¡Conectado!', 'Tu cuenta de Gmail está conectada');

    authScreen.style.display = 'none';
    inboxView.style.display = 'block';
});

socket.on('monitoringStarted', (data) => {
    updateStatus(true, data.email);
});

socket.on('recentEmails', (data) => {
    emails = data;
    renderEmails();
    updateUnreadCount();
});

socket.on('newEmail', (email) => {
    console.log('🆕 NUEVO CORREO DETECTADO:', email);

    // Show floating alert
    showNewEmailAlert(email);

    // Add to extracted data
    addExtractedData(email);

    // Add to live feed
    liveEmails.unshift(email);
    renderLiveFeed();

    // Add to inbox
    emails.unshift(email);
    renderEmails();
    updateUnreadCount();

    // Show notification toast
    showToast('success', '📧 ¡Nuevo Correo!', `De: ${extractName(email.from)}\n${email.subject}`);

    // Play sound
    playNotificationSound();

    // Log extracted data to console
    console.log('📋 INFORMACIÓN EXTRAÍDA:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ID:', email.id);
    console.log('De:', email.from);
    console.log('Para:', email.to);
    console.log('Asunto:', email.subject);
    console.log('Fecha:', email.date);
    console.log('Etiquetas:', email.labels?.join(', '));
    console.log('Contenido:', email.body?.substring(0, 200) + '...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

socket.on('error', (data) => {
    showToast('error', 'Error', data.message);
    authBtn.disabled = false;
    authBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
    Conectar con Google
  `;
});

// Helper Functions
function updateStatus(isOnline, email = '') {
    const dot = statusIndicator.querySelector('.status-dot');
    dot.classList.toggle('online', isOnline);
    dot.classList.toggle('offline', !isOnline);
    statusText.textContent = isOnline ? 'Conectado' : 'Desconectado';
    emailAddress.textContent = email;
}

function extractName(from) {
    const match = from.match(/^([^<]+)/);
    return match ? match[1].trim() : from;
}

function extractEmail(from) {
    const match = from.match(/<([^>]+)>/);
    return match ? match[1] : from;
}

function getInitials(name) {
    const words = name.split(' ');
    if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;

    if (diff < 3600000) {
        const mins = Math.floor(diff / 60000);
        return `hace ${mins} min`;
    }

    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `hace ${hours}h`;
    }

    if (diff < 604800000) {
        const days = Math.floor(diff / 86400000);
        return `hace ${days}d`;
    }

    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

function renderEmails() {
    if (emails.length === 0) {
        emailsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>No hay correos</h3>
        <p>Tu bandeja de entrada está vacía</p>
      </div>
    `;
        return;
    }

    emailsContainer.innerHTML = emails.map(email => `
    <div class="email-card ${email.labels?.includes('UNREAD') ? 'unread' : ''}" 
         onclick="showEmailDetail('${email.id}')">
      <div class="email-avatar">${getInitials(extractName(email.from))}</div>
      <div class="email-content">
        <div class="email-header">
          <span class="email-from">${extractName(email.from)}</span>
          <span class="email-date">${formatDate(email.date)}</span>
        </div>
        <div class="email-subject">${email.subject || '(Sin asunto)'}</div>
        <div class="email-snippet">${email.snippet || ''}</div>
        <div class="email-labels">
          ${(email.labels || []).filter(l => ['UNREAD', 'IMPORTANT', 'STARRED'].includes(l))
            .map(l => `<span class="label ${l}">${l}</span>`).join('')}
        </div>
      </div>
    </div>
  `).join('');
}

function renderLiveFeed() {
    if (liveEmails.length === 0) {
        liveFeed.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👀</div>
        <h3>Esperando correos nuevos...</h3>
        <p>Cuando llegue un correo nuevo, aparecerá aquí con su información extraída</p>
        <div class="waiting-animation">
          <div class="dot"></div>
          <div class="dot"></div>
          <div class="dot"></div>
        </div>
      </div>
    `;
        return;
    }

    liveFeed.innerHTML = liveEmails.map((email, index) => `
    <div class="email-card new-email-card" 
         style="animation-delay: ${index * 0.1}s"
         onclick="showEmailDetail('${email.id}')">
      <div class="email-avatar">${getInitials(extractName(email.from))}</div>
      <div class="email-content">
        <div class="email-header">
          <span class="email-from">${extractName(email.from)}</span>
          <span class="email-date">${formatDate(email.date)}</span>
        </div>
        <div class="email-subject">${email.subject || '(Sin asunto)'}</div>
        <div class="email-snippet">${email.snippet || ''}</div>
        <div class="email-labels">
          <span class="label NEW">🆕 NUEVO</span>
          ${(email.labels || []).filter(l => ['IMPORTANT', 'STARRED'].includes(l))
            .map(l => `<span class="label ${l}">${l}</span>`).join('')}
        </div>
      </div>
    </div>
  `).join('');
}

function addExtractedData(email) {
    const extractedItem = {
        timestamp: new Date().toISOString(),
        data: {
            id: email.id,
            from: email.from,
            to: email.to,
            subject: email.subject,
            date: email.date,
            labels: email.labels,
            snippet: email.snippet,
            body: email.body
        }
    };

    extractedData.unshift(extractedItem);
    renderExtractedLog();
    updateExtractBadge();
}

function renderExtractedLog() {
    if (extractedData.length === 0) {
        extractedLog.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <h3>Sin datos aún</h3>
        <p>Cuando llegue un correo nuevo, la información extraída aparecerá aquí en formato JSON</p>
      </div>
    `;
        return;
    }

    extractedLog.innerHTML = extractedData.map((item, index) => `
    <div class="extracted-data-card">
      <div class="card-header">
        <h4>📧 Correo #${extractedData.length - index}</h4>
        <time>${new Date(item.timestamp).toLocaleString('es-MX')}</time>
      </div>
      <pre>${JSON.stringify(item.data, null, 2)}</pre>
    </div>
  `).join('');
}

function updateUnreadCount() {
    const unread = emails.filter(e => e.labels?.includes('UNREAD')).length;
    unreadBadge.textContent = unread;
    unreadBadge.style.display = unread > 0 ? 'inline' : 'none';
}

function updateExtractBadge() {
    extractBadge.textContent = extractedData.length;
    extractBadge.style.display = extractedData.length > 0 ? 'inline' : 'none';
}

function showNewEmailAlert(email) {
    const alertDetails = document.getElementById('alertDetails');
    alertDetails.textContent = `De: ${extractName(email.from)} - ${email.subject || '(Sin asunto)'}`;

    newEmailAlert.classList.add('show');

    setTimeout(() => {
        newEmailAlert.classList.remove('show');
    }, 5000);
}

window.showEmailDetail = function (emailId) {
    const email = [...emails, ...liveEmails].find(e => e.id === emailId);
    if (!email) return;

    // Preview Tab
    document.getElementById('modalSubject').textContent = email.subject || '(Sin asunto)';
    document.getElementById('modalFrom').textContent = `De: ${email.from}`;
    document.getElementById('modalDate').textContent = new Date(email.date).toLocaleString('es-MX');
    document.getElementById('modalBody').textContent = email.body || email.snippet || '';

    const labelsContainer = document.getElementById('modalLabels');
    labelsContainer.innerHTML = (email.labels || [])
        .map(l => `<span class="label ${l}">${l}</span>`)
        .join('');

    // Extracted Data Tab
    document.getElementById('dataId').textContent = email.id;
    document.getElementById('dataFrom').textContent = email.from;
    document.getElementById('dataTo').textContent = email.to || '-';
    document.getElementById('dataSubject').textContent = email.subject || '(Sin asunto)';
    document.getElementById('dataDate').textContent = email.date;
    document.getElementById('dataLabels').textContent = (email.labels || []).join(', ') || '-';
    document.getElementById('dataBody').textContent = email.body || email.snippet || '-';

    // JSON output
    const jsonData = {
        id: email.id,
        from: email.from,
        to: email.to,
        subject: email.subject,
        date: email.date,
        labels: email.labels,
        snippet: email.snippet,
        body: email.body
    };
    document.getElementById('jsonOutput').textContent = JSON.stringify(jsonData, null, 2);

    // Reset to first tab
    document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('.modal-tab[data-tab="preview"]').classList.add('active');
    document.getElementById('previewTab').classList.add('active');

    emailModal.classList.add('active');
};

function showToast(type, title, message) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️'
    };

    toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <div class="toast-content">
      <h4>${title}</h4>
      <p>${message}</p>
    </div>
  `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

function playNotificationSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.1;

        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.15);
    } catch (e) {
        console.log('No se pudo reproducir el sonido');
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
    }
    if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        socket.emit('refreshEmails');
    }
});

console.log('📧 Gmail Monitor App v2.0 - Extracción de datos activada');
console.log('💡 Los correos nuevos se mostrarán en la consola con formato estructurado');
