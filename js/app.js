import {
  OWNED_STORAGE_KEY,
  DETAIL_STORAGE_KEY,
  TRADE_STORAGE_KEY,
  saveOwnedCounts,
  loadOwnedCounts,
  loadCardDetails,
  loadTradeData,
} from "./storage.js";

import { initCardModal } from "./modal.js";
import { initCardList } from "./cards.js";
import { initShop, refreshShopMap, getShopStorageKey } from "./shop.js";

const cardGrid = document.getElementById("card-grid");
const brandFilter = document.getElementById("brand-filter");
const seriesFilter = document.getElementById("series-filter");

// 表示切り替え
const collectionTab = document.getElementById("collection-tab");
const tradeTab = document.getElementById("trade-tab");

const shopTab = document.getElementById("shop-tab");
const shopView = document.getElementById("shop-view");
const settingsTab = document.getElementById("settings-tab");
const settingsView = document.getElementById("settings-view");

const toolbar = document.querySelector(".toolbar");
const tradeView = document.getElementById("trade-view");

// トレード画面
const tradeWantedGrid = document.getElementById("trade-wanted-grid");
const tradeOutGrid = document.getElementById("trade-out-grid");

const filterDetails = document.getElementById("filter-details");
const filterTopRow = document.querySelector(".filter-top-row");

let cards = [];

// カード詳細モーダルを初期化
const { openCardModal, closeCardModal } = initCardModal({
  onSaved: () => {
    loadCards();
  },
});

// カード一覧を初期化
const { renderCards, renderSummary } = initCardList({
  getCards: () => cards,
  openCardModal,
  onOwnedChange: () => {
    saveOwnedCounts(cards);
    renderSummary();
  },
});

// ==============================
// トレード画面
// ==============================

// トレード対象カードを取得
function getTradeCards(status) {
  const tradeData = loadTradeData();

  return cards.filter((card) => {
    const trade = tradeData[card.id];

    if (!trade) return false;

    if (status === "wanted") {
      return Number(trade.wantedCount) > 0;
    }

    if (status === "out") {
      return Number(trade.outCount) > 0;
    }

    return false;
  });
}

// 求・譲それぞれのカードを表示
function renderTradeSection(status, grid) {
  const tradeCards = getTradeCards(status);

  grid.innerHTML = "";

  if (tradeCards.length === 0) {
    const message = document.createElement("p");
    message.className = "empty-message";
    message.textContent =
      status === "wanted"
        ? "欲しいカードはまだ登録されていません ♡"
        : "交換に出せるカードはまだ登録されていません ✧";

    grid.appendChild(message);
    return;
  }

  tradeCards.forEach((card) => {
    const cardElement = document.createElement("article");
    cardElement.className = "card-item";

    // カード番号・レアリティ
    const number = document.createElement("p");
    number.className = "card-number";
    number.textContent = (card.cardNumber || "番号不明").replace(
      /_[A-Z]+$/,
      "",
    );

    const rarity = document.createElement("p");
    rarity.className = "card-rarity";
    rarity.textContent = card.rarityCode || "レアリティ不明";

    // カード一覧と同じレイアウト
    const cardMeta = document.createElement("div");
    cardMeta.className = "card-meta";
    cardMeta.append(number, rarity);

    // レアリティごとに色分け
    const rarityClass = {
      ER: "rarity-er",
      PR: "rarity-pr",
      R: "rarity-r",
      N: "rarity-n",
    };

    rarity.classList.add(rarityClass[card.rarityCode] || "rarity-n");

    // カード画像
    const imageFrame = document.createElement("div");
    imageFrame.className = "card-image-frame";

    const image = document.createElement("img");
    image.className = "card-image";

    const cardNumber = String(card.cardNumber || card.id || "");
    const rarityCode = String(card.rarityCode || "");

    const imageBase =
      rarityCode && !cardNumber.endsWith(`_${rarityCode}`)
        ? `${cardNumber}_${rarityCode}`
        : cardNumber;

    image.src = `images/${imageBase}.webp`;

    image.alt = card.cardNumber || "カード画像";
    image.loading = "lazy";

    // 横向きの画像だけ回転させる
    image.addEventListener("load", () => {
      const isLandscape = image.naturalWidth > image.naturalHeight;

      image.classList.toggle("is-landscape", isLandscape);

      if (isLandscape) {
        imageFrame.style.aspectRatio = `${image.naturalHeight} / ${image.naturalWidth}`;

        image.style.width = `${(image.naturalWidth / image.naturalHeight) * 100}%`;
      }
    });

    imageFrame.appendChild(image);

    // トレード情報を画像右下に表示
    const tradeData = loadTradeData();
    const trade = tradeData[card.id] || {};

    if (status === "out") {
      const outCount = Number(trade.outCount) || 0;

      if (outCount > 0) {
        const countBadge = document.createElement("span");
        countBadge.className = "trade-count-badge";
        countBadge.textContent = String(outCount);

        imageFrame.appendChild(countBadge);
      }
    }

    // カード番号・レアリティを上、画像を下に配置
    cardElement.append(cardMeta, imageFrame);

    cardElement.addEventListener("click", () => {
      openCardModal(card, () => getTradeCards(status));
    });

    grid.appendChild(cardElement);
  });
}

