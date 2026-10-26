import { z } from 'zod';

/**
 * Fork-only: what `POST /api/trips/:tripId/places/enrich` answers. The places are
 * looked up on Google in the background, so the answer only says how many were
 * queued; each enriched place then arrives as a `place:updated` event.
 */
export const placeEnrichResponseSchema = z.object({
  enriched: z.number().int().nonnegative(),
  message: z.string(),
});
export type PlaceEnrichResponse = z.infer<typeof placeEnrichResponseSchema>;
