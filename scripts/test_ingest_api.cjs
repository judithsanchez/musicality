const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5173;
const INGEST_API_URL = `http://localhost:${PORT}/api/ingest`;
const CLAVE_API_URL = `http://localhost:${PORT}/api/songs/infer-clave`;

async function runIngestTests() {
  console.log('🚀 Starting Ingestion & Clave Inference API Verification Tests...');
  console.log(`Ingest API: ${INGEST_API_URL}`);
  console.log(`Clave API: ${CLAVE_API_URL}\n`);

  const songsDir = path.resolve(__dirname, '../public/songs');
  const tempAudioPath = path.join(__dirname, 'mock_track.mp3');
  
  // Create a 1-second dummy silent wav/mp3 file for analysis fallback to succeed quickly
  const sampleRate = 22050;
  const numSamples = sampleRate; // 1 second
  const buffer = Buffer.alloc(44 + numSamples * 2);
  
  // Write WAV header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);
  
  fs.writeFileSync(tempAudioPath, buffer);
  
  // Build raw multipart form body
  const boundary = '----TestBoundary' + Math.random().toString(36).substring(2);
  const multipartHeader = `multipart/form-data; boundary=${boundary}`;
  
  const payloadParts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="youtubeId"\r\n\r\nyoutube-ingest-test\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nIngestion Test track\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="artist"\r\n\r\nCalibration Artist\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="genre"\r\n\r\nSALSA\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="mock_track.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`
  ];
  
  const partBuffers = payloadParts.map(part => Buffer.from(part, 'utf8'));
  const fileBuffer = fs.readFileSync(tempAudioPath);
  const endBuffer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  
  const requestBody = Buffer.concat([
    partBuffers[0],
    partBuffers[1],
    partBuffers[2],
    partBuffers[3],
    partBuffers[4],
    fileBuffer,
    endBuffer
  ]);

  try {
    // Clean up previous test runs if any
    const finalAudioPath = path.join(songsDir, 'youtube-ingest-test.mp3');
    const finalJsonPath = path.join(songsDir, 'youtube-ingest-test.json');
    const stemsDir = path.join(songsDir, 'stems', 'youtube-ingest-test');
    
    if (fs.existsSync(finalAudioPath)) fs.unlinkSync(finalAudioPath);
    if (fs.existsSync(finalJsonPath)) fs.unlinkSync(finalJsonPath);
    if (fs.existsSync(stemsDir)) {
      fs.rmSync(stemsDir, { recursive: true, force: true });
    }

    // TEST CASE 1: INGESTION (Phase 1)
    console.log('Test Case 1: Sending Ingestion Request (Phase 1)...');
    const res = await fetch(INGEST_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': multipartHeader,
        'Content-Length': requestBody.length.toString()
      },
      body: requestBody
    });

    console.log(`Ingest response status: ${res.status}`);
    const resText = await res.text();
    
    if (res.status !== 200) {
      throw new Error(`Ingestion failed with status ${res.status}. Response: ${resText}`);
    }

    const data = JSON.parse(resText);
    if (!data.success) {
      throw new Error('Response success flag is false');
    }
    
    // Assert clave was NOT guessed during ingestion (Phase 1)
    if (data.song.defaultClave !== 'NOT_SET') {
      throw new Error(`Clave was guessed during Ingestion Phase: ${data.song.defaultClave} (Expected: 'NOT_SET')`);
    }
    console.log('Verified that defaultClave remains "NOT_SET" after ingestion.');
    console.log('✅ Ingestion (Phase 1) verified successfully.\n');

    // TEST CASE 2: CLAVE INFERENCE (Phase 3)
    console.log('Test Case 2: Sending Clave Inference Request (Phase 3)...');
    
    // Verify stems exist first
    const drumsPath = path.join(stemsDir, 'drums.wav');
    const bassPath = path.join(stemsDir, 'bass.wav');
    if (!fs.existsSync(drumsPath) || !fs.existsSync(bassPath)) {
      throw new Error('Isolated stems not found on disk after ingestion.');
    }

    const claveRes = await fetch(CLAVE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        youtubeId: 'youtube-ingest-test',
        startTimeMs: 0,
        endTimeMs: 1000
      })
    });

    console.log(`Clave response status: ${claveRes.status}`);
    const claveText = await claveRes.text();
    
    if (claveRes.status !== 200) {
      throw new Error(`Clave inference failed with status ${claveRes.status}. Response: ${claveText}`);
    }

    const claveData = JSON.parse(claveText);
    if (!claveData.success || !claveData.claveDirection) {
      throw new Error(`Clave inference response invalid: ${claveText}`);
    }
    
    console.log(`Inferred Clave direction direction: ${claveData.claveDirection}`);
    if (claveData.claveDirection !== '2-3' && claveData.claveDirection !== '3-2') {
      throw new Error(`Inferred clave direction is invalid: ${claveData.claveDirection}`);
    }
    console.log('✅ Clave Inference (Phase 3) verified successfully.\n');

    console.log('🎉 All Calibration Workflow Integration Tests completed successfully!');

    // Clean up test runs
    if (fs.existsSync(finalAudioPath)) fs.unlinkSync(finalAudioPath);
    if (fs.existsSync(finalJsonPath)) fs.unlinkSync(finalJsonPath);
    if (fs.existsSync(stemsDir)) {
      fs.rmSync(stemsDir, { recursive: true, force: true });
    }
    if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);

  } catch (err) {
    console.error('❌ Ingestion API Test Failed:', err.message);
    if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
    process.exit(1);
  }
}

runIngestTests();