// 求・譲の両方を更新
function renderTradeCards() {
  renderTradeSection("wanted", tradeWantedGrid);
  renderTradeSection("out", tradeOutGrid);

  // 画像が表示されている場合は最新の内容に更新
  const preview = document.getElementById("trade-image-preview");

  if (currentTradeImageType && !preview.hidden) {
    exportTradeImage(currentTradeImageType);
  }
}

// メイン画面の切り替え
function switchView(view) {
  const isCollectionView = view === "collection";
  const isTradeView = view === "trade";
  const isShopView = view === "shop";
  const isSettingsView = view === "settings";

  toolbar.hidden = !isCollectionView;
  filterTopRow.hidden = !isCollectionView;
  cardGrid.hidden = !isCollectionView;
  tradeView.hidden = !isTradeView;
  shopView.hidden = !isShopView;
  settingsView.hidden = !isSettingsView;

  collectionTab.classList.toggle("active", isCollectionView);
  tradeTab.classList.toggle("active", isTradeView);
  shopTab.classList.toggle("active", isShopView);
  settingsTab.classList.toggle("active", isSettingsView);

  collectionTab.querySelector("img").src = isCollectionView
    ? "icons/tab-card-active.png"
    : "icons/tab-card.png";

  tradeTab.querySelector("img").src = isTradeView
    ? "icons/tab-trade-active.png"
    : "icons/tab-trade.png";

  shopTab.querySelector("img").src = isShopView
    ? "icons/tab-shop-active.png"
    : "icons/tab-shop.png";

  settingsTab.querySelector("img").src = isSettingsView
    ? "icons/tab-settings-active.png"
    : "icons/tab-settings.png";

  if (isTradeView) {
    renderTradeCards();
  }

  // お店画面は初期化時にhiddenなので、表示された直後にLeafletのサイズを再計算する
  if (isShopView) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        refreshShopMap();
      });
    });
  }
}

collectionTab.addEventListener("click", () => {
  switchView("collection");
});

tradeTab.addEventListener("click", () => {
  switchView("trade");
});

shopTab.addEventListener("click", () => {
  switchView("shop");
});

settingsTab.addEventListener("click", () => {
  switchView("settings");
});

// どの画面からでもホーム（カード一覧）へ戻る
const topHomeButton = document.getElementById("top-home-button");

