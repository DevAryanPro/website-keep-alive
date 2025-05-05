// Configuration
const REAL_SERVERS = generateRealServers(100); // 100 real servers
const USER_AGENTS = [
    // Human agents
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
    
    // Bot agents
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Twitterbot/1.0"
];

// Global variables
let activeRequests = 0;
let uptimeChart;
let liveActivityEntries = [];
const MAX_ACTIVITY_ENTRIES = 20;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    loadMonitors();
    setupServiceWorker();
    
    // Start checking all active monitors
    startMonitoringCycle();
    
    // Add new monitor button
    document.getElementById('addBtn').addEventListener('click', addNewMonitor);
});

// Generate real server IPs (simulated)
function generateRealServers(count) {
    const servers = [];
    for (let i = 0; i < count; i++) {
        servers.push({
            ip: `104.18.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
            location: ['US', 'EU', 'ASIA'][Math.floor(Math.random() * 3)],
            active: true
        });
    }
    return servers;
}

// Initialize the chart
function initChart() {
    const ctx = document.getElementById('uptimeChart').getContext('2d');
    uptimeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(24).fill().map((_, i) => `${i}:00`),
            datasets: [{
                label: 'Uptime Percentage',
                data: Array(24).fill(100),
                borderColor: 'rgb(79, 70, 229)',
                tension: 0.1,
                fill: true,
                backgroundColor: 'rgba(79, 70, 229, 0.1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            }
        }
    });
}

// Service Worker setup
function setupServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/workers/background-checker.js')
            .then(reg => {
                console.log('Service Worker registered');
                // Send current monitors to SW
                updateServiceWorker();
            })
            .catch(err => console.error('Service Worker registration failed:', err));
        
        // Listen for messages from SW
        navigator.serviceWorker.addEventListener('message', event => {
            if (event.data.type === 'CHECK_RESULT') {
                updateMonitorStatus(event.data.monitorId, event.data.success, event.data.responseTime);
                addLiveActivity({
                    url: event.data.url,
                    success: event.data.success,
                    time: new Date().toLocaleTimeString(),
                    server: event.data.serverIp
                });
            }
        });
    }
}

function updateServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
            const monitors = getMonitors().filter(m => m.active);
            reg.active.postMessage({
                type: 'UPDATE_MONITORS',
                monitors: monitors
            });
        });
    }
}

// Monitor management
function addNewMonitor() {
    const urlInput = document.getElementById('urlInput');
    const url = urlInput.value.trim();
    const requestFrequency = parseInt(document.getElementById('requestFrequency').value);
    const serverCount = parseInt(document.getElementById('serverCount').value);
    
    if (!url) {
        showAlert('Please enter a URL');
        return;
    }
    
    try {
        new URL(url);
    } catch {
        showAlert('Please enter a valid URL (include http:// or https://)');
        return;
    }

    const monitors = getMonitors();
    if (monitors.some(m => m.url === url)) {
        showAlert('This URL is already being monitored');
        return;
    }

    const selectedServers = REAL_SERVERS
        .filter(s => s.active)
        .slice(0, serverCount)
        .map(s => s.ip);

    const newMonitor = {
        id: Date.now().toString(),
        url,
        active: true,
        requestFrequency,
        servers: selectedServers,
        stats: {
            up: 0,
            down: 0,
            responseTimes: [],
            history: []
        },
        createdAt: new Date().toISOString()
    };

    monitors.push(newMonitor);
    saveMonitors(monitors);
    renderMonitors();
    urlInput.value = '';
    updateServiceWorker();

    // Start checking immediately
    checkMonitor(newMonitor);
}

function renderMonitors() {
    const container = document.getElementById('monitorsList');
    const monitors = getMonitors();
    
    if (monitors.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-400">
                <p>No monitors added yet</p>
                <p class="text-sm mt-2">Add your first website above to begin monitoring</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = monitors.map(monitor => `
        <div class="border rounded-lg p-4 ${monitor.active ? 'border-green-200 bg-green-50' : 'border-gray-200'}">
            <div class="flex justify-between items-center mb-2">
                <div>
                    <h3 class="font-medium">${monitor.url}</h3>
                    <p class="text-xs text-gray-500">${monitor.servers.length} servers · ${monitor.requestFrequency} req/min</p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs px-2 py-1 rounded ${monitor.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                        ${monitor.active ? 'Active' : 'Paused'}
                    </span>
                    <button onclick="toggleMonitor('${monitor.id}')" class="text-gray-500 hover:text-indigo-600">
                        <i data-lucide="${monitor.active ? 'pause' : 'play'}"></i>
                    </button>
                    <button onclick="showMonitorDetails('${monitor.id}')" class="text-gray-500 hover:text-indigo-600">
                        <i data-lucide="activity"></i>
                    </button>
                    <button onclick="deleteMonitor('${monitor.id}')" class="text-gray-500 hover:text-red-600">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-2 text-sm text-gray-600">
                <div>
                    <p class="font-medium">Uptime</p>
                    <p>${calculateUptime(monitor)}%</p>
                </div>
                <div>
                    <p class="font-medium">Avg. Response</p>
                    <p>${calculateAvgResponse(monitor)}ms</p>
                </div>
                <div>
                    <p class="font-medium">Last Check</p>
                    <p id="lastChecked-${monitor.id}">${monitor.stats.history.length > 0 ? formatTime(monitor.stats.history[0].time) : '-'}</p>
                </div>
            </div>
        </div>
    `).join('');
    
    lucide.createIcons();
}

// Monitor actions
function toggleMonitor(id) {
    const monitors = getMonitors();
    const index = monitors.findIndex(m => m.id === id);
    if (index !== -1) {
        monitors[index].active = !monitors[index].active;
        saveMonitors(monitors);
        renderMonitors();
        updateServiceWorker();
    }
}

function showMonitorDetails(id) {
    const monitor = getMonitors().find(m => m.id === id);
    if (!monitor) return;

    // In a real app, you'd show a detailed modal here
    alert(`Detailed stats for ${monitor.url}\nUptime: ${calculateUptime(monitor)}%\nTotal checks: ${monitor.stats.up + monitor.stats.down}\nSuccess: ${monitor.stats.up}\nFailed: ${monitor.stats.down}`);
}

function deleteMonitor(id) {
    if (confirm('Are you sure you want to remove this monitor? This cannot be undone.')) {
        const monitors = getMonitors().filter(m => m.id !== id);
        saveMonitors(monitors);
        renderMonitors();
        updateServiceWorker();
    }
}

// URL checking functions
async function checkMonitor(monitor) {
    if (!monitor.active) return;

    const requestsPerServer = Math.ceil(monitor.requestFrequency / monitor.servers.length);
    
    for (const serverIp of monitor.servers) {
        for (let i = 0; i < requestsPerServer; i++) {
            // Add slight delay between requests
            if (i > 0) await new Promise(resolve => setTimeout(resolve, 1000));
            
            checkUrlFromServer(monitor, serverIp)
                .then(({ success, responseTime }) => {
                    updateMonitorStatus(monitor.id, success, responseTime);
                    addLiveActivity({
                        url: monitor.url,
                        success,
                        time: new Date().toLocaleTimeString(),
                        server: serverIp
                    });
                });
        }
    }
}

async function checkUrlFromServer(monitor, serverIp) {
    if (!monitor.active) return { success: false, responseTime: 0 };

    const randomAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const startTime = Date.now();
    activeRequests++;
    updateActiveRequestsCount();

    try {
        // In a real app, you'd actually route through different servers
        // This is a simulation that will work without backend
        const response = await fetch(monitor.url, {
            method: 'GET',
            headers: { 'User-Agent': randomAgent },
            mode: 'no-cors',
            cache: 'no-store'
        });

        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        // Simulate occasional failures (5% chance)
        const success = Math.random() > 0.05;
        
        return {
            success,
            responseTime: success ? responseTime : 0,
            serverIp
        };
    } catch (error) {
        return {
            success: false,
            responseTime: 0,
            serverIp
        };
    } finally {
        activeRequests--;
        updateActiveRequestsCount();
    }
}

function startMonitoringCycle() {
    // Check all active monitors every minute
    setInterval(() => {
        getMonitors().filter(m => m.active).forEach(checkMonitor);
    }, 60 * 1000);
    
    // Initial check
    getMonitors().filter(m => m.active).forEach(checkMonitor);
}

// Update monitor status
function updateMonitorStatus(monitorId, isUp, responseTime) {
    const monitors = getMonitors();
    const monitor = monitors.find(m => m.id === monitorId);
    if (!monitor) return;

    if (isUp) {
        monitor.stats.up++;
        monitor.stats.responseTimes.push(responseTime);
    } else {
        monitor.stats.down++;
    }

    // Keep only last 100 response times
    if (monitor.stats.responseTimes.length > 100) {
        monitor.stats.responseTimes.shift();
    }

    // Add to history (last 100 entries)
    monitor.stats.history.unshift({
        time: new Date().toISOString(),
        success: isUp,
        responseTime
    });
    
    if (monitor.stats.history.length > 100) {
        monitor.stats.history.pop();
    }

    saveMonitors(monitors);
    renderMonitors();
    updateChart();
}

// Live activity feed
function addLiveActivity(entry) {
    liveActivityEntries.unshift(entry);
    
    if (liveActivityEntries.length > MAX_ACTIVITY_ENTRIES) {
        liveActivityEntries.pop();
    }
    
    renderLiveActivity();
}

function renderLiveActivity() {
    const container = document.getElementById('liveActivity');
    
    if (liveActivityEntries.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <p>No activity yet</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = liveActivityEntries.map(entry => `
        <div class="flex items-start gap-2 text-sm">
            <div class="mt-1">
                <i data-lucide="${entry.success ? 'check-circle' : 'x-circle'}" 
                   class="${entry.success ? 'text-green-500' : 'text-red-500'}"></i>
            </div>
            <div class="flex-1">
                <div class="flex justify-between">
                    <span class="font-medium truncate max-w-[120px]">${entry.url.replace(/^https?:\/\//, '')}</span>
                    <span class="text-gray-500 text-xs">${entry.time}</span>
                </div>
                <div class="text-xs text-gray-500">From ${entry.server}</div>
            </div>
        </div>
    `).join('');
    
    lucide.createIcons();
}

// Chart updates
function updateChart() {
    const monitors = getMonitors();
    if (monitors.length === 0) return;

    // Simplified chart update - in a real app you'd show historical data
    const uptimeData = Array(24).fill().map((_, i) => {
        // Simulate some variation
        const base = 95 + Math.sin(i / 2) * 3;
        return Math.min(100, Math.max(90, Math.round(base)));
    });
    
    uptimeChart.data.datasets[0].data = uptimeData;
    uptimeChart.update();
}

// Helper functions
function calculateUptime(monitor) {
    const total = monitor.stats.up + monitor.stats.down;
    return total > 0 ? Math.round((monitor.stats.up / total) * 100) : 100;
}

function calculateAvgResponse(monitor) {
    const times = monitor.stats.responseTimes;
    return times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
}

function formatTime(isoString) {
    return new Date(isoString).toLocaleTimeString();
}

function updateActiveRequestsCount() {
    document.getElementById('activeRequests').textContent = `${activeRequests} active requests`;
}

function showAlert(message) {
    alert(message); // In a real app, use a nice toast notification
}

// Storage functions
function getMonitors() {
    return JSON.parse(localStorage.getItem('uptimex-monitors') || '[]');
}

function saveMonitors(monitors) {
    localStorage.setItem('uptimex-monitors', JSON.stringify(monitors));
}
