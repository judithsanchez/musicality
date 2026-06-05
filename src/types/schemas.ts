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
  'MONTUNO',
  'MAMBO',
  'DESCARGA',
  'BREAK',
  'OUTRO'
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
  focusInstrument: z.string().optional(),
  emoji: z.string().optional()
});

export const BachataSectionSchema = BaseSectionSchema.extend({
  energyState: BachataEnergyStateSchema
});

export const SalsaSectionSchema = BaseSectionSchema.extend({
  energyState: SalsaEnergyStateSchema
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
  // 1. Genre consistency (explicit checks to satisfy the prompt and provide clear validation issues)
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
    // Check sections types
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
    // Check sections types
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

  // 2. Section Contiguity
  if (data.sections.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Sections array cannot be empty',
      path: ['sections'],
    });
  } else {
    // Sort sections chronologically
    const sortedSections = [...data.sections].sort((a, b) => a.startTimeMs - b.startTimeMs);
    
    // First section starts at 0
    if (sortedSections[0].startTimeMs !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `First section must start at 0 ms, but starts at ${sortedSections[0].startTimeMs} ms`,
        path: ['sections', 0, 'startTimeMs'],
      });
    }

    // No gaps, no overlaps
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

    // Ends at the last beat / end of song
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
          path: ['sections', data.sections.indexOf(lastSection), 'endTimeMs'],
        });
      }
    }
  }

  // 3. Phrase Contiguity within Sections
  // Validate that phrase IDs referenced by sections exist in phrases list, and are contiguous
  const phrasesMap = new Map(data.phrases.map(p => [p.id, p]));
  const referencedPhraseIds = new Set<string>();

  data.sections.forEach((section, sIdx) => {
    const sectionPhrases = section.phraseIds
      .map(pid => {
        referencedPhraseIds.add(pid);
        return phrasesMap.get(pid);
      })
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

    // If some phrase IDs in section were not found in the phrases list, report error
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
      // Sort section phrases chronologically
      const sortedPhrases = [...sectionPhrases].sort((a, b) => a.startTimeMs - b.startTimeMs);

      // Must fit strictly inside section boundaries (start of first phrase equals section start)
      if (sortedPhrases[0].startTimeMs !== section.startTimeMs) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `First phrase in section ${section.label} must start at section start time (${section.startTimeMs}ms), but starts at ${sortedPhrases[0].startTimeMs}ms`,
          path: ['sections', sIdx, 'phraseIds'],
        });
      }

      // No gaps or overlaps within the section's phrases
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

      // Must fit strictly inside section boundaries (end of last phrase equals section end)
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

  // Verify that all phrases in the map are referenced by at least one section
  data.phrases.forEach((phrase, idx) => {
    if (!referencedPhraseIds.has(phrase.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Phrase at index ${idx} with ID ${phrase.id} is not referenced by any section`,
        path: ['phrases', idx, 'id'],
      });
    }
  });

  // Check for phrase IDs referenced by multiple sections
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
