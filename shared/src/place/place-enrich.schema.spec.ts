import { placeEnrichResponseSchema } from './place-enrich.schema';

import { describe, expect, it } from 'vitest';

describe('placeEnrichResponseSchema (fork)', () => {
  it('SHARED-PLACE-ENRICH-001: describes the queued count and its message', () => {
    const body = { enriched: 3, message: '3 places queued for enrichment' };
    expect(placeEnrichResponseSchema.parse(body)).toEqual(body);
  });

  it('SHARED-PLACE-ENRICH-002: a count is a whole number, never negative or missing', () => {
    for (const enriched of [-1, 1.5, '3', undefined]) {
      expect(placeEnrichResponseSchema.safeParse({ enriched, message: 'x' }).success).toBe(false);
    }
  });
});
