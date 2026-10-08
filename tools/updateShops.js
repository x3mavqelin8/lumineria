import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { PDFParse } from "pdf-parse";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const pdfPath = path.join(rootDir, "data", "shoplist.pdf");
const jsonPath = path.join(rootDir, "data", "shoplist.json");

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const WORKERS = 3;
const DELAY_MS = 800;
const REQUEST_TIMEOUT_MS = 12000;
const MAX_RETRIES = 2;
const SAVE_EVERY = 10;

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .replace(/[‐‑‒–—―−ー－]/g, "-")
    .trim();
}

function normalizeAddress(address) {
  return normalizeText(address);
}

function shopKey(shop) {
  return `${normalizeText(shop.name)}|${normalizeAddress(shop.address)}`;
}

function validCoord(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= 24 && latitude <= 46
    && longitude >= 123 && longitude <= 146;
}

function parseSourceDate(text) {
  const match = text.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!match) return null;
  return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
}

function parseShopLine(line) {
  const normalized = line.replace(/\u00a0/g, " ").trim();
  if (!normalized) return null;

  const phoneMatch = normalized.match(/\s(\d{2,4}(?:-\d{1,6}){1,2})$/);
  if (!phoneMatch) return null;

  const withoutPhone = normalized.slice(0, phoneMatch.index).trim();
  const prefectureMatch = withoutPhone.match(
    new RegExp(`^(.+?)\\s(${PREFECTURES.join("|")})\\s(.+)$`)
  );
  if (!prefectureMatch) return null;

  const [, name, prefecture, address] = prefectureMatch;

  if (!name || !address) return null;

  return {
    name,
    prefecture,
    address,
    phone: phoneMatch[1]
  };
}

function parsePdfText(text) {
  const lines = String(text)
    .replace(/\r/g, "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  const shops = [];
  const seen = new Set();

  for (const line of lines) {
    const shop = parseShopLine(line);
    if (!shop) continue;

    const key = shopKey(shop);
    if (seen.has(key)) continue;
    seen.add(key);
    shops.push(shop);
  }

  return shops;
}

async function readPdf() {
  const buffer = await fs.readFile(pdfPath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function geocode(address, retry = 0) {
  const url = "https://msearch.gsi.go.jp/address-search/AddressSearch?q=" + encodeURIComponent(address);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "aikatsu-encore-shop-geocoder/3.0" }
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

    return { latitude, longitude };
  } catch {
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
  const tempPath = jsonPath + ".tmp";
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  await fs.rename(tempPath, jsonPath);
}

async function updateCoordinates(data) {
  const shops = data.shops ?? [];
  const addressCache = new Map();

  for (const shop of shops) {
    const key = normalizeAddress(shop.address);
    if (!key) continue;
    if (validCoord(Number(shop.latitude), Number(shop.longitude))) {
      addressCache.set(key, {
        latitude: Number(shop.latitude),
        longitude: Number(shop.longitude)
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

  console.log(`店舗数             : ${shops.length}`);
  console.log(`既存/キャッシュ座標 : ${addressCache.size}`);
  console.log(`今回検索する住所    : ${pending.length}`);

  async function worker() {
    while (true) {
      const task = pending[cursor++];
      if (!task) return;

      if (addressCache.has(task.key)) {
        const cached = addressCache.get(task.key);
        shops[task.index].latitude = cached.latitude;
        shops[task.index].longitude = cached.longitude;
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
      console.log(`[${percent}%] ${completed}/${pending.length} | 取得 ${found} | 未取得 ${failed}`);
      await sleep(DELAY_MS);
    }
  }

  await Promise.all(Array.from({ length: WORKERS }, () => worker()));
  await save(data);

  return { found, failed };
}

export { parsePdfText, parseShopLine, normalizeText, shopKey };

async function main() {
const pdfText = await readPdf();
const parsedShops = parsePdfText(pdfText);

if (parsedShops.length === 0) {
  throw new Error("PDFから店舗データを1件も読み取れませんでした。PDFの形式が変わっていないか確認してください。");
}

const existingData = JSON.parse(await fs.readFile(jsonPath, "utf8"));
const existingShops = existingData.shops ?? [];
const existingByKey = new Map(existingShops.map(shop => [shopKey(shop), shop]));
const existingByNamePhone = new Map(
  existingShops.map(shop => [
    `${normalizeText(shop.name)}|${normalizeText(shop.phone)}`,
    shop
  ])
);
const matchedExisting = new Set();

const shops = parsedShops.map(shop => {
  const exactKey = shopKey(shop);
  const namePhoneKey = `${normalizeText(shop.name)}|${normalizeText(shop.phone)}`;
  const existing = existingByKey.get(exactKey) ?? existingByNamePhone.get(namePhoneKey);

  if (existing) matchedExisting.add(existing);

  return {
    ...shop,
    ...(existing && validCoord(Number(existing.latitude), Number(existing.longitude))
      ? {
          latitude: Number(existing.latitude),
          longitude: Number(existing.longitude)
        }
      : {})
  };
});

const added = shops.filter(shop => {
  const exactKey = shopKey(shop);
  const namePhoneKey = `${normalizeText(shop.name)}|${normalizeText(shop.phone)}`;
  return !existingByKey.has(exactKey) && !existingByNamePhone.has(namePhoneKey);
}).length;
const removed = existingShops.filter(shop => !matchedExisting.has(shop)).length;
const preservedCoords = shops.filter(shop => validCoord(Number(shop.latitude), Number(shop.longitude))).length;
const asOf = parseSourceDate(pdfText) ?? new Date().toISOString().slice(0, 10);

const data = {
  source: {
    title: "アイカツ！アンコール 取扱店舗一覧",
    asOf,
    note: "公式PDF掲載内容を店舗データ化。既存店舗の緯度・経度は引き継ぎ、新規・未取得店舗は自動取得します。"
  },
  shops
};

await save(data);

console.log("========================================");
console.log("アイカツ！アンコール 店舗データ更新");
console.log("========================================");
console.log(`PDFから取得         : ${parsedShops.length}店舗`);
console.log(`JSONへ追加           : ${added}店舗`);
console.log(`JSONから削除         : ${removed}店舗`);
console.log(`既存座標を引き継ぎ   : ${preservedCoords}店舗`);
console.log("----------------------------------------");
console.log("続けて未取得の座標を自動取得します。");
console.log("========================================");

const result = await updateCoordinates(data);
const withCoords = data.shops.filter(shop => validCoord(Number(shop.latitude), Number(shop.longitude))).length;
const withoutCoords = data.shops.length - withCoords;

console.log("========================================");
console.log("店舗データ更新完了！");
console.log("========================================");
console.log(`店舗数             : ${data.shops.length}`);
console.log(`座標あり           : ${withCoords}`);
console.log(`座標なし           : ${withoutCoords}`);
console.log(`今回取得成功       : ${result.found}`);
console.log(`今回取得失敗       : ${result.failed}`);
console.log("========================================");

}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  await main();
}
