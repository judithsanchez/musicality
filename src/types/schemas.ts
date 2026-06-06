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

export const BeatSchema = z.object({
  count: z.number().int().min(1),
  timestampMs: z.number().int()
});

export const DanceEventSchema = z.object({
  timestampMs: z.number().int(),
  durationMs: z.number().int().optional(),
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
  calibratedBeats: z.array(BeatSchema).optional(),
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
  phraseIds: z.array(z.string()),
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
  status: z.enum(['DRAFT_CUTTING', 'DRAFT_TAPPING', 'DRAFT_LABELING', 'READY']).default('DRAFT_CUTTING'),
  baseBpm: z.number().positive(),
  absoluteBeatMap: z.array(z.number().int()),
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

    if (data.absoluteBeatMap.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'absoluteBeatMap cannot be empty',
        path: ['absoluteBeatMap'],
      });
    } else {
      const lastBeatTime = data.absoluteBeatMap[data.absoluteBeatMap.length - 1];
      const lastSection = sortedSections[sortedSections.length - 1];
      if (lastSection.endTimeMs !== lastBeatTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Last section end time (${lastSection.endTimeMs}ms) must match the last beat in absoluteBeatMap (${lastBeatTime}ms)`,
          path: ['sections', data.sections.findIndex(s => s.id === lastSection.id), 'endTimeMs'],
        });
      }
    }
  }

  const phrasesMap = new Map(data.phrases.map(p => [p.id, p]));
  const referencedPhraseIds = new Set<string>();

  data.sections.forEach((section, sIdx) => {
    const sectionPhrases = section.phraseIds
      .map(pid => {
        referencedPhraseIds.add(pid);
        return phrasesMap.get(pid);
      })
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

    section.phraseIds.forEach((pid, pIdx) => {
      if (!phrasesMap.has(pid)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Section ${section.label} references phrase ID ${pid} which does not exist in phrases list`,
          path: ['sections', sIdx, 'phraseIds', pIdx],
        });
      }
    });

    if (sectionPhrases.length > 0) {
      const sortedPhrases = [...sectionPhrases].sort((a, b) => a.startTimeMs - b.startTimeMs);

      if (sortedPhrases[0].startTimeMs !== section.startTimeMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `First phrase in section ${section.label} must start at section start time (${section.startTimeMs}ms), but starts at ${sortedPhrases[0].startTimeMs}ms`,
          path: ['sections', sIdx, 'phraseIds'],
        });
      }

      for (let i = 1; i < sortedPhrases.length; i++) {
        const prev = sortedPhrases[i - 1];
        const curr = sortedPhrases[i];
        if (curr.startTimeMs !== prev.endTimeMs) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Phrase gap or overlap detected in section ${section.label} between phrase index ${prev.index} (${prev.endTimeMs}ms) and phrase index ${curr.index} (${curr.startTimeMs}ms)`,
            path: ['sections', sIdx, 'phraseIds'],
          });
        }
      }

      const lastPhrase = sortedPhrases[sortedPhrases.length - 1];
      if (lastPhrase.endTimeMs !== section.endTimeMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Last phrase in section ${section.label} must end at section end time (${section.endTimeMs}ms), but ends at ${lastPhrase.endTimeMs}ms`,
          path: ['sections', sIdx, 'phraseIds'],
        });
      }
    }
  });

  data.phrases.forEach((phrase, idx) => {
    if (!referencedPhraseIds.has(phrase.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Phrase at index ${idx} with ID ${phrase.id} is not referenced by any section`,
        path: ['phrases', idx, 'id'],
      });
    }
  });

  const phraseUsageCount = new Map<string, number>();
  data.sections.forEach(s => {
    s.phraseIds.forEach(pid => {
      phraseUsageCount.set(pid, (phraseUsageCount.get(pid) || 0) + 1);
    });
  });
  phraseUsageCount.forEach((count, pid) => {
    if (count > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Phrase with ID ${pid} is referenced in multiple sections`,
        path: ['sections'],
      });
    }
  });
});
