import { defineConfig, ViteDevServer, Connect } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ServerResponse } from 'http';
import { execSync } from 'child_process';
import { StrictSongMapSchema } from './src/types/schemas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseMultipart(body: Buffer, boundary: string) {
  const boundaryBuffer = Buffer.from('--' + boundary);
  const parts: { headers: Record<string, string>; data: Buffer }[] = [];
  
  let index = body.indexOf(boundaryBuffer);
  while (index !== -1) {
    const nextIndex = body.indexOf(boundaryBuffer, index + boundaryBuffer.length);
    if (nextIndex === -1) break;
    
    const part = body.subarray(index + boundaryBuffer.length, nextIndex);
    const sep = part.indexOf(Buffer.from('\r\n\r\n'));
    if (sep !== -1) {
      const headerStr = part.subarray(0, sep).toString('utf8');
      const data = part.subarray(sep + 4, part.length - 2);
      
      const headers: Record<string, string> = {};
      headerStr.split('\r\n').forEach(line => {
        const colon = line.indexOf(':');
        if (colon !== -1) {
          const key = line.substring(0, colon).trim().toLowerCase();
          const val = line.substring(colon + 1).trim();
          headers[key] = val;
        }
      });
      parts.push({ headers, data });
    }
    index = nextIndex;
  }
  return parts;
}

