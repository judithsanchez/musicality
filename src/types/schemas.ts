import { z } from 'zod';

export const GenreSchema = z.enum(['SALSA', 'BACHATA']);

export const BachataEnergyStateSchema = z.enum([
  'INTRO',
  'DERECHO',
  'MAJAO',
  'MAMBO',
  'BREAK',
  'OUTRO'
]);

export const SalsaEnergyStateSchema = z.enum([
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

export const ClaveDirectionSchema = z.enum(['2-3', '3-2', 'NOT_SET', 'NONE']);

export const BeatTypeSchema = z.enum(['DOWNBEAT', 'NORMAL']);

export const BeatSchema = z.object({
  timestampMs: z.number().int(),
  type: BeatTypeSchema,
  count: z.number().int().optional()
});

export const DanceEventSchema = z.object({
  timestampMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive().optional(),
  type: z.enum(['ACCENT', 'FILL', 'VOCAL_CUE', 'INSTRUMENT_ENTRY', 'BUILD_UP', 'ENERGY_DROP']),
  description: z.string(),
  uiHighlight: z.boolean()
});

export const BasePhraseSchema = z.object({
  id: z.string().uuid(),
  index: z.number().int().positive(),
  startTimeMs: z.number().int(),
  endTimeMs: z.number().int(),
  type: z.enum(['STANDARD_8_COUNT', 'HALF_PHRASE_4_COUNT', 'TRANSITION_BREAK', 'NO_COUNT']),
  beats: z.array(BeatSchema).optional(),
  events: z.array(DanceEventSchema)
});

export const BachataPhraseSchema = BasePhraseSchema.extend({
  genre: z.literal(GenreSchema.enum.BACHATA)
});

export const SalsaPhraseSchema = BasePhraseSchema.extend({
  genre: z.literal(GenreSchema.enum.SALSA),
  claveDirection: ClaveDirectionSchema,
  claveIsVerified: z.boolean(),
  claveSource: z.enum(['AI', 'MANUAL', 'DEFAULT']).optional()
});

export const PhraseSchema = z.discriminatedUnion('genre', [
  BachataPhraseSchema,
  SalsaPhraseSchema
]);

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

export const TapSessionSchema = z.object({
  rawDownbeats: z.array(z.number().int()),
  calibratedDownbeats: z.array(z.number().int()),
  tappedAt: z.string()
});

export const BaseSongMapSchema = z.object({
  id: z.string(),
  youtubeId: z.string(),
  title: z.string(),
  artist: z.string(),
  genre: GenreSchema,
  status: z.enum(['DRAFT_CUTTING', 'DRAFT_TAPPING', 'DRAFT_LABELING', 'READY']).default('DRAFT_CUTTING'),
  isSectionsProcessed: z.boolean().default(false),
  isTappingProcessed: z.boolean().default(false),
  baseBpm: z.number().positive(),
  consensusDownbeats: z.array(z.number().int()).optional(),
  downbeats: z.array(TapSessionSchema).optional(),
  schemaVersion: z.literal('2.0')
});

export const BachataSongMapSchema = BaseSongMapSchema.extend({
  genre: z.literal(GenreSchema.enum.BACHATA),
  sections: z.array(BachataSectionSchema),
  phrases: z.array(BachataPhraseSchema)
});

export const SalsaSongMapSchema = BaseSongMapSchema.extend({
  genre: z.literal(GenreSchema.enum.SALSA),
  defaultClave: ClaveDirectionSchema,
  sections: z.array(SalsaSectionSchema),
  phrases: z.array(SalsaPhraseSchema)
});

export const SongMapSchema = z.discriminatedUnion('genre', [
  BachataSongMapSchema,
  SalsaSongMapSchema
]);

export type Genre = z.infer<typeof GenreSchema>;
export type ClaveDirection = z.infer<typeof ClaveDirectionSchema>;
export type BeatType = z.infer<typeof BeatTypeSchema>;
export type Beat = z.infer<typeof BeatSchema>;

export type DanceEvent = z.infer<typeof DanceEventSchema>;
export type BasePhrase = z.infer<typeof BasePhraseSchema>;
export type BachataPhrase = z.infer<typeof BachataPhraseSchema>;
export type SalsaPhrase = z.infer<typeof SalsaPhraseSchema>;
export type Phrase = z.infer<typeof PhraseSchema>;
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
    data.phrases.forEach((phrase, idx) => {
      if (phrase.genre !== 'BACHATA') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Bachata song map contains non-Bachata phrase at index ${idx} (genre: ${phrase.genre})`,
          path: ['phrases', idx, 'genre'],
        });
      }
    });
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
    data.phrases.forEach((phrase, idx) => {
      if (phrase.genre !== 'SALSA') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Salsa song map contains non-Salsa phrase at index ${idx} (genre: ${phrase.genre})`,
          path: ['phrases', idx, 'genre'],
        });
      }
    });
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

  data.phrases.forEach((phrase, phraseIndex) => {
    phrase.events.forEach((event, eventIndex) => {
      const eventEndTimeMs = event.timestampMs + (event.durationMs || 0);
      if (event.timestampMs < phrase.startTimeMs || event.timestampMs >= phrase.endTimeMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Event timestamp must be inside phrase ${phrase.index}`,
          path: ['phrases', phraseIndex, 'events', eventIndex, 'timestampMs']
        });
      }
      if (event.durationMs && eventEndTimeMs > phrase.endTimeMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Event range must end inside phrase ${phrase.index}`,
          path: ['phrases', phraseIndex, 'events', eventIndex, 'durationMs']
        });
      }
    });
  });

  if (data.isSectionsProcessed) {
    if (data.sections.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Sections array cannot be empty',
        path: ['sections'],
      });
    } else {
      const sortedSections = [...data.sections].sort((a, b) => a.startTimeMs - b.startTimeMs);
      
      if (sortedSections[0].startTimeMs !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `First section must start at 0 ms, but starts at ${sortedSections[0].startTimeMs} ms`,
          path: ['sections', 0, 'startTimeMs'],
        });
      }

      for (let i = 1; i < sortedSections.length; i++) {
        const prev = sortedSections[i - 1];
        const curr = sortedSections[i];
        if (curr.startTimeMs !== prev.endTimeMs) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Section gap or overlap detected between ${prev.label} (${prev.endTimeMs}ms) and ${curr.label} (${curr.startTimeMs}ms)`,
            path: ['sections', i, 'startTimeMs'],
          });
        }
      }
    }

  if (data.isTappingProcessed) {
    if (data.phrases.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Phrases array cannot be empty when tapping is processed',
        path: ['phrases'],
      });
    } else {
      const sortedPhrases = [...data.phrases].sort((a, b) => a.startTimeMs - b.startTimeMs);
      
      if (sortedPhrases[0].startTimeMs !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `First phrase must start at 0 ms, but starts at ${sortedPhrases[0].startTimeMs} ms`,
          path: ['phrases', 0, 'startTimeMs'],
        });
      }

      for (let i = 1; i < sortedPhrases.length; i++) {
        const prev = sortedPhrases[i - 1];
        const curr = sortedPhrases[i];
        if (curr.startTimeMs !== prev.endTimeMs) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Phrase gap or overlap detected between phrase index ${prev.index} (${prev.endTimeMs}ms) and phrase index ${curr.index} (${curr.startTimeMs}ms)`,
            path: ['phrases', i, 'startTimeMs'],
          });
        }
      }

      if (data.sections.length > 0) {
        const sortedSections = [...data.sections].sort((a, b) => a.startTimeMs - b.startTimeMs);
        const lastSectionEnd = sortedSections[sortedSections.length - 1].endTimeMs;
        const lastPhraseEnd = sortedPhrases[sortedPhrases.length - 1].endTimeMs;
        if (lastPhraseEnd !== lastSectionEnd) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Last phrase must end at the end of the song/sections (${lastSectionEnd}ms), but ends at ${lastPhraseEnd}ms`,
            path: ['phrases', data.phrases.length - 1, 'endTimeMs'],
          });
        }
      }
    }
  }
  }
});
