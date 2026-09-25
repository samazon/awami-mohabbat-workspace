# Sample columns (local only)

Dev data for `pnpm columns`. Load it into the local database only; never pass `--remote` with these files.

    pnpm columns columnist add --slug iqbal-khokhar --name "اقبال کھوکھر" --name-en "Iqbal Khokhar" --column "قلم کا فرض" --banner samples/columns/iqbal-khokhar-banner.png
    pnpm columns columnist add --slug samina-rasheed --name "ثمینہ رشید" --column "آئینہ" --banner samples/columns/samina-rasheed-banner.png
    for f in samples/columns/*.md; do [ "$(basename "$f")" = README.md ] || pnpm columns column upsert "$f"; done
