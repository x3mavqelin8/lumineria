const SHOP_STORAGE_KEY = "aikatsu-encore-shops";

let shops = [];
let mode = "favorite"; // favorite | location
let locationCoords = null;
let radiusKm = 10;
let shopMap = null;
let shopMarkers = [];
let locationMarker = null;
let radiusCircle = null;

function loadUserShopData() {
  try {
    return JSON.parse(localStorage.getItem(SHOP_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveUserShopData(data) {
  localStorage.setItem(SHOP_STORAGE_KEY, JSON.stringify(data));
}
function userData(id) {
  return loadUserShopData()[id] || { favorite: false, machineCount: null };
}
function updateUserData(id, patch) {
  const data = loadUserShopData();
  data[id] = {
    favorite: false,
    machineCount: null,
    ...(data[id] || {}),
    ...patch,
  };
  saveUserShopData(data);
}
function esc(s) {
  return String(s ?? "").replace(
    /[&<>\"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

export async function initShop() {
  const res = await fetch(`data/shoplist.json?ts=${Date.now()}`);
  if (!res.ok) throw new Error("shoplist.jsonを読み込めませんでした");
  const data = await res.json();
  shops = data.shops || [];

  const favoriteButton = document.getElementById("shop-favorite-button");
  const locationButton = document.getElementById("shop-location-button");
  const radius = document.getElementById("shop-radius");
  favoriteButton.addEventListener("click", showFavorites);
  locationButton.addEventListener("click", useCurrentLocation);
  radius.addEventListener("change", () => {
    radiusKm = Number(radius.value) || 10;
    if (mode === "location") renderShops();
  });

  initMap();
  renderShops();
}

function initMap() {
  if (!window.L) {
    console.error("Leafletを読み込めませんでした");
    return;
  }
  const el = document.getElementById("shop-map");
  if (!el) return;
  shopMap = L.map(el, { zoomControl: true }).setView(
    [35.681236, 139.767125],
    6,
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(shopMap);
}

function clearMapLayers() {
  if (!shopMap) return;
  shopMarkers.forEach((m) => m.remove());
  shopMarkers = [];
  if (locationMarker) {
    locationMarker.remove();
    locationMarker = null;
  }
  if (radiusCircle) {
    radiusCircle.remove();
    radiusCircle = null;
  }
}

function updateMap(list) {
  if (!shopMap) return;
  clearMapLayers();

  const bounds = [];
  if (mode === "location" && locationCoords) {
    locationMarker = L.circleMarker([locationCoords.lat, locationCoords.lon], {
      radius: 8,
      weight: 3,
      fillOpacity: 0.9,
    })
      .addTo(shopMap)
      .bindPopup("現在地");
    radiusCircle = L.circle([locationCoords.lat, locationCoords.lon], {
      radius: radiusKm * 1000,
      weight: 1,
      fillOpacity: 0.04,
    }).addTo(shopMap);
    bounds.push([locationCoords.lat, locationCoords.lon]);
  }

  list.forEach((s) => {
    const c = getShopCoords(s);
    if (!c) return;
    const marker = L.marker([c.latitude, c.longitude]).addTo(shopMap);
    const u = userData(s.name);
    marker.bindPopup(
      `<strong>${esc(s.name)}</strong><br>${esc(s.prefecture)} ${esc(s.address)}<br>🎮 ${u.machineCount == null ? "未登録" : esc(u.machineCount) + "台"}`,
    );
    shopMarkers.push(marker);
    bounds.push([c.latitude, c.longitude]);
  });

  if (bounds.length === 1) shopMap.setView(bounds[0], 14);
  else if (bounds.length > 1)
    shopMap.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
  else if (mode === "favorite") shopMap.setView([35.681236, 139.767125], 6);
}

function renderShops() {
  const root = document.getElementById("shop-list");
  const status = document.getElementById("shop-status");
  const options = document.getElementById("shop-location-options");
  const favoriteButton = document.getElementById("shop-favorite-button");
  const locationButton = document.getElementById("shop-location-button");
  options.hidden = mode !== "location";
  favoriteButton.classList.toggle("is-active", mode === "favorite");
  locationButton.classList.toggle("is-active", mode === "location");

  let list;
  if (mode === "favorite") {
    list = shops.filter((s) => userData(s.name).favorite);
    status.textContent = list.length
      ? `お気に入り ${list.length}店舗`
      : "お気に入り店舗はまだありません";
  } else {
    list = shops
      .filter((s) => {
        const d = distance(s);
        return Number.isFinite(d) && d <= radiusKm;
      })
      .sort((a, b) => distance(a) - distance(b));
    status.textContent = locationCoords
      ? `現在地から ${radiusKm}km以内・${list.length}店舗`
      : "現在地を取得しています…";
  }

  updateMap(list);
  root.innerHTML = "";
  if (!list.length) {
    root.innerHTML =
      mode === "favorite"
        ? '<div class="shop-empty"><p>🎀 お気に入り店舗がありません</p><p>「📍 現在地から探す」から店舗を探して、お気に入りに登録してね。</p></div>'
        : '<div class="shop-empty"><p>この範囲に店舗がありません</p><p>検索範囲を広げてみてね。</p></div>';
    return;
  }
  list.forEach((s) => root.appendChild(shopCard(s)));
}

function getShopCoords(shop) {
  const lat = Number(shop.latitude),
    lon = Number(shop.longitude);
  if (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= 24 &&
    lat <= 46 &&
    lon >= 123 &&
    lon <= 146
  )
    return { latitude: lat, longitude: lon };
  return null;
}
function distance(s) {
  const c = getShopCoords(s);
  if (!locationCoords || !c) return Infinity;
  const R = 6371,
    toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(c.latitude - locationCoords.lat),
    dLon = toRad(c.longitude - locationCoords.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(locationCoords.lat)) *
      Math.cos(toRad(c.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function shopCard(s) {
  const u = userData(s.name),
    el = document.createElement("article");
  el.className = "shop-card";
  const d = distance(s);
  const distanceText =
    mode === "location" && Number.isFinite(d)
      ? `<span>📍 ${d < 1 ? Math.round(d * 1000) + "m" : d.toFixed(1) + "km"}</span>`
      : "";
  el.innerHTML = `<button class="shop-ribbon ${u.favorite ? "is-favorite" : ""}" aria-label="お気に入り">🎀</button><div class="shop-card-main"><h3>${esc(s.name)}</h3><p>${esc(s.prefecture)} ${esc(s.address)}</p><div class="shop-meta"><span>🎮 ${u.machineCount == null ? "未登録" : esc(u.machineCount) + "台"}</span>${distanceText}</div></div><a class="shop-map" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}" target="_blank" rel="noopener" aria-label="Googleマップで開く">🗺️</a>`;
  el.querySelector(".shop-ribbon").addEventListener("click", (e) => {
    e.stopPropagation();
    updateUserData(s.name, { favorite: !u.favorite });
    renderShops();
  });
  el.querySelector(".shop-card-main").addEventListener("click", () =>
    openShopEditor(s),
  );
  return el;
}
function openShopEditor(s) {
  const u = userData(s.name),
    count = prompt(
      `${s.name}\n台数を入力（空欄で未登録）`,
      u.machineCount == null ? "" : u.machineCount,
    );
  if (count !== null) {
    const value = count.trim(),
      n = value === "" ? null : Math.max(0, Math.floor(Number(value)) || 0);
    updateUserData(s.name, { machineCount: n });
    renderShops();
  }
}
function showFavorites() {
  mode = "favorite";
  renderShops();
}
function useCurrentLocation() {
  mode = "location";
  const radiusSelect = document.getElementById("shop-radius");
  radiusSelect.value = "10";
  radiusKm = 10;
  renderShops();
  const status = document.getElementById("shop-status");
  status.textContent = "現在地を取得しています…";
  if (
    !window.isSecureContext &&
    location.hostname !== "localhost" &&
    location.hostname !== "127.0.0.1"
  ) {
    const m = "現在地取得にはHTTPS、localhost、または127.0.0.1が必要です。";
    status.textContent = m;
    alert(m);
    return;
  }
  if (!navigator.geolocation) {
    const m = "このブラウザでは現在地を取得できません。";
    status.textContent = m;
    alert(m);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locationCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      renderShops();
    },
    (err) => {
      const m =
        err.code === 1
          ? "現在地の利用がブロックされています。ブラウザのサイト設定から位置情報を許可してください。"
          : err.code === 2
            ? "現在地を取得できませんでした。位置情報サービスが有効か確認してください。"
            : "現在地の取得がタイムアウトしました。もう一度お試しください。";
      status.textContent = m;
      alert(m);
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
  );
}
export function refreshShopMap() {
  if (!shopMap) return;
  // お店タブが表示された後にLeafletへ正しい表示領域を再計算させる
  shopMap.invalidateSize({ animate: false });
  // 非表示中に行われたfitBounds/setViewを、表示後の正しいサイズで再適用
  renderShops();
}

export function getShopStorageKey() {
  return SHOP_STORAGE_KEY;
}
