// ==============================
// カード一覧の要素
// ==============================

const cardGrid = document.getElementById("card-grid");
const searchInput = document.getElementById("search");
const rarityFilter = document.getElementById("rarity-filter");
const typeFilter = document.getElementById("type-filter");
const categoryFilter = document.getElementById("category-filter");
const brandFilter = document.getElementById("brand-filter");

const seriesFilter = document.getElementById("series-filter");

const viewToggleBtn = document.getElementById("view-toggle-btn");

let viewMode = "cards";

const totalCount = document.getElementById("total-count");
const ownedCount = document.getElementById("owned-count");
const completionRate = document.getElementById("completion-rate");

// ==============================
// カード一覧の初期化
// ==============================

export function initCardList({ getCards, openCardModal, onOwnedChange }) {
  // 上部の集計を更新する
  function renderSummary() {
    const cards = getCards();
    const selectedSeries = seriesFilter.value;

    // 選択中の弾だけを集計対象にする
    const targetCards = selectedSeries
      ? cards.filter((card) => card.series === selectedSeries)
      : cards;

    const total = targetCards.length;

    // 所持しているカードの合計枚数
    const ownedTotal = targetCards.reduce((sum, card) => {
      return sum + (Number(card.ownedCount) || 0);
    }, 0);

    // 1枚以上所持しているカードの種類数
    const ownedTypes = targetCards.filter((card) => {
      return Number(card.ownedCount) > 0;
    }).length;

    const rate = total === 0 ? 0 : Math.round((ownedTypes / total) * 100);

    totalCount.textContent = `${total}枚`;
    ownedCount.textContent = `${ownedTotal}枚`;
    completionRate.textContent = `${rate}%`;
  }

  // 検索・フィルター後のカード一覧を取得
  function getVisibleCards() {
    const cards = getCards();

    const keyword = searchInput.value.trim().toLowerCase();
    const rarity = rarityFilter.value;
    const type = typeFilter.value;
    const category = categoryFilter.value;
    const brand = brandFilter.value;
    const series = seriesFilter.value;

    return cards.filter((card) => {
      const matchesKeyword =
        String(card.cardNumber || "")
          .toLowerCase()
          .includes(keyword) ||
        String(card.name || "")
          .toLowerCase()
          .includes(keyword);

      const matchesRarity = !rarity || card.rarityCode === rarity;
      const matchesType =
        !type ||
        (card.type || "") === type ||
        ((card.type || "") === "キュート/クール/セクシー/ポップ" &&
          ["キュート", "クール", "セクシー", "ポップ"].includes(type));
      const matchesCategory = !category || (card.category || "") === category;
      const matchesBrand = !brand || (card.brand || "") === brand;
      const matchesSeries = !series || card.series === series;

      return (
        matchesKeyword &&
        matchesRarity &&
        matchesType &&
        matchesCategory &&
        matchesBrand &&
        matchesSeries
      );
    });
  }

  // コーデ単位にカードをまとめる
  function groupCardsByCoordinate(cards) {
    const groups = [];
    const coordinateMap = new Map();

    for (const card of cards) {
      const coordinateName = String(card.coordinateName || "").trim();

      // コーデ名がないカードは1枚だけのグループにする
      if (!coordinateName) {
        groups.push([card]);
        continue;
      }

      if (!coordinateMap.has(coordinateName)) {
        coordinateMap.set(coordinateName, []);
        groups.push(coordinateMap.get(coordinateName));
      }

      coordinateMap.get(coordinateName).push(card);
    }

    return groups;
  }

  // カード1枚分の要素を作成
  function createCardElement(card) {
    const cardElement = document.createElement("article");
    cardElement.className = "card-item";

    // 所持チェック
    const ownedCheck = document.createElement("input");
    ownedCheck.type = "checkbox";
    ownedCheck.className = "owned-check";
    ownedCheck.checked = Number(card.ownedCount) > 0;
    ownedCheck.setAttribute(
      "aria-label",
      `${card.cardNumber || "カード"}を所持済みにする`,
    );

    // カードをクリックすると詳細を開く
    cardElement.addEventListener("click", (event) => {
      if (event.target.closest("input, button, select, textarea, label")) {
        return;
      }

      openCardModal(card, getVisibleCards);
    });

    // カード画像
    const cardNumber = String(card.cardNumber || card.id || "");
    const rarityCode = String(card.rarityCode || "");

    const imageBase =
      rarityCode && !cardNumber.endsWith(`_${rarityCode}`)
        ? `${cardNumber}_${rarityCode}`
        : cardNumber;

    const imageFile = `${imageBase}.webp`;

    const imageFrame = document.createElement("div");
    imageFrame.className = "card-image-frame";

    const image = document.createElement("img");
    image.className = "card-image";
    image.classList.toggle("is-owned", Number(card.ownedCount) > 0);
    image.src = `images/${imageFile}`;
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

    // カード番号
    const number = document.createElement("p");
    number.className = "card-number";
    number.textContent = (card.cardNumber || "番号不明").replace(
      /_[A-Z]+$/,
      "",
    );

    // レアリティ
    const rarityLabel = document.createElement("p");
    rarityLabel.className = "card-rarity";
    rarityLabel.textContent = card.rarityCode || "レアリティ不明";

    // 所持枚数の操作欄
    const ownedControl = document.createElement("div");
    ownedControl.className = "owned-control";

    const decrementButton = document.createElement("button");
    decrementButton.type = "button";
    decrementButton.className = "owned-step-button";
    decrementButton.setAttribute(
      "aria-label",
      `${card.cardNumber || "カード"}の所持枚数を1枚減らす`,
    );
    decrementButton.innerHTML =
      '<img src="icons/heart-left.png" alt="" aria-hidden="true" />';

    const ownedInput = document.createElement("input");
    ownedInput.type = "number";
    ownedInput.min = "0";
    ownedInput.step = "1";
    ownedInput.value = Number(card.ownedCount) || 0;
    ownedInput.setAttribute(
      "aria-label",
      `${card.cardNumber || "カード"}の所持枚数`,
    );

    const incrementButton = document.createElement("button");
    incrementButton.type = "button";
    incrementButton.className = "owned-step-button";
    incrementButton.setAttribute(
      "aria-label",
      `${card.cardNumber || "カード"}の所持枚数を1枚増やす`,
    );
    incrementButton.innerHTML =
      '<img src="icons/heart-right.png" alt="" aria-hidden="true" />';

    function updateOwnedCount(value) {
      const nextValue = Math.max(0, Math.floor(Number(value) || 0));

      card.ownedCount = nextValue;
      ownedInput.value = nextValue;

      // 所持数に合わせてチェック状態と画像表示を更新
      ownedCheck.checked = nextValue > 0;
      image.classList.toggle("is-owned", nextValue > 0);

      onOwnedChange();
    }

    decrementButton.addEventListener("click", () => {
      updateOwnedCount(Number(card.ownedCount) - 1);
    });

    incrementButton.addEventListener("click", () => {
      updateOwnedCount(Number(card.ownedCount) + 1);
    });

    ownedInput.addEventListener("change", () => {
      updateOwnedCount(ownedInput.value);
    });

    // チェックで所持枚数を切り替える
    ownedCheck.addEventListener("change", () => {
      updateOwnedCount(ownedCheck.checked ? 1 : 0);
    });

    ownedControl.append(decrementButton, ownedInput, incrementButton);

    // 求・譲枚数の操作欄
    const tradeControl = document.createElement("div");
    tradeControl.className = "trade-control";

    const wantedLabel = document.createElement("label");
    wantedLabel.className = "trade-count";
    wantedLabel.textContent = "求";

    const wantedInput = document.createElement("input");
    wantedInput.type = "number";
    wantedInput.min = "0";
    wantedInput.step = "1";
    wantedInput.value = "0";
    wantedInput.setAttribute(
      "aria-label",
      `${card.cardNumber || "カード"}の求める枚数`,
    );

    const outLabel = document.createElement("label");
    outLabel.className = "trade-count";
    outLabel.textContent = "譲";

    const outInput = document.createElement("input");
    outInput.type = "number";
    outInput.min = "0";
    outInput.step = "1";
    outInput.value = "0";
    outInput.setAttribute(
      "aria-label",
      `${card.cardNumber || "カード"}の譲る枚数`,
    );

    wantedLabel.appendChild(wantedInput);
    outLabel.appendChild(outInput);

    tradeControl.append(wantedLabel, outLabel);

    const tradeData = JSON.parse(
      localStorage.getItem("aikatsu-encore-trade") || "{}",
    );

    const savedTrade = tradeData[card.id] || {};

    wantedInput.value = Number(savedTrade.wantedCount) || 0;
    outInput.value = Number(savedTrade.outCount) || 0;

    function updateTradeCount() {
      const wantedCount = Math.max(
        0,
        Math.floor(Number(wantedInput.value) || 0),
      );

      const outCount = Math.max(0, Math.floor(Number(outInput.value) || 0));

      wantedInput.value = wantedCount;
      outInput.value = outCount;

      const updatedTradeData = JSON.parse(
        localStorage.getItem("aikatsu-encore-trade") || "{}",
      );

      if (wantedCount === 0 && outCount === 0) {
        delete updatedTradeData[card.id];
      } else {
        updatedTradeData[card.id] = {
          wantedCount,
          outCount,
        };
      }

      localStorage.setItem(
        "aikatsu-encore-trade",
        JSON.stringify(updatedTradeData),
      );
    }

    wantedInput.addEventListener("change", updateTradeCount);
    outInput.addEventListener("change", updateTradeCount);

    // チェック・カード番号・レアリティを横並びにする
    const cardMeta = document.createElement("div");
    cardMeta.className = "card-meta";
    cardMeta.append(ownedCheck, number, rarityLabel);

    // レアリティごとに色分け
    const rarityClass = {
      ER: "rarity-er",
      PR: "rarity-pr",
      R: "rarity-r",
      N: "rarity-n",
    };

    rarityLabel.classList.add(rarityClass[card.rarityCode] || "rarity-n");

    cardElement.append(cardMeta, imageFrame, ownedControl, tradeControl);

    // コーデ表示では所持数操作とレアリティを非表示
    if (viewMode === "coordinate") {
      rarityLabel.style.display = "none";
      ownedControl.style.display = "none";
    }

    return cardElement;
  }

  // カード一覧を表示する
  function renderCards() {
    const filteredCards = getVisibleCards().sort((a, b) => {
      const numA = parseInt(
        String(a.cardNumber || "").match(/\d+/)?.[0] || "0",
        10,
      );
      const numB = parseInt(
        String(b.cardNumber || "").match(/\d+/)?.[0] || "0",
        10,
      );

      return numA - numB;
    });

    cardGrid.innerHTML = "";

    if (filteredCards.length === 0) {
      cardGrid.innerHTML =
        '<p class="empty-message">該当するカードがありません</p>';
      return;
    }

    // カード表示
    if (viewMode === "cards") {
      filteredCards.forEach((card) => {
        cardGrid.appendChild(createCardElement(card));
      });
      return;
    }

    // コーデ表示
    const coordinateGroups = groupCardsByCoordinate(filteredCards);

    coordinateGroups.forEach((group) => {
      const coordinateRow = document.createElement("div");
      coordinateRow.className = "coordinate-row";

      group.forEach((card) => {
        coordinateRow.appendChild(createCardElement(card));
      });

      cardGrid.appendChild(coordinateRow);
    });
  }

  // カード / コーデ表示切り替え
  viewToggleBtn.addEventListener("click", () => {
    if (viewMode === "cards") {
      viewMode = "coordinate";
      viewToggleBtn.textContent = "カード表示";
    } else {
      viewMode = "cards";
      viewToggleBtn.textContent = "コーデ表示";
    }

    renderCards();
  });

  // 検索・フィルター
  searchInput.addEventListener("input", renderCards);
  rarityFilter.addEventListener("change", renderCards);
  typeFilter.addEventListener("change", renderCards);
  categoryFilter.addEventListener("change", renderCards);
  brandFilter.addEventListener("change", renderCards);
  seriesFilter.addEventListener("change", () => {
    renderCards();
    renderSummary();
  });

  return {
    renderCards,
    renderSummary,
    getVisibleCards,
  };
}
