import { loadTradeData, saveCardTrade } from "./storage.js";

// ==============================
// モーダルの要素
// ==============================

const cardModal = document.getElementById("card-modal");
const modalClose = document.getElementById("modal-close");
const cardDetailForm = document.getElementById("card-detail-form");

const modalCardNumber = document.getElementById("modal-card-number");
const modalCardRarity = document.getElementById("modal-card-rarity");
const modalCardImageButton = document.getElementById("modal-card-image-button");
const modalCardImage = document.getElementById("modal-card-image");
const modalCardImageHint = document.querySelector(".modal-card-image-hint");

const modalPrevCard = document.getElementById("modal-prev-card");
const modalNextCard = document.getElementById("modal-next-card");

const detailSeries = document.getElementById("detail-series");
const detailAp = document.getElementById("detail-ap");

const detailName = document.getElementById("detail-name");
const detailType = document.getElementById("detail-type");
const detailCategory = document.getElementById("detail-category");
const detailBrand = document.getElementById("detail-brand");

const detailAcquisition = document.getElementById("detail-acquisition");
const detailAcquisitionText = document.getElementById(
  "detail-acquisition-text",
);

let editingCard = null;
let showingBack = false;

// 現在表示しているカード一覧
let currentCardList = [];
let currentCardIndex = -1;
let getVisibleCardsFn = null;

// ==============================
// ローカル画像のパスを取得
// ==============================

function getLocalImagePath(imageUrl) {
  const imageFile = String(imageUrl || "")
    .split("/")
    .pop();

  if (!imageFile) {
    return "";
  }

  return `images/${imageFile}`;
}

// ==============================
// 前後ボタンの状態を更新
// ==============================

function updateNavigationButtons() {
  modalPrevCard.disabled = currentCardIndex <= 0;
  modalNextCard.disabled =
    currentCardIndex < 0 || currentCardIndex >= currentCardList.length - 1;
}

// ==============================
// カード情報を表示
// ==============================

function renderCard(card, preserveFace = false) {
  editingCard = card;

  // カード番号とレアリティから画像パスを作成
  const cardNumber = String(card.cardNumber || card.id || "");
  const rarityCode = String(card.rarityCode || "");

  // カード番号とレアリティを表示
  modalCardNumber.textContent = cardNumber.replace(/★$/, "");
  modalCardRarity.textContent = `${rarityCode}${card.isParallel ? "★" : ""}`;
  modalCardRarity.className = "modal-card-rarity";

  if (rarityCode) {
    modalCardRarity.classList.add(`rarity-${rarityCode.toLowerCase()}`);
  }

  const cleanCardNumber = cardNumber.replace(/★$/, "");
  let imageBase =
    rarityCode && !cleanCardNumber.endsWith(`_${rarityCode}`)
      ? `${cleanCardNumber}_${rarityCode}`
      : cleanCardNumber;

  if (card.isParallel) {
    imageBase += "_p1";
  }

  const frontImagePath = `images/${imageBase}.webp`;
  const backImagePath = `images/${imageBase}_b.webp`;

  // 裏面表示を維持する
  if (!preserveFace) {
    showingBack = false;
  }

  // 表面・裏面の画像を表示
  if (showingBack) {
    modalCardImage.src = backImagePath;
    modalCardImage.alt = "カード裏面";
  } else {
    modalCardImage.src = frontImagePath;
    modalCardImage.alt = "カード表面";
  }

  // 裏面画像への切り替え
  // 画像ファイルがあるカードは裏面に切り替え可能
  const hasBackImage = Boolean(imageBase);

  modalCardImageButton.disabled = !hasBackImage;

  modalCardImageButton.setAttribute(
    "aria-label",
    showingBack ? "カードの表面を見る" : "カードの裏面を見る",
  );

  modalCardImageHint.hidden = !hasBackImage;

  // 詳細情報
  detailSeries.textContent = card.series || "未設定";

  detailAp.textContent =
    card.ap !== undefined && card.ap !== null && card.ap !== ""
      ? card.ap.toLocaleString("ja-JP")
      : "未設定";

  detailName.textContent = card.name || "未設定";
  detailType.textContent = card.type || "未設定";
  detailCategory.textContent = card.category || "未設定";
  detailBrand.textContent = card.brand || "未設定";

  // プロモーションカードの入手方法
  const acquisition = String(card.acquisition || "").trim();

  detailAcquisition.hidden = card.cardType !== "promo" || !acquisition;

  detailAcquisitionText.textContent = acquisition;
}

