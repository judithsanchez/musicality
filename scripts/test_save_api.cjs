const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5173;
const API_URL = `http://localhost:${PORT}/api/songs`;

const UUID_1 = '11111111-1111-4111-8111-111111111111';
const UUID_2 = '22222222-2222-4222-8222-222222222222';

const validSalsaMap = {
  id: 'song-salsa-test-id',
  youtubeId: 'salsa-yt-test',
  title: 'Salsa API Test',
  artist: 'API Test Artist',
  genre: 'SALSA',
  baseBpm: 120,
  absoluteBeatMap: [0, 500, 1000, 1500, 2000],
  schemaVersion: '2.0',
  defaultClave: '2-3',
  sections: [
    {
      id: 'sec-1',
      startTimeMs: 0,
      endTimeMs: 1000,
      label: 'Intro',
      phraseIds: [UUID_1],
      energyState: 'INTRO',
      emoji: '🎵'
    },
    {
      id: 'sec-2',
      startTimeMs: 1000,
      endTimeMs: 2000,
      label: 'Verse',
      phraseIds: [UUID_2],
      energyState: 'VERSE',
      emoji: '🎤'
    }
  ],
  phrases: [
    {
      id: UUID_1,
      index: 1,
      startTimeMs: 0,
      endTimeMs: 1000,
      type: 'STANDARD_8_COUNT',
      genre: 'SALSA',
      claveDirection: '2-3',
      claveIsVerified: true,
      events: []
    },
    {
      id: UUID_2,
      index: 2,
      startTimeMs: 1000,
      endTimeMs: 2000,
      type: 'STANDARD_8_COUNT',
      genre: 'SALSA',
      claveDirection: '2-3',
      claveIsVerified: true,
      events: []
    }
  ]
};

const invalidSalsaMap = {
  ...validSalsaMap,
  sections: [
    {
      id: 'sec-1',
      startTimeMs: 0,
      endTimeMs: 900, // gap: ends at 900 but next starts at 1000
      label: 'Intro',
      phraseIds: [UUID_1],
      energyState: 'INTRO',
      emoji: '🎵'
    },
    {
      id: 'sec-2',
      startTimeMs: 1000,
      endTimeMs: 2000,
      label: 'Verse',
      phraseIds: [UUID_2],
      energyState: 'VERSE',
      emoji: '🎤'
    }
  ]
};

async function runTests() {
  console.log('🚀 Starting API Verification Tests...');
  console.log(`Target API: ${API_URL}\n`);

  // Test Case 1: Send invalid payload (expect 400 Bad Request)
  console.log('Test Case 1: Sending invalid payload (with section gap)...');
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidSalsaMap)
    });

    console.log(`Response status: ${res.status}`);
    if (res.status !== 400) {
      throw new Error(`Expected status 400, got ${res.status}`);
    }

    const data = await res.json();
    console.log('Received validation errors as expected:');
    console.log(JSON.stringify(data.issues, null, 2));
    console.log('✅ Test Case 1 Passed.\n');
  } catch (err) {
    console.error('❌ Test Case 1 Failed:', err.message);
    process.exit(1);
  }

  // Test Case 2: Send valid payload (expect 200 OK and file writes)
  console.log('Test Case 2: Sending valid payload...');
  try {
    // Clean up existing test files first
    const songsDir = path.resolve(__dirname, '../public/songs');
    const songFilePath = path.join(songsDir, 'salsa-yt-test.json');
    const catalogFilePath = path.join(songsDir, 'catalog.json');

    if (fs.existsSync(songFilePath)) {
      fs.unlinkSync(songFilePath);
    }

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validSalsaMap)
    });

    console.log(`Response status: ${res.status}`);
    if (res.status !== 200) {
      throw new Error(`Expected status 200, got ${res.status}`);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error('Response success flag is false');
    }

    // Verify song JSON exists and matches
    if (!fs.existsSync(songFilePath)) {
      throw new Error(`Song map file not written to: ${songFilePath}`);
    }

    const savedSong = JSON.parse(fs.readFileSync(songFilePath, 'utf8'));
    if (savedSong.youtubeId !== 'salsa-yt-test') {
      throw new Error(`Saved song has incorrect youtubeId: ${savedSong.youtubeId}`);
    }
    console.log('Verified that song JSON was successfully saved to disk.');

    // Verify catalog update
    if (!fs.existsSync(catalogFilePath)) {
      throw new Error(`Catalog file does not exist at: ${catalogFilePath}`);
    }

    const catalog = JSON.parse(fs.readFileSync(catalogFilePath, 'utf8'));
    const entry = catalog.find(item => item.youtubeId === 'salsa-yt-test');
    if (!entry) {
      throw new Error('Catalog does not contain entry for salsa-yt-test');
    }

    if (entry.title !== 'Salsa API Test' || entry.genre !== 'SALSA' || entry.defaultClave !== '2-3') {
      throw new Error(`Catalog entry metadata is incorrect: ${JSON.stringify(entry)}`);
    }
    console.log('Verified that catalog.json was successfully updated with correct metadata.');
    console.log('✅ Test Case 2 Passed.\n');
  } catch (err) {
    console.error('❌ Test Case 2 Failed:', err.message);
    process.exit(1);
  }

  console.log('🎉 All API verification tests completed successfully!');
}

runTests();
