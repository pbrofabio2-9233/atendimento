// ==========================================
// CEOCARD - Service Worker (PWA Offline Cache)
// ==========================================

const CACHE_NAME = 'ceocard-v4.1.0';
const ASSETS_TO_CACHE = [
    'ceocard.html',
    'c-style.css',
    'c-script.js?v=4.1.0',
    'manifest.json'
    // Adicione os nomes dos seus ícones aqui quando os tiver:
    // 'icon-192.png',
    // 'icon-512.png'
];

// Instalação do Service Worker e criação do Cache
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Cache aberto com sucesso!');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Intercepta os pedidos para carregar super rápido a partir do cache
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Retorna o que está no cache, senão faz o download pela rede
            return cachedResponse || fetch(event.request);
        })
    );
});

// Limpeza de caches antigos quando houver uma nova versão
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.filter((name) => name !== CACHE_NAME)
                .map((name) => caches.delete(name))
            );
        })
    );
});
