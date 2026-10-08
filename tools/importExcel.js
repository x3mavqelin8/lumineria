import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const excelPath = path.join(__dirname, "../data/carddata.xlsx");
const jsonPath = path.join(__dirname, "../data/cards.json");

const rarityMap = {
  アンコールレア: "ER",
  プレミアムレア: "PR",
  レア: "R",
  ノーマル: "N",
};

function text(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function normalizeCardNumber(value) {
  return text(value).replace(/★$/, "").replace(/_[A-Z]+$/, "");
}

function isParallelCardNumber(value) {
  return text(value).endsWith("★");
}

function isBlank(value) {
  return value === undefined || value === null || text(value) === "";
}

function getCardType(series) {
  return series === "プロモーションカード" ? "promo" : "normal";
}

// ファイル確認
if (!fs.existsSync(excelPath)) {
  throw new Error(`Excelファイルが見つかりません: ${excelPath}`);
}

// JSON読み込み
const cards = fs.existsSync(jsonPath)
  ? JSON.parse(fs.readFileSync(jsonPath, "utf8"))
  : [];

if (!Array.isArray(cards)) {
  throw new Error("cards.jsonの形式が配列ではありません。");
}

// Excel読み込み
const workbook = XLSX.readFile(excelPath);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];

const rows = XLSX.utils.sheet_to_json(worksheet, {
  defval: "",
});

if (rows.length === 0) {
  throw new Error("Excelにデータがありません。");
}

const requiredHeaders = [
  "弾数",
  "カード番号",
  "カード名",
  "レアリティ",
  "AP",
  "タイプ",
  "カテゴリ",
  "ブランド",
  "入手方法",
];

const headers = Object.keys(rows[0]);
const missingHeaders = requiredHeaders.filter(
  (header) => !headers.includes(header),
);

if (missingHeaders.length > 0) {
  throw new Error(`Excelに必要な列がありません: ${missingHeaders.join(", ")}`);
}

// カード番号ごとに既存カードをまとめる
const cardsByNumber = new Map();

function registerCard(card) {
  const number = normalizeCardNumber(card.cardNumber || card.id);

  if (!cardsByNumber.has(number)) {
    cardsByNumber.set(number, []);
  }

  cardsByNumber.get(number).push(card);
}

for (const card of cards) {
  registerCard(card);
}

let updatedCount = 0;
let addedCount = 0;
let skippedCount = 0;

const skippedRows = [];

for (const row of rows) {
  const number = normalizeCardNumber(row["カード番号"]);
  const cardNumber = text(row["カード番号"]);
  const excelRarity = text(row["レアリティ"]);
  const rarityCode = rarityMap[excelRarity];

  if (!number || !cardNumber) {
    skippedCount++;
    skippedRows.push("カード番号が空欄");
    continue;
  }

  const candidates = cardsByNumber.get(number) || [];
  const isParallel = isParallelCardNumber(cardNumber);

  let target;

  // 通常／パラレルをカード番号の★で明確に判定
  target = candidates.find((card) => Boolean(card.isParallel) === isParallel);

  if (!target && candidates.length > 1) {
    target = candidates.find((card) => {
      return (
        (rarityCode && card.rarityCode === rarityCode) ||
        (excelRarity && card.rarity === excelRarity)
      );
    });
  }

  // 既存カードが見つからなければ新規登録
  if (!target) {
    if (candidates.length > 0) {
      skippedCount++;
      skippedRows.push(
        `${cardNumber}: 既存カードをレアリティで特定できないためスキップ`,
      );
      continue;
    }

    const series = text(row["弾数"]);

    target = {
      id: cardNumber,
      cardNumber,
      cardType: getCardType(series),
      isParallel,
      rarityCode: rarityCode || "",
      rarity: excelRarity,
      name: text(row["カード名"]),
      coordinateName: text(row["コーデ名"]),
      type: text(row["タイプ"]),
      category: text(row["カテゴリ"]),
      brand: text(row["ブランド"]),
      acquisition: text(row["入手方法"]),
      ownedCount: 0,
      wanted: false,
      memo: "",
      series,
      ap: isBlank(row["AP"]) ? null : Number(row["AP"]),
    };

    if (target.ap !== null && !Number.isFinite(target.ap)) {
      target.ap = null;
    }

    cards.push(target);
    registerCard(target);
    addedCount++;
    continue;
  }

  // 既存カードは、Excelの空欄で上書きしない
  let changed = false;

  const fields = [
    ["series", "弾数"],
    ["name", "カード名"],
    ["coordinateName", "コーデ名"],
    ["rarity", "レアリティ"],
    ["type", "タイプ"],
    ["category", "カテゴリ"],
    ["brand", "ブランド"],
    ["acquisition", "入手方法"],
  ];

  for (const [jsonKey, excelKey] of fields) {
    const value = text(row[excelKey]);

    if (!isBlank(value) && target[jsonKey] !== value) {
      target[jsonKey] = value;
      changed = true;
    }
  }

  if (!isBlank(row["AP"])) {
    const ap = Number(row["AP"]);

    if (Number.isFinite(ap) && target.ap !== ap) {
      target.ap = ap;
      changed = true;
    }
  }

  if (rarityCode && target.rarityCode !== rarityCode) {
    target.rarityCode = rarityCode;
    changed = true;
  }

  if (changed) {
    updatedCount++;
  }
}

// 変更がある場合、またはJSONが存在しない場合に保存
const shouldSave =
  updatedCount > 0 || addedCount > 0 || !fs.existsSync(jsonPath);

if (shouldSave) {
  // 既存JSONがある場合だけバックアップ
  if (fs.existsSync(jsonPath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    const backupPath = `${jsonPath}.${timestamp}.bak`;

    fs.copyFileSync(jsonPath, backupPath);
    console.log(`バックアップ: ${backupPath}`);
  }

  fs.writeFileSync(jsonPath, JSON.stringify(cards, null, 2) + "\n", "utf8");

  console.log(`更新したカード: ${updatedCount}件`);
  console.log(`新規追加したカード: ${addedCount}件`);
} else {
  console.log("更新・追加対象はありませんでした。");
}

console.log(`スキップ: ${skippedCount}件`);
console.log(`カード総数: ${cards.length}枚`);

if (skippedRows.length > 0) {
  console.log("\n--- スキップ理由 ---");

  for (const message of skippedRows) {
    console.log(message);
  }
}
