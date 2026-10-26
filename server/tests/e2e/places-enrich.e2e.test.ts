/**
 * Fork-only: POST /api/trips/:tripId/places/enrich through the real JwtAuthGuard and
 * TripAccessGuard, over a migrated snapshot db. FORK-ENRICH-E2E-001 to 005.
 *
 * MapsService is a stand-in, so no lookup leaves the process; the background pass
 * itself is covered by tests/unit/nest/places.fork-enrichment.test.ts.
 */
import { Trips } from '../../src/db/entities/Trips.entity';
import { TrekExceptionFilter } from '../../src/nest/common/trek-exception.filter';
import { ZodValidationPipe } from '../../src/nest/common/zod-validation.pipe';
import { MapsService } from '../../src/nest/maps/maps.service';
import { PermissionsService } from '../../src/nest/permissions/permissions.service';
import { PlacesModule } from '../../src/nest/places/places.module';
import { PlacesService } from '../../src/nest/places/places.service';
import { RealtimeModule } from '../../src/nest/realtime/realtime.module';
import { RealtimeService } from '../../src/nest/realtime/realtime.service';
import { createSnapshotTestDb } from '../helpers/db-mock';
import { makePlace } from '../helpers/factories/places';
import { insertRow } from '../helpers/factories/rows';
import { makeUser } from '../helpers/factories/users';
import { FakeRealtimeService } from '../helpers/fake-realtime';
import { createTestMikroOrmModule, createTestOrm, type TestOrm } from '../helpers/test-orm';
import { TestUnitOfWorkModule } from '../helpers/test-uow';
import { sessionCookie } from './harness';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const db = createSnapshotTestDb();
const getMapsKey = vi.fn(async (): Promise<string | null> => 'key');

describe('POST /api/trips/:tripId/places/enrich (fork)', () => {
  let app: INestApplication;
  let server: Server;
  let orm: TestOrm;

  beforeAll(async () => {
    orm = await createTestOrm(db);
    await makeUser(orm, { id: 1, username: 'owner', email: 'owner@example.test' });
    await makeUser(orm, { id: 2, username: 'stranger', email: 'stranger@example.test' });
    await insertRow(orm, Trips, { id: 5, title: 'Trip', user: 1 });
    const moduleRef = await Test.createTestingModule({
      imports: [
        await TestUnitOfWorkModule.forRoot(db),
        await createTestMikroOrmModule(db),
        RealtimeModule,
        PlacesModule,
      ],
    })
      .overrideProvider(RealtimeService)
      .useValue(new FakeRealtimeService())
      .overrideProvider(MapsService)
      .useValue({ getMapsKey })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new TrekExceptionFilter());
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    getMapsKey.mockImplementation(async () => 'key');
  });

  afterAll(async () => {
    await app.close();
    await orm.close();
    db.close();
  });

  const enrich = (tripId: number, userId?: number) => {
    const req = request(server).post(`/api/trips/${tripId}/places/enrich`);
    return userId === undefined ? req : req.set('Cookie', sessionCookie(userId));
  };

  it('FORK-ENRICH-E2E-001: 401 without a session', async () => {
    expect((await enrich(5)).status).toBe(401);
  });

  it('FORK-ENRICH-E2E-002: 404 for a trip the caller cannot see', async () => {
    const res = await enrich(5, 2);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Trip not found' });
  });

  it('FORK-ENRICH-E2E-003: 403 without the right to edit places', async () => {
    vi.spyOn(app.get(PermissionsService), 'checkPermission').mockResolvedValue(false);
    const res = await enrich(5, 1);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'No permission' });
  });

  it('FORK-ENRICH-E2E-004: 400 rather than a count of places nothing will happen to when no key is set', async () => {
    getMapsKey.mockImplementation(async () => null);
    const queue = vi.spyOn(app.get(PlacesService), 'enrichImportedPlaces');
    const res = await enrich(5, 1);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'A Google Maps API key is required to enrich places' });
    expect(queue).not.toHaveBeenCalled();
  });

  it('FORK-ENRICH-E2E-005: answers 200 with how many places were queued', async () => {
    await makePlace(orm, 5, { name: 'Open' });
    await makePlace(orm, 5, { name: 'Linked', google_place_id: 'ChIJx' });
    const queue = vi.spyOn(app.get(PlacesService), 'enrichImportedPlaces').mockResolvedValue();
    const res = await enrich(5, 1);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ enriched: 1, message: '1 places queued for enrichment' });
    expect(queue).toHaveBeenCalledWith('5', 1, [expect.objectContaining({ name: 'Open' })]);
  });
});
