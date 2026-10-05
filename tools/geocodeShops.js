import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.resolve(__dirname, "../data/shoplist.json");

// 国土地理院の住所検索APIを、3ワーカー・各0.8秒間隔で安全に処理します。
// 取得済み座標は再利用し、途中停止しても次回は続きから再開できます。
const WORKERS = 3;
const DELAY_MS = 800;
const REQUEST_TIMEOUT_MS = 12000;
const MAX_RETRIES = 2;
const SAVE_EVERY = 10;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function validCoord(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= 24 && latitude <= 46
    && longitude >= 123 && longitude <= 146;
}

function normalizeAddress(address) {
  return String(address ?? "")
    .replace(/[\s　]+/g, "")
    .replace(/[－−ー]/g, "-")
    .trim();
}

async function geocode(address, retry = 0) {
  const url = "https://msearch.gsi.go.jp/address-search/AddressSearch?q=" + encodeURIComponent(address);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "aikatsu-encore-shop-geocoder/2.0"
      }
    });

    if (!res.ok) {
      if (retry < MAX_RETRIES && (res.status === 429 || res.status >= 500)) {
        await sleep(1500 * (retry + 1));
        return geocode(address, retry + 1);
      }
      return null;
    }

    const data = await res.json();
    const feature = Array.isArray(data) ? data[0] : null;
    const coords = feature?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;

    const longitude = Number(coords[0]);
    const latitude = Number(coords[1]);
    if (!validCoord(latitude, longitude)) return null;

    return { latitude, longitude, title: feature?.properties?.title ?? "" };
  } catch (error) {
    if (retry < MAX_RETRIES) {
      await sleep(1500 * (retry + 1));
      return geocode(address, retry + 1);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function save(data) {
  const tempPath = filePath + ".tmp";
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  await fs.rename(tempPath, filePath);
}

const data = JSON.parse(await fs.readFile(filePath, "utf8"));
const shops = data.shops ?? [];

// 同一住所は1回だけ検索。
const addressCache = new Map();
for (const shop of shops) {
  const key = normalizeAddress(shop.address);
  if (!key) continue;
  if (Number.isFinite(shop.latitude) && Number.isFinite(shop.longitude)) {
    addressCache.set(key, {
      latitude: Number(shop.latitude),
      longitude: Number(shop.longitude),
      title: "existing"
    });
  }
}

const pending = [];
for (let i = 0; i < shops.length; i++) {
  const shop = shops[i];
  const key = normalizeAddress(shop.address);
  if (!key || addressCache.has(key)) continue;
  pending.push({ index: i, key, address: shop.address });
}

let cursor = 0;
let completed = 0;
let found = 0;
let failed = 0;
let lastSave = 0;
const started = Date.now();

console.log("========================================");
console.log("アイカツ！アンコール 店舗座標取得");
console.log("========================================");
console.log(`店舗数             : ${shops.length}`);
console.log(`既存/キャッシュ座標 : ${addressCache.size}`);
console.log(`今回検索する住所    : ${pending.length}`);
console.log(`同時処理            : ${WORKERS}件`);
console.log("========================================");

async function worker(workerId) {
  while (true) {
    const task = pending[cursor++];
    if (!task) return;

    // 同じ住所を別ワーカーが先に取得していたらAPIを叩かない。
    if (addressCache.has(task.key)) {
      completed++;
      continue;
    }

    const result = await geocode(task.address);
    if (result) {
      addressCache.set(task.key, result);
      shops[task.index].latitude = result.latitude;
      shops[task.index].longitude = result.longitude;
      found++;
    } else {
      failed++;
    }

    completed++;

    if (completed - lastSave >= SAVE_EVERY) {
      lastSave = completed;
      await save(data);
    }

    const percent = pending.length ? ((completed / pending.length) * 100).toFixed(1) : "100.0";
    const elapsed = (Date.now() - started) / 1000;
    const rate = completed / Math.max(elapsed, 1);
    const eta = rate > 0 ? Math.round((pending.length - completed) / rate) : 0;
    const etaMin = Math.floor(eta / 60);
    const etaSec = eta % 60;

    console.log(`[${percent}%] ${completed}/${pending.length} | 取得 ${found} | 未取得 ${failed} | 残り約 ${etaMin}分${etaSec}秒`);

    await sleep(DELAY_MS);
  }
}

await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i + 1)));

await save(data);

const withCoords = shops.filter(shop => validCoord(Number(shop.latitude), Number(shop.longitude))).length;
const withoutCoords = shops.length - withCoords;

// 異常な「全店舗が同じ座標」などを検出して警告する。
const coordCounts = new Map();
for (const shop of shops) {
  if (!validCoord(Number(shop.latitude), Number(shop.longitude))) continue;
  const key = `${Number(shop.latitude).toFixed(6)},${Number(shop.longitude).toFixed(6)}`;
  coordCounts.set(key, (coordCounts.get(key) ?? 0) + 1);
}
const suspicious = [...coordCounts.entries()].filter(([, count]) => count >= 20).sort((a, b) => b[1] - a[1]);

console.log("========================================");
console.log("ジオコーディング完了！");
console.log("========================================");
console.log(`店舗数             : ${shops.length}`);
console.log(`座標あり           : ${withCoords}`);
console.log(`座標なし           : ${withoutCoords}`);
console.log(`今回取得成功       : ${found}`);
console.log(`今回取得失敗       : ${failed}`);
if (suspicious.length) {
  console.log(`注意：同一座標が20店舗以上の地点 : ${suspicious.length}件`);
  console.log(suspicious.slice(0, 10).map(([coord, count]) => `  ${count}店舗 → ${coord}`).join("\n"));
}
console.log("========================================");