// ==============================
// モーダルの初期化
// ==============================

export function initCardModal({ onSaved }) {
  // カード詳細を開く
  function openCardModal(card, getVisibleCards) {
    // 現在の絞り込み結果を取得
    getVisibleCardsFn =
      typeof getVisibleCards === "function" ? getVisibleCards : null;

    currentCardList = getVisibleCardsFn ? getVisibleCardsFn() : [card];

    // 表示するカードの位置を取得
    currentCardIndex = currentCardList.findIndex((item) => item.id === card.id);

    // 一覧に見つからない場合の保険
    if (currentCardIndex === -1) {
      currentCardList = [card];
      currentCardIndex = 0;
    }

    // 新しく開いたときは表面から
    showingBack = false;

    renderCard(card);

    cardModal.hidden = false;
  }

  // 前後移動
  function moveCard(direction) {
    if (!editingCard) return;

    // 最新の絞り込み結果を取得
    if (getVisibleCardsFn) {
      currentCardList = getVisibleCardsFn();

      currentCardIndex = currentCardList.findIndex(
        (item) => item.id === editingCard.id,
      );
    }

    const nextIndex = currentCardIndex + direction;

    // 一覧の範囲外には移動しない
    if (nextIndex < 0 || nextIndex >= currentCardList.length) {
      updateNavigationButtons();
      return;
    }

    const nextCard = currentCardList[nextIndex];

    // 現在の表面・裏面の状態を維持して切り替え
    currentCardIndex = nextIndex;
    renderCard(nextCard, true);
  }

  // 前のカード
  modalPrevCard.addEventListener("click", () => {
    moveCard(-1);
  });

  // 次のカード
  modalNextCard.addEventListener("click", () => {
    moveCard(1);
  });

  // モーダルを閉じる
  function closeCardModal() {
    cardModal.hidden = true;
    editingCard = null;
    currentCardList = [];
    currentCardIndex = -1;
    getVisibleCardsFn = null;
    showingBack = false;
  }

  // 表面・裏面の切り替え
  modalCardImageButton.addEventListener("click", () => {
    if (!editingCard) {
      return;
    }

    showingBack = !showingBack;

    const cardNumber = String(editingCard.cardNumber || editingCard.id || "").replace(/★$/, "");
    const rarityCode = String(editingCard.rarityCode || "");

    let imageBase =
      rarityCode && !cardNumber.endsWith(`_${rarityCode}`)
        ? `${cardNumber}_${rarityCode}`
        : cardNumber;

    // パラレルは公式画像の _p1 / _p1_b 命名を使用
    if (editingCard.isParallel) {
      imageBase += "_p1";
    }

    const imagePath = showingBack
      ? `images/${imageBase}_b.webp`
      : `images/${imageBase}.webp`;

    console.log("切り替え先:", imagePath);

    modalCardImage.src = imagePath;
    modalCardImage.alt = showingBack ? "カード裏面" : "カード表面";

    modalCardImageButton.setAttribute(
      "aria-label",
      showingBack ? "カードの表面を見る" : "カードの裏面を見る",
    );
  });

  // 閉じるボタン
  modalClose.addEventListener("click", closeCardModal);

  // モーダルの外側をクリック
  cardModal.addEventListener("click", (event) => {
    if (event.target === cardModal) {
      closeCardModal();
    }
  });

  // Escapeキー
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !cardModal.hidden) {
      closeCardModal();
    }
  });

  // 詳細を保存
  cardDetailForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!editingCard) return;

    // 念のため最後に保存
    autoSaveCard();

    closeCardModal();

    if (typeof onSaved === "function") {
      onSaved();
    }
  });

  // app.js から使う関数を返す
  return {
    openCardModal,
    closeCardModal,
  };
}
