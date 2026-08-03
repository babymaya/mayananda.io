import { resolve } from 'path';

// Multi-page. Every entry listed here becomes its own HTML file in dist/ —
// without this Vite only builds index.html and the other pages 404 after deploy.
export default {
    base: '/',
    build: {
        assetsDir: 'assets',
        rollupOptions: {
            input: {
                main: resolve(process.cwd(), 'index.html'),
                work: resolve(process.cwd(), '3d.html'),
                games: resolve(process.cwd(), 'games.html'),
                pipeline: resolve(process.cwd(), 'pipeline.html'),
                about: resolve(process.cwd(), 'about.html'),
            },
        },
    },
};
