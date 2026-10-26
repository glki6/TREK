import { Places } from '../../db/entities/Places.entity';
import { PlacesRepository } from '../../db/repositories/Places.repository';
import { badRequest } from '../common/domain-error';
import { MapsService } from '../maps/maps.service';
import { unlinkedPlaces } from './place-enrichment.fork';
import { PlacesService } from './places.service';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable } from '@nestjs/common';

/**
 * Fork-only: the manual counterpart of the list-import enrichment, behind
 * `POST /api/trips/:tripId/places/enrich` (places-enrich.controller.ts). It is how places
 * already in a trip, from an import that had no "enrich" option or from before this
 * release, get their Google link, photo and address.
 */
@Injectable()
export class PlacesEnrichService {
  constructor(
    private readonly places: PlacesService,
    private readonly maps: MapsService,
    @InjectRepository(Places) private readonly placesRepo: PlacesRepository,
  ) {}

  /**
   * Queues every unlinked place of the trip for the background Google pass and says how
   * many: each enriched place then arrives over the websocket. Without a Google Maps key
   * nothing could be resolved, so that is refused instead of queueing lookups that fail.
   * @txStandalone the pass is detached and fills empty columns one place at a time.
   */
  async enrichUnlinkedPlaces(tripId: string, userId: number): Promise<number> {
    if (!(await this.maps.getMapsKey(userId))) {
      throw badRequest('A Google Maps API key is required to enrich places');
    }
    const places = unlinkedPlaces(await this.placesRepo.listAllForTrip(tripId));
    void this.places.enrichImportedPlaces(tripId, userId, places);
    return places.length;
  }
}
