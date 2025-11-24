import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        host: '0.0.0.0',
        port: 5173,
        // Allow any host to connect (fixes "Network unavailable" on some setups)
        allowedHosts: true
    }
});
