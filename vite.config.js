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
                const { youtubeId, activeBeatmap, originalBeatmap, calibration } = JSON.parse(body);
                const songId = youtubeId || 'calibrated_song';

                const saveToBoth = (fileName, fileData) => {
                  // 1. Write back to WSL Native Environment
                  const wslPath = path.join(__dirname, 'public', 'songs', fileName);
                  fs.writeFileSync(wslPath, JSON.stringify(fileData, null, 2), 'utf8');
                  console.log(`[Developer API] Successfully saved to WSL: ${wslPath}`);

                  // 2. Dual-Write back to Windows Mount Environment (if available)
                  const winPath = `/mnt/c/Users/judit/Documents/dev/armada-movement/public/songs/${fileName}`;
                  if (fs.existsSync('/mnt/c/Users/judit/Documents/dev/armada-movement')) {
                    fs.writeFileSync(winPath, JSON.stringify(fileData, null, 2), 'utf8');
                    console.log(`[Developer API] Dual-wrote to Windows: ${winPath}`);
                  }
                };

                // File 1: Original baseline machine analysis (Write ONCE, never overwrite)
                const origFileName = `${songId}_original.json`;
                const wslOrigCheck = path.join(__dirname, 'public', 'songs', origFileName);
                if (!fs.existsSync(wslOrigCheck)) {
                  saveToBoth(origFileName, originalBeatmap);
                  console.log(`[Developer API] Wrote baseline machine analysis backup: ${origFileName}`);
                } else {
                  console.log(`[Developer API] Baseline backup already exists, skipping write: ${origFileName}`);
                }

                // File 2: Calibration ground-truth tap log
                const calFileName = `${songId}_calibration.json`;
                saveToBoth(calFileName, calibration);

                // File 3: Active normalized beatmap
                const activeFileName = `${songId}.json`;
                saveToBoth(activeFileName, activeBeatmap);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                  success: true, 
                  message: `Successfully saved active, baseline, and calibration files for ${songId}` 
                }));
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
