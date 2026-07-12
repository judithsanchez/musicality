import { z } from 'zod';

export const GenreSchema = z.enum(['SALSA', 'BACHATA']);

export const BachataEnergyStateSchema = z.enum([
  'UNLABELED',
  'INTRO',
  'DERECHO',
  'MAJAO',
  'MAMBO',
  'BREAK',
  'OUTRO'
]);

export const SalsaEnergyStateSchema = z.enum([
  'UNLABELED',
  'INTRO',
  'VERSE',
  'CHORUS',
  'MONTUNO',
  'MAMBO',
  'DESCARGA',
  'BREAK',
  'OUTRO'
]);

export const SalsaInstrumentSchema = z.enum([
  'PIANO',
  'VOCALS',
  'BRASS',
  'CONGAS',
  'BONGOS',
  'TIMBALES',
  'BASS',
  'COWBELL',
  'NONE'
]);

export const BachataInstrumentSchema = z.enum([
  'REQUINTO',
  'SEGUNDA',
  'BONGOS',
  'GUIRA',
  'BASS',
  'VOCALS',
  'NONE'
]);

export const DanceEventSchema = z.object({
  timestampMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive().optional(),
  type: z.enum(['ACCENT', 'FILL', 'VOCAL_CUE', 'INSTRUMENT_ENTRY', 'BUILD_UP', 'ENERGY_DROP']),
  description: z.string().default(''),
  uiHighlight: z.boolean().default(true)
});

export const BaseSectionSchema = z.object({
  id: z.string(),
  startTimeMs: z.number().int(),
  endTimeMs: z.number().int(),
  label: z.string(),
  emoji: z.string().optional()
});

export const BachataSectionSchema = BaseSectionSchema.extend({
  energyState: BachataEnergyStateSchema,
  focusInstrument: BachataInstrumentSchema.optional()
});

export const SalsaSectionSchema = BaseSectionSchema.extend({
  energyState: SalsaEnergyStateSchema,
  focusInstrument: SalsaInstrumentSchema.optional()
});

export const SectionSchema = z.union([
  BachataSectionSchema,
  SalsaSectionSchema
]);

export const BaseSongMapSchema = z.object({
  id: z.string(),
  youtubeId: z.string(),
  title: z.string(),
  artist: z.string(),
  genre: GenreSchema,
  status: z.enum(['DRAFT', 'READY']).default('DRAFT'),
  metadata: z.record(z.string(), z.unknown()).default({}),
  baseBpm: z.number().positive(),
  rawDownbeats: z.array(z.number().int()).default([]),
  calibratedDownbeats: z.array(z.number().int()).default([]),
  events: z.array(DanceEventSchema).default([]),
  schemaVersion: z.literal('2.0')
});

export const BachataSongMapSchema = BaseSongMapSchema.extend({
  genre: z.literal(GenreSchema.enum.BACHATA),
  sections: z.array(BachataSectionSchema)
});

export const SalsaSongMapSchema = BaseSongMapSchema.extend({
  genre: z.literal(GenreSchema.enum.SALSA),
  sections: z.array(SalsaSectionSchema)
});

export const SongMapSchema = z.discriminatedUnion('genre', [
  BachataSongMapSchema,
  SalsaSongMapSchema
]);

export type Genre = z.infer<typeof GenreSchema>;

export type DanceEvent = z.infer<typeof DanceEventSchema>;
export type BaseSection = z.infer<typeof BaseSectionSchema>;
export type BachataSection = z.infer<typeof BachataSectionSchema>;
export type SalsaSection = z.infer<typeof SalsaSectionSchema>;
export type Section = z.infer<typeof SectionSchema>;
export type BaseSongMap = z.infer<typeof BaseSongMapSchema>;
export type BachataSongMap = z.infer<typeof BachataSongMapSchema>;
export type SalsaSongMap = z.infer<typeof SalsaSongMapSchema>;
export type SongMap = z.infer<typeof SongMapSchema>;

export const StrictSongMapSchema = SongMapSchema.superRefine((data, ctx) => {
  if (data.genre === 'BACHATA') {
    data.sections.forEach((section, idx) => {
      const parsed = BachataEnergyStateSchema.safeParse(section.energyState);
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Bachata song map contains section with non-Bachata energyState: ${section.energyState}`,
          path: ['sections', idx, 'energyState'],
        });
      }
    });
  } else if (data.genre === 'SALSA') {
    data.sections.forEach((section, idx) => {
      const parsed = SalsaEnergyStateSchema.safeParse(section.energyState);
      if (!parsed.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Salsa song map contains section with non-Salsa energyState: ${section.energyState}`,
          path: ['sections', idx, 'energyState'],
        });
      }
    });
  }

  if (data.status === 'READY') {
    data.sections.forEach((section, sectionIndex) => {
      if (!section.label.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Ready songs require a label for every section',
          path: ['sections', sectionIndex, 'label']
        });
      }
      if (section.energyState === 'UNLABELED') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Ready songs require an energy state for every section',
          path: ['sections', sectionIndex, 'energyState']
        });
      }
    });
  }

  const sortedSections = [...data.sections].sort((a, b) => a.startTimeMs - b.startTimeMs);
  sortedSections.forEach((section, index) => {
    if (section.endTimeMs <= section.startTimeMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Section end time must be after start time',
        path: ['sections', index, 'endTimeMs'],
      });
    }
  });

  for (let i = 1; i < sortedSections.length; i++) {
    const prev = sortedSections[i - 1];
    const curr = sortedSections[i];
    if (curr.startTimeMs < prev.endTimeMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Section overlap detected between ${prev.label || `section ${i}`} and ${curr.label || `section ${i + 1}`}`,
        path: ['sections', i, 'startTimeMs'],
      });
    }
  }
});
