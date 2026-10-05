// ==============================
// 保存データのキー
// ==============================

export const OWNED_STORAGE_KEY = "aikatsu-encore-owned";
export const DETAIL_STORAGE_KEY = "aikatsu-encore-details";
export const TRADE_STORAGE_KEY = "aikatsu-encore-trade";

// ==============================
// 所持枚数の保存・読み込み
// ==============================

// 所持枚数を保存する
export function saveOwnedCounts(cards) {
  const ownedData = {};

  cards.forEach((card) => {
    ownedData[card.id] = Number(card.ownedCount) || 0;
  });

  localStorage.setItem(OWNED_STORAGE_KEY, JSON.stringify(ownedData));
}

// 所持枚数を読み込む
export function loadOwnedCounts(cards) {
  const savedData = localStorage.getItem(OWNED_STORAGE_KEY);

  if (!savedData) return;

  try {
    const ownedData = JSON.parse(savedData);

    cards.forEach((card) => {
      if (Object.prototype.hasOwnProperty.call(ownedData, card.id)) {
        card.ownedCount = Math.max(
          0,
          Math.floor(Number(ownedData[card.id]) || 0),
        );
      }
    });
  } catch (error) {
    console.error("所持枚数の読み込みに失敗しました", error);
  }
}

// ==============================
// カード詳細の保存・読み込み
// ==============================

// 保存済みの詳細データを取得する
export function loadCardDetails() {
  try {
    return JSON.parse(localStorage.getItem(DETAIL_STORAGE_KEY) || "{}");
  } catch (error) {
    console.error("カード詳細の読み込みに失敗しました", error);
    return {};
  }
}

// カード詳細を保存する
export function saveCardDetails(card, details) {
  const savedDetails = loadCardDetails();

  savedDetails[card.id] = {
    ...(savedDetails[card.id] || {}),
    name: details.name.trim(),
    type: details.type,
    category: details.category,
    brand: details.brand.trim(),
    memo: details.memo.trim(),
  };

  localStorage.setItem(DETAIL_STORAGE_KEY, JSON.stringify(savedDetails));
}

export function saveImportedCardDetails(cardId, details) {
  const savedDetails = loadCardDetails();
  const current = savedDetails[cardId] || {};

  const updated = { ...current };

  Object.entries(details).forEach(([key, value]) => {
    // Excelの空欄では既存データを上書きしない
    if (value === null || value === undefined) return;
    if (typeof value === "string" && value.trim() === "") return;

    updated[key] = value;
  });

  savedDetails[cardId] = updated;

  localStorage.setItem(DETAIL_STORAGE_KEY, JSON.stringify(savedDetails));
}

// ==============================
// トレード情報の保存・読み込み
// ==============================

// トレード情報を取得する
export function loadTradeData() {
  try {
    return JSON.parse(localStorage.getItem(TRADE_STORAGE_KEY) || "{}");
  } catch (error) {
    console.error("トレード情報の読み込みに失敗しました", error);
    return {};
  }
}

// トレード情報を保存する
export function saveTradeData(tradeData) {
  localStorage.setItem(TRADE_STORAGE_KEY, JSON.stringify(tradeData));
}

// カード1枚分のトレード枚数を保存する
export function saveCardTrade(cardId, wantedCount, outCount) {
  const tradeData = loadTradeData();

  const wanted = Math.max(0, Math.floor(Number(wantedCount) || 0));
  const out = Math.max(0, Math.floor(Number(outCount) || 0));

  // 求・譲どちらも0なら登録を削除
  if (wanted === 0 && out === 0) {
    delete tradeData[cardId];
  } else {
    tradeData[cardId] = {
      wantedCount: wanted,
      outCount: out,
    };
  }

  saveTradeData(tradeData);
}
