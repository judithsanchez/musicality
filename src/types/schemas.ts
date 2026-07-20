import { z } from 'zod';

export const GenreSchema = z.enum(['SALSA', 'BACHATA']);

export const CategorySchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1)
});

export const TagSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1)
});

export const CategoryCollectionSchema = z.object({
  schemaVersion: z.literal('1.0'),
  categories: z.array(CategorySchema)
});

export const TagCollectionSchema = z.object({
  schemaVersion: z.literal('1.0'),
  tags: z.array(TagSchema)
});

export const TimelineRangeSchema = z.object({
  id: z.string().trim().min(1),
  startTimeMs: z.number().int().nonnegative(),
  endTimeMs: z.number().int().nonnegative(),
  category: z.string().trim().default(''),
  tags: z.array(z.string().trim().min(1)).default([])
});

export const TapCalibrationPassSchema = z.object({
  id: z.string().trim().min(1),
  startedAt: z.string().trim().min(1),
  inputLatencyMs: z.number().int().default(0),
  sectionId: z.string().trim().min(1)
});

export const TapSchema = z.object({
  id: z.string().trim().min(1),
  timeMs: z.number().int().nonnegative(),
  correctedTimeMs: z.number().int().nonnegative(),
  passId: z.string().trim().min(1),
  source: z.literal('manual')
});

export const ReviewedAnchorSchema = z.object({
  id: z.string().trim().min(1),
  tapId: z.string().trim().min(1),
  timeMs: z.number().int().nonnegative(),
  count: z.union([z.literal(1), z.literal(4), z.literal(5), z.literal(8)]),
  confidence: z.enum(['suggested', 'confirmed', 'uncertain']).default('suggested'),
  reviewed: z.boolean().default(false)
});

export const TapSectionDecisionSchema = z.object({
  sectionId: z.string().trim().min(1),
  status: z.enum(['not_needed']).default('not_needed'),
  updatedAt: z.string().trim().min(1)
});

export const TapCalibrationSchema = z.object({
  sectionDecisions: z.array(TapSectionDecisionSchema).default([])
}).default({ sectionDecisions: [] });

export const SongMapSchema = z.object({
  id: z.string().trim().min(1),
  youtubeId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  artist: z.string().trim().min(1),
  genre: GenreSchema,
  status: z.enum(['DRAFT', 'READY']).default('DRAFT'),
  sections: z.array(TimelineRangeSchema).default([]),
  events: z.array(TimelineRangeSchema).default([]),
  tapCalibrationPasses: z.array(TapCalibrationPassSchema).default([]),
  taps: z.array(TapSchema).default([]),
  reviewedAnchors: z.array(ReviewedAnchorSchema).default([]),
  tapCalibration: TapCalibrationSchema,
  schemaVersion: z.literal('3.3')
});

export type Genre = z.infer<typeof GenreSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Tag = z.infer<typeof TagSchema>;
export type CategoryCollection = z.infer<typeof CategoryCollectionSchema>;
export type TagCollection = z.infer<typeof TagCollectionSchema>;
export type TimelineRange = z.infer<typeof TimelineRangeSchema>;
export type TapCalibrationPass = z.infer<typeof TapCalibrationPassSchema>;
export type Tap = z.infer<typeof TapSchema>;
export type ReviewedAnchor = z.infer<typeof ReviewedAnchorSchema>;
export type TapSectionDecision = z.infer<typeof TapSectionDecisionSchema>;
export type TapCalibration = z.infer<typeof TapCalibrationSchema>;
export type SongMap = z.infer<typeof SongMapSchema>;

const validateRangeList = (ranges: TimelineRange[], ctx: z.RefinementCtx, pathName: 'sections' | 'events') => {
  ranges.forEach((range, index) => {
    if (range.endTimeMs <= range.startTimeMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End time must be after start time',
        path: [pathName, index, 'endTimeMs']
      });
    }
  });
};

