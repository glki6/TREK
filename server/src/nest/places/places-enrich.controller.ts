import type { User } from '../../types';
import { CurrentUser } from '../auth-core/current-user.decorator';
import { JwtAuthGuard } from '../auth-core/jwt-auth.guard';
import { ResponseContract } from '../common/response-contract';
import { RequirePermission, TripAccessGuard } from '../permissions/trip-access.guard';
import { PlacesEnrichService } from './places-enrich.service';
import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { placeEnrichResponseSchema, type PlaceEnrichResponse } from '@trek/shared';

/**
 * Fork-only: /api/trips/:tripId/places/enrich, beside upstream's PlacesController so that
 * file can track upstream. No `:id` route takes a single segment on POST, so the static
 * segment needs no ordering against PlacesController's routes.
 */
@Controller('api/trips/:tripId/places')
@UseGuards(JwtAuthGuard)
export class PlacesEnrichController {
  constructor(private readonly enrich: PlacesEnrichService) {}

  /** Look every unlinked place of the trip up on Google in the background, as a list import does. */
  @Post('enrich')
  @HttpCode(200)
  @UseGuards(TripAccessGuard)
  @RequirePermission('place_edit')
  @ResponseContract(placeEnrichResponseSchema)
  async enrichPlaces(@CurrentUser() user: User, @Param('tripId') tripId: string): Promise<PlaceEnrichResponse> {
    const enriched = await this.enrich.enrichUnlinkedPlaces(tripId, user.id);
    return { enriched, message: `${enriched} places queued for enrichment` };
  }
}
