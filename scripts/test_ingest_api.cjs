const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5173;
const INGEST_API_URL = `http://localhost:${PORT}/api/ingest`;

async function runIngestTests() {
  console.log('🚀 Starting Ingestion API Verification Test...');
  console.log(`Ingest API: ${INGEST_API_URL}\n`);

  const songsDir = path.resolve(__dirname, '../public/songs');
  const sampleRate = 22050;
  const numSamples = sampleRate;
  const buffer = Buffer.alloc(44 + numSamples * 2);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  const payload = {
    youtubeId: 'youtube-ingest-test',
    title: 'Ingestion Test track',
    artist: 'Calibration Artist',
    genre: 'SALSA'
  };

  const finalAudioPath = path.join(songsDir, 'youtube-ingest-test.mp3');
  const finalJsonPath = path.join(songsDir, 'youtube-ingest-test.json');
  const catalogFilePath = path.join(songsDir, 'catalog.json');

  let catalogBackup = null;
  if (fs.existsSync(catalogFilePath)) {
    catalogBackup = fs.readFileSync(catalogFilePath, 'utf8');
  }

  try {
    if (fs.existsSync(finalAudioPath)) fs.unlinkSync(finalAudioPath);
    if (fs.existsSync(finalJsonPath)) fs.unlinkSync(finalJsonPath);

    fs.writeFileSync(finalAudioPath, buffer);

    console.log('Test Case 1: Sending ingestion request...');
    const res = await fetch(INGEST_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
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

    if (data.song.status !== 'DRAFT' || !Array.isArray(data.song.sections) || !Array.isArray(data.song.events) || !Array.isArray(data.song.downbeats)) {
      throw new Error(`Ingested song shape is incorrect: ${JSON.stringify(data.song)}`);
    }
    console.log('Verified clean ingestion schema.');
    console.log('✅ Ingestion verified successfully.\n');

    console.log('🎉 Ingestion verification completed successfully!');

  } catch (err) {
    console.error('❌ Ingestion API Test Failed:', err.message);
    process.exit(1);
  } finally {
    if (fs.existsSync(finalAudioPath)) fs.unlinkSync(finalAudioPath);
    if (fs.existsSync(finalJsonPath)) fs.unlinkSync(finalJsonPath);
    if (catalogBackup !== null) {
      fs.writeFileSync(catalogFilePath, catalogBackup, 'utf8');
    } else if (fs.existsSync(catalogFilePath)) {
      fs.unlinkSync(catalogFilePath);
    }
  }
}

runIngestTests();
