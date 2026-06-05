import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { StrictSongMapSchema } from './src/types/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function songDbPlugin() {
  return {
    name: 'song-db-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = req.url ? req.url.split('?')[0] : '';
        if (req.method === 'POST' && urlPath === '/api/songs') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body);
              const result = StrictSongMapSchema.safeParse(payload);
              if (!result.success) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  error: 'Validation failed',
                  issues: result.error.issues
                }));
                return;
              }

              const songMap = result.data;
              const youtubeId = songMap.youtubeId;

              // Ensure public/songs directory exists
              const songsDir = path.resolve(__dirname, './public/songs');
              if (!fs.existsSync(songsDir)) {
                fs.mkdirSync(songsDir, { recursive: true });
              }

              // Save the song map json file
              const songFilePath = path.join(songsDir, `${youtubeId}.json`);
              fs.writeFileSync(songFilePath, JSON.stringify(songMap, null, 2), 'utf8');

              // Read and update catalog.json
              const catalogFilePath = path.join(songsDir, 'catalog.json');
              let catalog: any[] = [];
              if (fs.existsSync(catalogFilePath)) {
                try {
                  const content = fs.readFileSync(catalogFilePath, 'utf8');
                  catalog = JSON.parse(content);
                  if (!Array.isArray(catalog)) {
                    catalog = [];
                  }
                } catch (e) {
                  catalog = [];
                }
              }

              // Metadata structure: id, youtubeId, title, artist, genre, baseBpm, defaultClave
              const metadata: any = {
                id: songMap.id,
                youtubeId: songMap.youtubeId,
                title: songMap.title,
                artist: songMap.artist,
                genre: songMap.genre,
                baseBpm: songMap.baseBpm,
              };

              if (songMap.genre === 'SALSA') {
                metadata.defaultClave = (songMap as any).defaultClave;
              }

              // Upsert metadata in catalog
              const index = catalog.findIndex((item) => item.youtubeId === youtubeId);
              if (index >= 0) {
                catalog[index] = metadata;
              } else {
                catalog.push(metadata);
              }

              fs.writeFileSync(catalogFilePath, JSON.stringify(catalog, null, 2), 'utf8');

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                message: 'Song map saved and catalog updated successfully',
                song: songMap
              }));
            } catch (error: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                error: 'Server Error',
                message: error.message
              }));
            }
          });
        } else {
          next();
        }
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/musicality/' : '/',
  server: {
    historyApiFallback: true,
  },
  plugins: [
    react(),
    songDbPlugin()
  ],
});