topHomeButton.addEventListener("click", () => {
  closeCardModal();
  switchView("collection");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// カードデータを読み込む
async function loadCards() {
  try {
    const response = await fetch(`data/cards.json?v=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("cards.jsonを読み込めませんでした");
    }

    cards = await response.json();

    // 保存済みのカード詳細を反映
    const savedDetails = loadCardDetails();

    cards.forEach((card) => {
      const saved = savedDetails[card.id];

      if (saved) {
        Object.assign(card, saved);
      }
    });

    // 登録されているブランド名から選択肢を作る
    const brands = [
      ...new Set(
        cards
          .map((card) => card.brand)
          .filter((brand) => brand && brand.trim() !== ""),
      ),
    ].sort((a, b) => a.localeCompare(b, "ja"));

    brandFilter.innerHTML = '<option value="">すべてのブランド</option>';

    brands.forEach((brand) => {
      const option = document.createElement("option");
      option.value = brand;
      option.textContent = brand;
      brandFilter.appendChild(option);
    });

    // 登録されている弾数から選択肢を作る
    const seriesList = [
      ...new Set(
        cards
          .map((card) => card.series)
          .filter((series) => series && series.trim() !== ""),
      ),
    ].sort((a, b) => a.localeCompare(b, "ja", { numeric: true }));

    seriesFilter.innerHTML = '<option value="">すべての弾数</option>';

    seriesList.forEach((series) => {
      const option = document.createElement("option");
      option.value = series;
      option.textContent = series;
      seriesFilter.appendChild(option);
    });

    // 最新の通常弾をデフォルトにする
    const numberedSeries = seriesList.filter((series) =>
      /^\d+弾$/.test(series),
    );

    if (numberedSeries.length > 0) {
      const latestSeries = numberedSeries.reduce((latest, current) => {
        const latestNumber = parseInt(latest.match(/\d+/)[0], 10);
        const currentNumber = parseInt(current.match(/\d+/)[0], 10);
        return currentNumber > latestNumber ? current : latest;
      });

      seriesFilter.value = latestSeries;
    }

    // JSONに記録されている所持枚数を初期値にする
    cards.forEach((card) => {
      card.ownedCount = Math.max(0, Math.floor(Number(card.ownedCount) || 0));
    });

    // 保存済みの所持枚数があれば反映
    loadOwnedCounts(cards);

    renderSummary();
    renderCards();
    renderTradeCards();
  } catch (error) {
    console.error(error);

    cardGrid.innerHTML =
      '<p class="empty-message">カードの読み込みに失敗しました。<br>cards.jsonの場所を確認してね。</p>';
  }
}

// ==============================
// トレード画像をPNGで保存
// ==============================

const exportWantedButton = document.getElementById("export-wanted-image");
const exportOutButton = document.getElementById("export-out-image");
const exportTradeButton = document.getElementById("export-trade-image");

let currentTradeImageUrl = null;
let currentTradeImageType = null;

// トレード画像を閉じる
document.getElementById("close-trade-preview").addEventListener("click", () => {
  const preview = document.getElementById("trade-image-preview");
  const previewImage = document.getElementById("trade-preview-image");

  preview.hidden = true;
  previewImage.src = "";

  if (currentTradeImageUrl) {
    URL.revokeObjectURL(currentTradeImageUrl);
    currentTradeImageUrl = null;
  }

  currentTradeImageType = null;
});

// 保存する画像を作成
async function exportTradeImage(type) {
  const imageArea = document.getElementById("trade-image-area");
  const wantedSection = imageArea.querySelector(".trade-wanted-section");
  const outSection = imageArea.querySelector(".trade-out-section");

  const button =
    type === "wanted"
      ? exportWantedButton
      : type === "out"
        ? exportOutButton
        : exportTradeButton;

  const originalText = button.textContent;

  try {
    button.disabled = true;
    button.textContent = "画像を作成中…";

    // 保存対象を決定
    const targets =
      type === "wanted"
        ? [wantedSection]
        : type === "out"
          ? [outSection]
          : [wantedSection, outSection];

    // 保存対象以外を一時的に非表示
    const hiddenSections = [wantedSection, outSection].filter(
      (section) => !targets.includes(section),
    );

    hiddenSections.forEach((section) => {
      section.dataset.exportHidden = section.hidden ? "true" : "false";
      section.hidden = true;
    });

    try {
      // カード画像の読み込みを待つ
      const images = targets.flatMap((section) => [
        ...section.querySelectorAll("img"),
      ]);

      await Promise.all(
        images.map(async (image) => {
          if (image.complete && image.naturalWidth > 0) {
            return;
          }

          try {
            await image.decode();
          } catch (error) {
            console.warn(
              "カード画像の読み込みを確認できませんでした:",
              image.src,
            );
          }
        }),
      );

      // 画像を作成
      const exportArea = imageArea.cloneNode(true);

      exportArea.style.padding = "24px";
      exportArea.style.backgroundColor = "#f3a6ca";

      const wantedSectionClone = exportArea.querySelector(
        ".trade-wanted-section",
      );

      if (wantedSectionClone) {
        wantedSectionClone.style.backgroundColor = "rgba(255, 240, 246, 0.82)";
      }

      const outSectionClone = exportArea.querySelector(".trade-out-section");

      if (outSectionClone) {
        outSectionClone.style.backgroundColor = "rgba(245, 240, 255, 0.82)";
      }

      if (type === "both" && outSectionClone) {
        outSectionClone.style.marginTop = "16px";
      }

      const patternCanvas = document.createElement("canvas");
      patternCanvas.width = 24;
      patternCanvas.height = 24;

      const patternContext = patternCanvas.getContext("2d");

      const isOut = type === "out";
      const isBoth = type === "both";

      // ベース
      patternContext.fillStyle = isBoth
        ? "#fffafd"
        : isOut
          ? "#f0edf9"
          : "#fbeaf1";
      patternContext.fillRect(0, 0, 24, 24);

      // 縦・横のチェック
      patternContext.fillStyle = isBoth
        ? "#f6dce8"
        : isOut
          ? "#dcd7ef"
          : "#f3cddd";
      patternContext.fillRect(0, 0, 12, 24);
      patternContext.fillRect(0, 0, 24, 12);

      // 交差部分
      patternContext.fillStyle = isBoth
        ? "#efc9da"
        : isOut
          ? "#c9c2e2"
          : "#eab5cd";
      patternContext.fillRect(0, 0, 12, 12);

      exportArea.style.backgroundImage = `url(${patternCanvas.toDataURL("image/png")})`;
      exportArea.style.backgroundSize = "24px 24px";

      exportArea.style.position = "absolute";
      exportArea.style.left = "-99999px";
      exportArea.style.top = "0";
      exportArea.style.width = `${imageArea.offsetWidth}px`;

      document.body.appendChild(exportArea);

      const canvas = await window.html2canvas(exportArea, {
        backgroundColor: "#f3a6ca",
        scale: 2,
        useCORS: true,
        logging: true,
      });

      exportArea.remove();

      // PNGデータを作成
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });

      if (!blob) {
        throw new Error(
          `PNG画像を作成できませんでした（${canvas.width} × ${canvas.height}px）`,
        );
      }

      // 画像を画面に表示
      if (currentTradeImageUrl) {
        URL.revokeObjectURL(currentTradeImageUrl);
      }

      currentTradeImageUrl = URL.createObjectURL(blob);

      const preview = document.getElementById("trade-image-preview");
      const previewImage = document.getElementById("trade-preview-image");

      previewImage.src = currentTradeImageUrl;
      preview.hidden = false;
      currentTradeImageType = type;
    } finally {
      // 非表示にしたセクションを元に戻す
      hiddenSections.forEach((section) => {
        section.hidden = section.dataset.exportHidden === "true";
        delete section.dataset.exportHidden;
      });
    }
  } catch (error) {
    alert(
      `画像の保存に失敗しました。\n\n原因：${error.name}\n${error.message}`,
    );
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

// ボタンごとの保存処理
exportWantedButton.addEventListener("click", () => {
  exportTradeImage("wanted");
});

exportOutButton.addEventListener("click", () => {
  exportTradeImage("out");
});

exportTradeButton.addEventListener("click", () => {
  exportTradeImage("both");
});

// お店データを読み込む
initShop().catch((error) =>
  console.error("お店データの読み込みに失敗しました:", error),
);

// カードデータを読み込む
loadCards();

const backupButton = document.getElementById("backup-button");

backupButton.addEventListener("click", () => {
  const backup = {
    app: "aikatsu-encore",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      [OWNED_STORAGE_KEY]: localStorage.getItem(OWNED_STORAGE_KEY),
      [DETAIL_STORAGE_KEY]: localStorage.getItem(DETAIL_STORAGE_KEY),
      [TRADE_STORAGE_KEY]: localStorage.getItem(TRADE_STORAGE_KEY),
      [getShopStorageKey()]: localStorage.getItem(getShopStorageKey()),
    },
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `aikatsu-encore-backup-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
});

const restoreFile = document.getElementById("restore-file");
const restoreButton = document.getElementById("restore-button");

restoreButton.addEventListener("click", async () => {
  const file = restoreFile.files[0];

  if (!file) {
    alert("バックアップファイルを選択してください。");
    return;
  }

  try {
    const text = await file.text();
    const backup = JSON.parse(text);

    if (
      backup.app !== "aikatsu-encore" ||
      !backup.data ||
      typeof backup.data !== "object"
    ) {
      alert("このアプリのバックアップファイルではありません。");
      return;
    }

    const keys = [
      OWNED_STORAGE_KEY,
      DETAIL_STORAGE_KEY,
      TRADE_STORAGE_KEY,
      getShopStorageKey(),
    ];

    for (const key of keys) {
      const value = backup.data[key];

      if (value !== null && typeof value !== "string" && value !== undefined) {
        alert("バックアップファイルの形式が正しくありません。");
        return;
      }
    }

    const confirmed = confirm(
      "現在の所持枚数・カード詳細・トレード設定を、バックアップの内容で上書きします。よろしいですか？",
    );

    if (!confirmed) return;

    for (const key of keys) {
      const value = backup.data[key];

      if (value === null || value === undefined) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    }

    await loadCards();

    restoreFile.value = "";
    alert("データを復元しました！");
  } catch (error) {
    console.error("データの復元に失敗しました:", error);
    alert("復元に失敗しました。バックアップファイルを確認してください。");
  }
});

const resetButton = document.getElementById("reset-button");

resetButton.addEventListener("click", async () => {
  const confirmed = confirm(
    "所持枚数・カード詳細・トレード設定をすべて削除します。\nこの操作は取り消せません。本当に初期化しますか？",
  );

  if (!confirmed) return;

  localStorage.removeItem(OWNED_STORAGE_KEY);
  localStorage.removeItem(DETAIL_STORAGE_KEY);
  localStorage.removeItem(TRADE_STORAGE_KEY);
  localStorage.removeItem(getShopStorageKey());

  await loadCards();

  alert("データを初期化しました！");
});