export const StrictSongMapSchema = SongMapSchema.superRefine((data, ctx) => {
  validateRangeList(data.sections, ctx, 'sections');
  validateRangeList(data.events, ctx, 'events');
  const passIds = new Set(data.tapCalibrationPasses.map(pass => pass.id));
  const tapIds = new Set(data.taps.map(tap => tap.id));
  const sectionIds = new Set(data.sections.map(section => section.id));
  const sectionById = new Map(data.sections.map(section => [section.id, section]));
  const passBySectionId = new Map<string, number>();

  data.tapCalibrationPasses.forEach((pass, index) => {
    if (!sectionIds.has(pass.sectionId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tap pass section does not exist',
        path: ['tapCalibrationPasses', index, 'sectionId']
      });
    }
    passBySectionId.set(pass.sectionId, (passBySectionId.get(pass.sectionId) || 0) + 1);
  });

  data.tapCalibrationPasses.forEach((pass, index) => {
    if ((passBySectionId.get(pass.sectionId) || 0) > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only one tap pass is allowed per section',
        path: ['tapCalibrationPasses', index, 'sectionId']
      });
    }
  });

  const sortedSections = [...data.sections].sort((a, b) => a.startTimeMs - b.startTimeMs);
  for (let index = 1; index < sortedSections.length; index++) {
    const prev = sortedSections[index - 1];
    const curr = sortedSections[index];
    if (curr.startTimeMs < prev.endTimeMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Section ranges cannot overlap',
        path: ['sections', index, 'startTimeMs']
      });
    }
  }

  if (data.status === 'READY') {
    data.sections.forEach((section, index) => {
      if (!section.category.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Ready songs require a category for every section',
          path: ['sections', index, 'category']
        });
      }
    });
    data.events.forEach((event, index) => {
      if (!event.category.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Ready songs require a category for every event',
          path: ['events', index, 'category']
        });
      }
    });
  }

  data.taps.forEach((tap, index) => {
    const pass = data.tapCalibrationPasses.find(item => item.id === tap.passId);
    if (!passIds.has(tap.passId) || !pass) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tap pass does not exist',
        path: ['taps', index, 'passId']
      });
      return;
    }
    const section = sectionById.get(pass.sectionId);
    if (section && (tap.correctedTimeMs < section.startTimeMs || tap.correctedTimeMs > section.endTimeMs)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tap time must be inside its pass section',
        path: ['taps', index, 'correctedTimeMs']
      });
    }
  });

  data.reviewedAnchors.forEach((anchor, index) => {
    const tap = data.taps.find(item => item.id === anchor.tapId);
    if (!tapIds.has(anchor.tapId) || !tap) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Reviewed anchor points to a missing raw tap',
        path: ['reviewedAnchors', index, 'tapId']
      });
      return;
    }
    const pass = data.tapCalibrationPasses.find(item => item.id === tap.passId);
    const section = pass ? sectionById.get(pass.sectionId) : null;
    if (section && (anchor.timeMs < section.startTimeMs || anchor.timeMs > section.endTimeMs)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Reviewed anchor time must be inside its pass section',
        path: ['reviewedAnchors', index, 'timeMs']
      });
    }
    if (data.genre === 'SALSA' && anchor.count !== 1 && anchor.count !== 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Salsa reviewed anchors may only use count 1 or 5',
        path: ['reviewedAnchors', index, 'count']
      });
    }
  });
});

export const createVocabularySongMapSchema = (categoryIds: string[], tagIds: string[]) => {
  const categorySet = new Set(categoryIds);
  const tagSet = new Set(tagIds);

  return StrictSongMapSchema.superRefine((data, ctx) => {
    const validateVocabulary = (ranges: TimelineRange[], pathName: 'sections' | 'events') => {
      ranges.forEach((range, rangeIndex) => {
        if (range.category && !categorySet.has(range.category)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Category does not exist in the category collection',
            path: [pathName, rangeIndex, 'category']
          });
        }

        range.tags.forEach((tagId, tagIndex) => {
          if (!tagSet.has(tagId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: 'Tag does not exist in the tag collection',
              path: [pathName, rangeIndex, 'tags', tagIndex]
            });
          }
        });
      });
    };

    validateVocabulary(data.sections, 'sections');
    validateVocabulary(data.events, 'events');
  });
};
