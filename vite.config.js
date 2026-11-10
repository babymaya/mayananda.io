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
                ai: resolve(process.cwd(), 'ai.html'),
                pipeline: resolve(process.cwd(), 'pipeline.html'),
                about: resolve(process.cwd(), 'about.html'),
                laser: resolve(process.cwd(), 'laser.html'),
                shaders: resolve(process.cwd(), 'shaders.html'),
                houdini: resolve(process.cwd(), 'houdini.html'),
                houdiniAi: resolve(process.cwd(), 'houdini-ai.html'),
                houdiniComfyui: resolve(process.cwd(), 'houdini-comfyui.html'),
                houdiniRender: resolve(process.cwd(), 'houdini-render.html'),
                houdiniPrint: resolve(process.cwd(), 'houdini-print.html'),
            },
        },
    },
};
