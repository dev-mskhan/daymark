import type { Place, TransportOption } from '../domain';

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
    if (!option) throw new Error('高德未返回步行时间。');
    return option.durationMinutes;
  }

  private async walkingOption(origin: Place, destination: Place): Promise<TransportOption | null> {
    if (!process.env.AMAP_KEY) throw new Error('真实模式需要 AMAP_KEY。');
    const params = new URLSearchParams({ key: process.env.AMAP_KEY, origin: `${origin.longitude},${origin.latitude}`, destination: `${destination.longitude},${destination.latitude}`, show_fields: 'cost' });
    const response = await fetch(`https://restapi.amap.com/v5/direction/walking?${params}`, {
      signal: this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`高德步行路线失败 (${response.status})`);
    const payload = (await response.json()) as { status?: string; info?: string; route?: { paths?: { distance?: string; cost?: { duration?: string } }[] } };
    if (payload.status !== '1') throw new Error(`高德步行路线失败：${payload.info ?? 'unknown'}`);
    const path = payload.route?.paths?.[0];
    const seconds = Number(path?.cost?.duration);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    const durationMinutes = Math.max(1, Math.round(seconds / 60));
    return { id: `walk:${origin.id}:${destination.id}`, mode: 'walk', durationMinutes, walkingMinutes: durationMinutes, transfers: 0, distanceMeters: Number(path?.distance) || 0, lines: [] };
  }

  private async transitOptions(origin: Place, destination: Place): Promise<TransportOption[]> {
    if (!origin.cityCode || !destination.cityCode) return [];
    const params = new URLSearchParams({ key: process.env.AMAP_KEY!, origin: `${origin.longitude},${origin.latitude}`, destination: `${destination.longitude},${destination.latitude}`, city1: origin.cityCode, city2: destination.cityCode, strategy: '0', show_fields: 'cost' });
    try {
      const response = await fetch(`https://restapi.amap.com/v5/direction/transit/integrated?${params}`, { signal: this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) });
      const payload = await response.json() as { status?: string; route?: { transits?: { distance?: string; walking_distance?: string; cost?: { duration?: string; transit_fee?: string }; segments?: { bus?: { buslines?: { name?: string }[] } }[] }[] } };
      if (!response.ok || payload.status !== '1') return [];
      return (payload.route?.transits ?? []).slice(0, 3).flatMap((path, index) => {
        const durationMinutes = Math.round(Number(path.cost?.duration) / 60);
        if (!Number.isFinite(durationMinutes) || durationMinutes < 1) return [];
        const boardings = (path.segments ?? []).filter(segment => segment.bus?.buslines?.length).length;
        const lines = [...new Set((path.segments ?? []).flatMap(segment => segment.bus?.buslines ?? []).flatMap(line => line.name ? [line.name] : []))];
        const fare = Number(path.cost?.transit_fee);
        return [{ id: `transit:${origin.id}:${destination.id}:${index}`, mode: 'transit' as const, durationMinutes, walkingMinutes: Math.round((Number(path.walking_distance) || 0) / 75), transfers: Math.max(0, boardings - 1), distanceMeters: Number(path.distance) || 0, ...(Number.isFinite(fare) ? { fareYuan: fare } : {}), lines }];
      });
    } catch (error) {
      this.signal?.throwIfAborted();
      return [];
    }
  }
}
