import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.join(__dirname, "..");
const cardsPath = path.join(root, "data", "cards.json");
const outputDir = path.join(root, "images");

const baseUrl = "https://dcd.aikatsu.com/encore/images/cardlist/card/";

async function downloadImage(url, outputPath) {
  if (fs.existsSync(outputPath)) {
    return "skip";
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);

  return "downloaded";
}

async function main() {
  const cards = JSON.parse(fs.readFileSync(cardsPath, "utf8"));

  fs.mkdirSync(outputDir, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const card of cards) {
    // カード番号とレアリティコードから画像ファイル名を作る
    const cardNumber = String(card.cardNumber || card.id || "").replace(/★$/, "");
    const rarityCode = card.rarityCode || "";

    let imageBase = cardNumber.endsWith(`_${rarityCode}`)
      ? cardNumber
      : `${cardNumber}_${rarityCode}`;

    // パラレルは公式画像の _p1 / _p1_b 命名を使用
    if (card.isParallel) {
      imageBase += "_p1";
    }

    for (const fileSuffix of ["", "_b"]) {
      const fileName = `${imageBase}${fileSuffix}.webp`;
      const outputPath = path.join(outputDir, fileName);
      const url = `${baseUrl}${fileName}`;

      try {
        const result = await downloadImage(url, outputPath);

        if (result === "downloaded") {
          downloaded++;
        } else {
          skipped++;
        }
      } catch (error) {
        failed++;
        console.error(`${fileName}: ${error.message}`);
      }
    }
  }

  console.log("\n画像ダウンロード完了！");
  console.log(`新規ダウンロード：${downloaded}枚`);
  console.log(`既存ファイル：${skipped}枚`);
  console.log(`失敗：${failed}枚`);
}

main();
