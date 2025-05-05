// Service Worker for background checks
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('message', (event) => {
    if (event.data.type === 'CHECK_URL') {
        checkUrl(event.data.url);
    }
});

async function checkUrl(url) {
    const userAgents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
    ];
    
    const randomAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    try {
        await fetch(url, {
            method: 'GET',
            headers: { 'User-Agent': randomAgent },
            mode: 'no-cors'
        });
    } catch (error) {
        console.log('Background check failed for', url);
    }
}

// Check all URLs every 5 minutes
setInterval(() => {
    clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({ type: 'GET_MONITORS' });
        });
    });
}, 5 * 60 * 1000);