function songDbPlugin() {
  return {
    name: 'song-db-plugin',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
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
                console.error('Validation failed for /api/songs:', JSON.stringify(result.error.issues, null, 2));
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

              const songsDir = path.resolve(__dirname, './public/songs');
              if (!fs.existsSync(songsDir)) {
                fs.mkdirSync(songsDir, { recursive: true });
              }

              const songFilePath = path.join(songsDir, `${youtubeId}.json`);
              fs.writeFileSync(songFilePath, JSON.stringify(songMap, null, 2), 'utf8');

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

              const metadata: any = {
                id: songMap.id,
                youtubeId: songMap.youtubeId,
                title: songMap.title,
                artist: songMap.artist,
                genre: songMap.genre,
                status: songMap.status,
                baseBpm: songMap.baseBpm,
              };

              if (songMap.genre === 'SALSA') {
                metadata.defaultClave = (songMap as any).defaultClave;
              }

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
        }
        
        else if (req.method === 'POST' && urlPath === '/api/ingest') {
          const contentType = req.headers['content-type'] || '';
          const match = contentType.match(/boundary=(.+)$/);
          if (!match) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Invalid content type, multipart boundary required' }));
            return;
          }
          
          const boundary = match[1];
          const chunks: Buffer[] = [];
          
          req.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });
          
          req.on('end', () => {
            try {
              const bodyBuffer = Buffer.concat(chunks);
              const parts = parseMultipart(bodyBuffer, boundary);
              
              let audioBuffer: Buffer | null = null;
              let audioFilename = '';
              let youtubeId = '';
              let title = '';
              let artist = '';
              let genre = '';
              
              parts.forEach(part => {
                const cd = part.headers['content-disposition'] || '';
                const nameMatch = cd.match(/name="([^"]+)"/);
                if (nameMatch) {
                  const name = nameMatch[1];
                  if (name === 'audio') {
                    audioBuffer = part.data;
                    const fnMatch = cd.match(/filename="([^"]+)"/);
                    audioFilename = fnMatch ? fnMatch[1] : 'audio.mp3';
                  } else if (name === 'youtubeId') {
                    youtubeId = part.data.toString('utf8').trim();
                  } else if (name === 'title') {
                    title = part.data.toString('utf8').trim();
                  } else if (name === 'artist') {
                    artist = part.data.toString('utf8').trim();
                  } else if (name === 'genre') {
                    genre = part.data.toString('utf8').trim().toUpperCase();
                  }
                }
              });
              
              if (!audioBuffer || !youtubeId || !title || !artist || !genre) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing required upload parameters (audio, youtubeId, title, artist, genre)' }));
                return;
              }
              
              const songsDir = path.resolve(__dirname, './public/songs');
              if (!fs.existsSync(songsDir)) {
                fs.mkdirSync(songsDir, { recursive: true });
              }
              
              const ext = path.extname(audioFilename) || '.mp3';
              const audioFilePath = path.join(songsDir, `${youtubeId}${ext}`);
              fs.writeFileSync(audioFilePath, audioBuffer);
              
              const jsonOutputPath = path.join(songsDir, `${youtubeId}.json`);
              console.log(`[Vite Ingest] Executing ingest_track.py for ${youtubeId}`);
              
              execSync(
                `python3 scripts/ingest_track.py --audio "${audioFilePath}" --youtubeId "${youtubeId}" --title "${title}" --artist "${artist}" --genre "${genre}" --output "${jsonOutputPath}"`
              );
              
              if (fs.existsSync(jsonOutputPath)) {
                const songMap = JSON.parse(fs.readFileSync(jsonOutputPath, 'utf8'));
                
                const catalogFilePath = path.join(songsDir, 'catalog.json');
                let catalog: any[] = [];
                if (fs.existsSync(catalogFilePath)) {
                  try {
                    catalog = JSON.parse(fs.readFileSync(catalogFilePath, 'utf8'));
                    if (!Array.isArray(catalog)) catalog = [];
                  } catch (e) {
                    catalog = [];
                  }
                }
                
                const metadata: any = {
                  id: songMap.id,
                  youtubeId: songMap.youtubeId,
                  title: songMap.title,
                  artist: songMap.artist,
                  genre: songMap.genre,
                  status: songMap.status || 'DRAFT_CUTTING',
                  baseBpm: songMap.baseBpm
                };
                if (genre === 'SALSA') {
                  metadata.defaultClave = songMap.defaultClave;
                }
                
                const index = catalog.findIndex(item => item.youtubeId === youtubeId);
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
                  message: 'Track ingested successfully',
                  song: songMap
                }));
              } else {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Ingestion completed but output JSON was not found' }));
              }
              
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Ingestion process failed', message: err.message }));
            }
          });
        }
        
        else if (req.method === 'POST' && urlPath === '/api/songs/infer-clave') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body);
              const { youtubeId, startTimeMs, endTimeMs } = payload;
              
              if (!youtubeId || startTimeMs === undefined || endTimeMs === undefined) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing required parameters (youtubeId, startTimeMs, endTimeMs)' }));
                return;
              }
              
              const songsDir = path.resolve(__dirname, './public/songs');
              const audioFilePathMp3 = path.join(songsDir, `${youtubeId}.mp3`);
              const audioFilePathMp4 = path.join(songsDir, `${youtubeId}.mp4`);
              let audioFilePath = '';
              if (fs.existsSync(audioFilePathMp3)) {
                audioFilePath = audioFilePathMp3;
              } else if (fs.existsSync(audioFilePathMp4)) {
                audioFilePath = audioFilePathMp4;
              }
              
              if (!audioFilePath) {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: `Audio file not found for YouTube ID: ${youtubeId}` }));
                return;
              }
              
              console.log(`[Vite Ingest] Running Clave Inference on phrase for ${youtubeId} between ${startTimeMs}ms and ${endTimeMs}ms`);
              const stdout = execSync(
                `python3 scripts/infer_clave.py --audio "${audioFilePath}" --startTimeMs ${startTimeMs} --endTimeMs ${endTimeMs}`
              );
              
              const inferredClave = stdout.toString().trim();
              
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                claveDirection: inferredClave
              }));
              
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Clave inference failed', message: err.message }));
            }
          });
        }
        
        else {
          next();
        }
      });
    }
  };
}

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/musicality/' : '/',
  plugins: [
    react(),
    songDbPlugin()
  ],
});
