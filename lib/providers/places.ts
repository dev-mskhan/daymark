import type { ExperienceType, Place } from '../domain';

const SEARCH_TERMS: Record<ExperienceType, string[]> = {
  iconic: ['著名景点'], history: ['博物馆', '历史文化景点'], local_life: ['历史街区', '书店'],
  art: ['美术馆', '艺术馆'], nature: ['公园', '园林'], food: ['本地特色菜', '老字号餐厅'], architecture: ['历史建筑'],
};
type AmapGeocode = { city?: string; citycode?: string; adcode?: string; location?: string };
type AmapPoi = { id?: string; name?: string; type?: string; location?: string; address?: string | string[]; citycode?: string; adcode?: string; business?: { rating?: string; opentime_week?: string; keytag?: string; rectag?: string } | string[] };

export class PlacesProvider {
  constructor(private fixture = false, private signal?: AbortSignal) {}
  get isLive() { return !this.fixture; }

  async discover(destination: string, lenses: ExperienceType[]): Promise<Place[]> {
    if (!this.isLive) return demoPlaces(destination);
    if (!process.env.AMAP_KEY) throw new Error('真实模式需要 AMAP_KEY。');
    const city = await this.resolveCity(destination);
    const groups: Place[][] = [];
    for (const term of [...new Set(lenses.flatMap(lens => SEARCH_TERMS[lens]))]) {
      groups.push(await this.search(term, city.city ?? destination));
      this.signal?.throwIfAborted();
      await new Promise(resolve => setTimeout(resolve, 230));
    }
    const interleaved = Array.from({ length: Math.max(0, ...groups.map(group => group.length)) }, (_, index) => groups.flatMap(group => group[index] ? [group[index]] : [])).flat();
    const [centerLon, centerLat] = parseLocation(city.location);
    const places = deduplicate(interleaved).filter(place => Number.isFinite(centerLat) && Number.isFinite(centerLon) ? distanceKm(centerLat, centerLon, place.latitude, place.longitude) < 18 : true).slice(0, 30);
    if (places.length < 3) throw new Error(`We could not find enough places in ${destination}. Live planning currently supports destinations across mainland China.`);
    return places;
  }

  private async resolveCity(destination: string): Promise<AmapGeocode> {
    const payload = await this.getJson('https://restapi.amap.com/v3/geocode/geo', { address: destination });
    const city = (payload.geocodes as AmapGeocode[] | undefined)?.[0];
    if (!city?.city || !city.location) throw new Error(`We could not recognise ${destination} as a supported city. Live planning currently supports destinations across mainland China.`);
    return city;
  }

  private async search(keywords: string, region: string): Promise<Place[]> {
    const payload = await this.getJson('https://restapi.amap.com/v5/place/text', { keywords, region, city_limit: 'true', page_size: '6', show_fields: 'business' });
    return ((payload.pois as AmapPoi[] | undefined) ?? []).flatMap(poi => {
      const [longitude, latitude] = parseLocation(poi.location);
      if (!poi.id || !poi.name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      const business = Array.isArray(poi.business) ? undefined : poi.business;
      const rating = Number(business?.rating);
      return [{ id: `amap:${poi.id}`, name: poi.name, address: Array.isArray(poi.address) ? poi.address.join('') : poi.address ?? '', latitude, longitude,
        types: [...new Set([...(poi.type?.split(';') ?? []), business?.keytag, business?.rectag].filter(Boolean) as string[])], ...(Number.isFinite(rating) ? { rating } : {}),
        source: 'amap' as const, cityCode: poi.citycode, adcode: poi.adcode, openingHours: business?.opentime_week }];
    });
  }

  private async getJson(url: string, params: Record<string, string>) {
    const query = new URLSearchParams({ key: process.env.AMAP_KEY!, ...params });
    const response = await fetch(`${url}?${query}`, { signal: this.signal ? AbortSignal.any([this.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`高德请求失败 (${response.status})`);
    const payload = await response.json() as Record<string, unknown>;
    if (payload.status !== '1') throw new Error(`高德请求失败：${String(payload.info ?? payload.infocode ?? 'unknown')}`);
    return payload;
  }
}

function parseLocation(location?: string): [number, number] { const [longitude, latitude] = (location ?? '').split(',').map(Number); return [longitude, latitude]; }
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) { const y = (lat2 - lat1) * 111; const x = (lon2 - lon1) * 111 * Math.cos(lat1 * Math.PI / 180); return Math.hypot(x, y); }
function deduplicate(places: Place[]) {
  const kept: Place[] = [];
  for (const place of places) {
    if (kept.some(existing => existing.id === place.id || (distanceKm(existing.latitude, existing.longitude, place.latitude, place.longitude) < .6 && (existing.name === place.name || existing.name.startsWith(place.name) || place.name.startsWith(existing.name))))) continue;
    kept.push(place);
  }
  return kept;
}
function demoPlaces(destination: string): Place[] {
  const center = { latitude: 35.6812, longitude: 139.7671 };
  const names = [['Old Town Quarter',['historical_landmark','tourist_attraction']],['City History Museum',['museum','tourist_attraction']],['Central Food Market',['market','food']],['Riverside Garden',['park','garden']],['Independent Shop Lane',['shopping','neighborhood']],['Modern Art Hall',['art_gallery','museum']],['Grand City Landmark',['landmark','tourist_attraction']],['Traditional Lunch House',['restaurant','food']]] as const;
  return names.map(([name, types], index) => ({ id:`demo-${index}`, name, address:`${destination} · Demo location`, latitude:center.latitude+Math.sin(index)*.018, longitude:center.longitude+Math.cos(index)*.018, types:[...types], rating:4.1+index%4*.2, source:'demo' }));
}
