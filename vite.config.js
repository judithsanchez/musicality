import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'save-beatmap-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/save-beatmap' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                const songId = data.metadata?.youtubeId || 'calibrated_song';
                
                // 1. Write back to WSL Native Environment
                const wslPath = path.join(__dirname, 'public', 'songs', `${songId}_tapped.json`);
                fs.writeFileSync(wslPath, JSON.stringify(data, null, 2), 'utf8');
                console.log(`[Developer API] Successfully saved beatmap to WSL: ${wslPath}`);

                // 2. Dual-Write back to Windows Mount Environment (if available)
                const winPath = `/mnt/c/Users/judit/Documents/dev/armada-movement/public/songs/${songId}_tapped.json`;
                if (fs.existsSync('/mnt/c/Users/judit/Documents/dev/armada-movement')) {
                  fs.writeFileSync(winPath, JSON.stringify(data, null, 2), 'utf8');
                  console.log(`[Developer API] Dual-wrote beatmap to Windows: ${winPath}`);
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: `Successfully saved to public/songs/${songId}_tapped.json` }));
              } catch (err) {
                console.error("[Developer API] Save beatmap failed:", err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
            });
          } else {
            next();
          }
        });
      }
    }
  ],
})
