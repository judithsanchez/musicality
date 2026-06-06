import { describe, it, expect } from 'vitest';
import { StrictSongMapSchema } from '../schemas';
import validSalsaMap from './fixtures/valid-salsa-map.json';
import validBachataMap from './fixtures/valid-bachata-map.json';

const UUID_1 = '11111111-1111-4111-8111-111111111111';
const UUID_2 = '22222222-2222-4222-8222-222222222222';
const UUID_BACH_1 = '33333333-3333-4333-8333-333333333333';
const UUID_BACH_2 = '44444444-4444-4444-8444-444444444444';
const UUID_EXTRA = '55555555-5555-4555-8555-555555555555';
const UUID_UNREF = '66666666-6666-4666-8666-666666666666';

describe('StrictSongMapSchema Validation', () => {
  it('should pass for a valid Salsa song map', () => {
    const res = StrictSongMapSchema.safeParse(validSalsaMap);
    if (!res.success) {
      console.log('Salsa Errors:', JSON.stringify(res.error.issues, null, 2));
    }
    expect(res.success).toBe(true);
  });

  it('should pass for a valid Bachata song map', () => {
    const res = StrictSongMapSchema.safeParse(validBachataMap);
    if (!res.success) {
      console.log('Bachata Errors:', JSON.stringify(res.error.issues, null, 2));
    }
    expect(res.success).toBe(true);
  });

  describe('Section Contiguity Checks', () => {
    it('should fail if the first section does not start at 0', () => {
      const invalid = JSON.parse(JSON.stringify(validSalsaMap));
      invalid.sections[0].startTimeMs = 100;
      invalid.phrases[0].startTimeMs = 100; // Keep phrase start time aligned to make it only a section issue
      
      const res = StrictSongMapSchema.safeParse(invalid);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some(i => i.message.includes('First section must start at 0 ms'))).toBe(true);
      }
    });

    it('should fail if there is a gap between sections', () => {
      const invalid = JSON.parse(JSON.stringify(validSalsaMap));
      invalid.sections[1].startTimeMs = 1200; // gap from 1000 to 1200
      invalid.phrases[1].startTimeMs = 1200;
      
      const res = StrictSongMapSchema.safeParse(invalid);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some(i => i.message.includes('Section gap or overlap detected'))).toBe(true);
      }
    });

    it('should fail if the last section end time does not match the last beat time', () => {
      const invalid = JSON.parse(JSON.stringify(validSalsaMap));
      invalid.sections[1].endTimeMs = 2500; // last beat is at 2000
      invalid.phrases[1].endTimeMs = 2500;
      
      const res = StrictSongMapSchema.safeParse(invalid);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some(i => i.message.includes('must match the last beat in absoluteBeatMap'))).toBe(true);
      }
    });
  });

  describe('Phrase Contiguity & Boundary Checks', () => {
    it('should fail if the first phrase in a section does not start at section start time', () => {
      const invalid = JSON.parse(JSON.stringify(validSalsaMap));
      invalid.phrases[0].startTimeMs = 100; // Section start is 0
      
      const res = StrictSongMapSchema.safeParse(invalid);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some(i => i.message.includes('must start at section start time'))).toBe(true);
      }
    });

    it('should fail if there is a gap/overlap between phrases inside a section', () => {
      const invalid = JSON.parse(JSON.stringify(validSalsaMap));
      invalid.sections[0].phraseIds = [UUID_1, UUID_EXTRA];
      invalid.phrases.push({
        id: UUID_EXTRA,
        index: 3,
        startTimeMs: 600, // gap from 500 to 600
        endTimeMs: 1000,
        type: 'STANDARD_8_COUNT',
        genre: 'SALSA',
        claveDirection: '2-3',
        claveIsVerified: true,
        events: []
      });
      invalid.phrases[0].endTimeMs = 500; // starts 0, ends 500

      const res = StrictSongMapSchema.safeParse(invalid);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some(i => i.message.includes('Phrase gap or overlap detected'))).toBe(true);
      }
    });

    it('should fail if the last phrase in a section does not end at section end time', () => {
      const invalid = JSON.parse(JSON.stringify(validSalsaMap));
      invalid.phrases[0].endTimeMs = 900; // Section end is 1000
      
      const res = StrictSongMapSchema.safeParse(invalid);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some(i => i.message.includes('must end at section end time'))).toBe(true);
      }
    });

    it('should fail if a phrase is not referenced by any section', () => {
      const invalid = JSON.parse(JSON.stringify(validSalsaMap));
      invalid.phrases.push({
        id: UUID_UNREF,
        index: 3,
        startTimeMs: 2000,
        endTimeMs: 3000,
        type: 'STANDARD_8_COUNT',
        genre: 'SALSA',
        claveDirection: '2-3',
        claveIsVerified: true,
        events: []
      });

      const res = StrictSongMapSchema.safeParse(invalid);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some(i => i.message.includes('is not referenced by any section'))).toBe(true);
      }
    });

    it('should fail if a phrase is referenced by multiple sections', () => {
      const invalid = JSON.parse(JSON.stringify(validSalsaMap));
      invalid.sections[1].phraseIds = [UUID_1]; // both sections reference UUID_1

      const res = StrictSongMapSchema.safeParse(invalid);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some(i => i.message.includes('referenced in multiple sections'))).toBe(true);
      }
    });
  });

  describe('Genre Consistency Checks', () => {
    it('should fail if a Salsa song map contains a Bachata phrase', () => {
      const invalid = JSON.parse(JSON.stringify(validSalsaMap));
      invalid.phrases[0].genre = 'BACHATA';
      
      const res = StrictSongMapSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('should fail if a Salsa song map contains a Bachata section (invalid energy state)', () => {
      const invalid = JSON.parse(JSON.stringify(validSalsaMap));
      invalid.sections[0].energyState = 'MAJAO'; // Only valid in Bachata
      
      const res = StrictSongMapSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });
  });

  describe('Status Field Validation', () => {
    it('should default status to DRAFT_CUTTING if not specified', () => {
      const copy = JSON.parse(JSON.stringify(validSalsaMap));
      delete copy.status;
      const res = StrictSongMapSchema.safeParse(copy);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.status).toBe('DRAFT_CUTTING');
      }
    });

    it('should validate valid status values', () => {
      const copy = JSON.parse(JSON.stringify(validSalsaMap));
      copy.status = 'READY';
      const res = StrictSongMapSchema.safeParse(copy);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.status).toBe('READY');
      }
    });

    it('should fail for invalid status values', () => {
      const copy = JSON.parse(JSON.stringify(validSalsaMap));
      copy.status = 'INVALID_STATUS';
      const res = StrictSongMapSchema.safeParse(copy);
      expect(res.success).toBe(false);
    });
  });
});
