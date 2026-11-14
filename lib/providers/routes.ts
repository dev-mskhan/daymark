import type { Place, TransportOption } from '../domain';
import { geoapifyJson } from './geoapify';

export class RoutesProvider {
  constructor(private fixture = false, private signal?: AbortSignal) {}
  get isLive() {
    return !this.fixture;
  }

  async walkingMinutes(places: Place[]): Promise<number[]> {
    if (places.length < 2) return [];
    if (!this.isLive) return Array.from({ length: places.length - 1 }, () => 25);
    return Promise.all(
      places.slice(0, -1).map((place, index) => this.routeMinutes(place, places[index + 1])),
    );
  }

  async options(origin: Place, destination: Place): Promise<TransportOption[]> {
    if (!this.isLive) return [
      { id: `walk:${origin.id}:${destination.id}`, mode: 'walk', durationMinutes: 25, walkingMinutes: 25, transfers: 0, distanceMeters: 1800, lines: [] },
      { id: `transit:${origin.id}:${destination.id}:0`, mode: 'transit', durationMinutes: 18, walkingMinutes: 7, transfers: 0, distanceMeters: 2200, fareYuan: 3, lines: ['Demo Metro Line'] },
    ];
    const [walking, transit] = await Promise.all([this.walkingOption(origin, destination), this.transitOptions(origin, destination)]);
    return [...(walking ? [walking] : []), ...transit].sort((a, b) => a.durationMinutes - b.durationMinutes);
  }

  private async routeMinutes(origin: Place, destination: Place) {
    const option = await this.walkingOption(origin, destination);
    if (!option) throw new Error('Geoapify did not return a walking time.');
    return option.durationMinutes;
  }

  private route(origin: Place, destination: Place, mode: string) {
    return geoapifyJson<GeoapifyRoute>(
      '/v1/routing',
      { waypoints: `${origin.latitude},${origin.longitude}|${destination.latitude},${destination.longitude}`, mode },
      { signal: this.signal },
    );
  }

  private async walkingOption(origin: Place, destination: Place): Promise<TransportOption | null> {
    const props = (await this.route(origin, destination, 'walk')).features?.[0]?.properties;
    const seconds = Number(props?.time);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    const durationMinutes = Math.max(1, Math.round(seconds / 60));
    return { id: `walk:${origin.id}:${destination.id}`, mode: 'walk', durationMinutes, walkingMinutes: durationMinutes, transfers: 0, distanceMeters: Number(props?.distance) || 0, lines: [] };
  }

  // Transit is best-effort: it is omitted unless the response includes a walking breakdown,
  // so the planner never receives invented walking minutes.
  private async transitOptions(origin: Place, destination: Place): Promise<TransportOption[]> {
    try {
      const props = (await this.route(origin, destination, 'transit')).features?.[0]?.properties;
      const seconds = Number(props?.time);
      if (!Number.isFinite(seconds) || seconds <= 0) return [];
      const steps = (props?.legs ?? []).flatMap(leg => leg.steps ?? []);
      if (!steps.length) return [];
      const walkingSeconds = steps.filter(step => step.mode === 'walk').reduce((sum, step) => sum + (Number(step.time) || 0), 0);
      const lines = [...new Set(steps.flatMap(step => step.transit?.route_name ?? step.transit?.short_name ?? []))];
      const boardings = steps.filter(step => step.mode && step.mode !== 'walk').length;
      return [{ id: `transit:${origin.id}:${destination.id}:0`, mode: 'transit', durationMinutes: Math.max(1, Math.round(seconds / 60)), walkingMinutes: Math.round(walkingSeconds / 60), transfers: Math.max(0, boardings - 1), distanceMeters: Number(props?.distance) || 0, lines }];
    } catch (error) {
      this.signal?.throwIfAborted();
      return [];
    }
  }
}

type GeoapifyRoute = {
  features?: {
    properties?: {
      time?: number;
      distance?: number;
      legs?: { steps?: { mode?: string; time?: number; transit?: { route_name?: string; short_name?: string } }[] }[];
    };
  }[];
};
