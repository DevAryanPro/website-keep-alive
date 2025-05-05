// User Agents
const USER_AGENTS = [
    // Human
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15",
    
    // Bots
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    loadMonitors();
    
    // Register Service Worker for background checks
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/workers/background-checker.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.error('Service Worker registration failed:', err));
    }
});

// Add new monitor
document.getElementById('addBtn').addEventListener('click', addNewMonitor);

function addNewMonitor() {
    const urlInput = document.getElementById('urlInput');
    const url = urlInput.value.trim();
    
    if (!url) return;
    if (!url.startsWith('http')) {
        alert('Please enter a valid URL starting with http:// or https://');
        return;
    }

    const monitors = getMonitors();
    if (monitors.some(m => m.url === url)) {
        alert('This URL is already being monitored');
        return;
    }

    const newMonitor = {
        id: Date.now().toString(),
        url,
        active: true,
        stats: { up: 0, down: 0 }
    };

    monitors.push(newMonitor);
    saveMonitors(monitors);
    renderMonitors();
    urlInput.value = '';

    // Start checking immediately
    checkUrl(newMonitor);
}

function renderMonitors() {
    const container = document.getElementById('monitorsList');
    const monitors = getMonitors();
    
    container.innerHTML = monitors.map(monitor => `
        <div class="border rounded-lg p-4 ${monitor.active ? 'border-green-200 bg-green-50' : 'border-gray-200'}">
            <div class="flex justify-between items-center mb-2">
                <h3 class="font-medium">${monitor.url}</h3>
                <div class="flex items-center gap-2">
                    <span class="text-xs px-2 py-1 rounded ${monitor.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                        ${monitor.active ? 'Active' : 'Paused'}
                    </span>
                    <button onclick="toggleMonitor('${monitor.id}')" class="text-gray-500 hover:text-indigo-600">
                        <i data-lucide="${monitor.active ? 'pause' : 'play'}"></i>
                    </button>
                    <button onclick="deleteMonitor('${monitor.id}')" class="text-gray-500 hover:text-red-600">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
            <div class="text-sm text-gray-600">
                <p>Uptime: ${calculateUptime(monitor)}%</p>
                <p>Last checked: <span id="lastChecked-${monitor.id}">-</span></p>
            </div>
        </div>
    `).join('');
    
    lucide.createIcons();
}

function calculateUptime(monitor) {
    const total = monitor.stats.up + monitor.stats.down;
    return total > 0 ? Math.round((monitor.stats.up / total) * 100) : 100;
}

// Storage functions
function getMonitors() {
    return JSON.parse(localStorage.getItem('uptimex-monitors') || '[]');
}

function saveMonitors(monitors) {
    localStorage.setItem('uptimex-monitors', JSON.stringify(monitors));
}

// Monitor actions
function toggleMonitor(id) {
    const monitors = getMonitors();
    const index = monitors.findIndex(m => m.id === id);
    if (index !== -1) {
        monitors[index].active = !monitors[index].active;
        saveMonitors(monitors);
        renderMonitors();
    }
}

function deleteMonitor(id) {
    if (confirm('Are you sure you want to remove this monitor?')) {
        const monitors = getMonitors().filter(m => m.id !== id);
        saveMonitors(monitors);
        renderMonitors();
    }
}

// URL checking function
async function checkUrl(monitor) {
    if (!monitor.active) return;

    try {
        const randomAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
        const startTime = Date.now();
        
        const response = await fetch(monitor.url, {
            method: 'GET',
            headers: { 'User-Agent': randomAgent },
            mode: 'no-cors'
        });

        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        updateMonitorStatus(monitor.id, true, responseTime);
    } catch (error) {
        updateMonitorStatus(monitor.id, false, 0);
    }
}

function updateMonitorStatus(id, isUp, responseTime) {
    const monitors = getMonitors();
    const monitor = monitors.find(m => m.id === id);
    if (!monitor) return;

    if (isUp) {
        monitor.stats.up++;
    } else {
        monitor.stats.down++;
    }

    monitor.lastChecked = new Date().toISOString();
    monitor.lastResponseTime = responseTime;
    
    saveMonitors(monitors);
    renderMonitors();
    
    // Update last checked time
    const lastCheckedEl = document.getElementById(`lastChecked-${id}`);
    if (lastCheckedEl) {
        lastCheckedEl.textContent = new Date().toLocaleString();
    }
}

// Start checking all active monitors every 5 minutes
setInterval(() => {
    getMonitors().filter(m => m.active).forEach(checkUrl);
}, 5 * 60 * 1000);

// Initial check for all active monitors
getMonitors().filter(m => m.active).forEach(checkUrl);
