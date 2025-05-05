// Service Worker for background checks
const CACHE_NAME = 'uptimex-monitors-v1';
let activeMonitors = [];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(['/']))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('message', (event) => {
    if (event.data.type === 'UPDATE_MONITORS') {
        activeMonitors = event.data.monitors;
        startBackgroundChecks();
    }
});

function startBackgroundChecks() {
    // Clear any existing intervals
    if (self.checkInterval) {
        clearInterval(self.checkInterval);
    }
    
    // Start new checking interval
    self.checkInterval = setInterval(() => {
        activeMonitors.forEach(monitor => {
            const requestsPerServer = Math.ceil(monitor.requestFrequency / monitor.servers.length);
            
            monitor.servers.forEach(serverIp => {
                for (let i = 0; i < requestsPerServer; i++) {
                    setTimeout(() => {
                        checkUrl(monitor, serverIp);
                    }, i * 1000); // Stagger requests
                }
            });
        });
    }, 60 * 1000); // Every minute
    
    // Immediate first check
    activeMonitors.forEach(monitor => {
        monitor.servers.forEach(serverIp => {
            checkUrl(monitor, serverIp);
        });
    });
}

async function checkUrl(monitor, serverIp) {
    const userAgents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
    ];
    
    const randomAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    try {
        const startTime = Date.now();
        const response = await fetch(monitor.url, {
            method: 'GET',
            headers: { 'User-Agent': randomAgent },
            mode: 'no-cors',
            cache: 'no-store'
        });
        const responseTime = Date.now() - startTime;
        
        // Report back to all clients
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'CHECK_RESULT',
                monitorId: monitor.id,
                success: true,
                responseTime,
                url: monitor.url,
                serverIp
            });
        });
    } catch (error) {
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'CHECK_RESULT',
                monitorId: monitor.id,
                success: false,
                responseTime: 0,
                url: monitor.url,
                serverIp
            });
        });
    }
}
