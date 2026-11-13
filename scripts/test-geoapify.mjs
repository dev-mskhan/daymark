import { Resolver } from "node:dns/promises";
import { readFile } from "node:fs/promises";
import process from "node:process";

const city = process.argv.slice(2).find((value) => !value.startsWith("--")) ?? "Tokyo";
const useEu = process.argv.includes("--eu");
const host = useEu ? "api-eu.geoapify.com" : "api.geoapify.com";

function parseEnv(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
        return [key, value];
      }),
  );
}

async function loadKey() {
  if (process.env.GEOAPIFY_API_KEY) return process.env.GEOAPIFY_API_KEY;
  try {
    const env = parseEnv(await readFile(new URL("../.env.local", import.meta.url), "utf8"));
    return env.GEOAPIFY_API_KEY;
  } catch {
    return undefined;
  }
}

async function main() {
  console.log(`Geoapify connectivity test`);
  console.log(`Host: ${host}`);
  console.log(`City: ${city}`);

  const apiKey = await loadKey();
  if (!apiKey) {
    console.error("\nFAIL: GEOAPIFY_API_KEY is missing from .env.local or the process environment.");
    process.exitCode = 1;
    return;
  }
  console.log("API key: configured (value hidden)");

  try {
    const resolver = new Resolver({ timeout: 5_000, tries: 1 });
    const [ipv4, ipv6] = await Promise.allSettled([
      resolver.resolve4(host),
      resolver.resolve6(host),
    ]);
    const addresses = [
      ...(ipv4.status === "fulfilled" ? ipv4.value.map((address) => ({ family: 4, address })) : []),
      ...(ipv6.status === "fulfilled" ? ipv6.value.map((address) => ({ family: 6, address })) : []),
    ];
    if (addresses.length === 0) throw new Error("No A or AAAA records returned within 5 seconds");
    console.log("DNS:");
    for (const address of addresses) console.log(`  ${address.family === 6 ? "IPv6" : "IPv4"}: ${address.address}`);
  } catch (error) {
    console.error(`\nFAIL: DNS lookup failed: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const params = new URLSearchParams({
    text: city,
    type: "city",
    limit: "1",
    format: "json",
    apiKey,
  });

  const started = performance.now();
  try {
    const response = await fetch(`https://${host}/v1/geocode/search?${params}`, {
      signal: AbortSignal.timeout(15_000),
    });
    const elapsed = Math.round(performance.now() - started);
    console.log(`HTTPS: ${response.status} ${response.statusText} (${elapsed}ms)`);

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      console.error(`\nFAIL: Geoapify returned HTTP ${response.status}.`);
      if (payload?.message) console.error(`Message: ${payload.message}`);
      process.exitCode = 1;
      return;
    }

    const result = payload?.results?.[0];
    if (!result) {
      console.error("\nFAIL: Request succeeded but no city result was returned.");
      process.exitCode = 1;
      return;
    }

    console.log(`Result: ${result.formatted ?? result.city ?? city}`);
    console.log(`Coordinates: ${result.lat}, ${result.lon}`);
    console.log(`Place ID: ${result.place_id}`);
    console.log("\nPASS: DNS, HTTPS, API authentication, and city geocoding all work.");
  } catch (error) {
    const elapsed = Math.round(performance.now() - started);
    console.error(`\nFAIL: HTTPS request failed after ${elapsed}ms.`);
    console.error(`Error: ${error.message}`);
    if (error.cause?.code) console.error(`Cause: ${error.cause.code}`);
    console.error("Try another network, a VPN/TUN connection, or the --eu endpoint.");
    process.exitCode = 1;
  }
}

await main();
