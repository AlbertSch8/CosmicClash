## 5. Měření kvality a výkonu (Google Lighthouse)

Aplikace byla po finální optimalizaci a kompilaci do produkčního prostředí (pomocí příkazu `npm run build`) otestována nezávislým auditním nástrojem **Google Lighthouse**. Měření proběhlo v anonymním okně prohlížeče bez rušivých vlivů rozšíření.

**Finální výsledky auditu:**
* **Performance (Výkon): 98 / 100**
  * *Odůvodnění:* Téměř maximálního skóre bylo dosaženo díky plošné optimalizaci assetů (zmenšení rozlišení a konverze všech `.png` obrázků do moderního formátu `.webp`). Kód je navíc plně minifikován pomocí bundleru Vite, čímž se drasticky snížila velikost stahovaných dat.
* **Accessibility (Přístupnost): 92 / 100**
  * *Odůvodnění:* Aplikace používá sémantické HTML, UI prvky mají dostatečný barevný kontrast a veškeré generované i statické obrázky obsahují správně definované atributy `alt` pro čtečky obrazovek (prázdné pro dekorační prvky, popisné pro důležité).
* **Best Practices: 96 / 100**
  * *Odůvodnění:* Projekt neobsahuje žádná zastaralá webová API, bezpečně pracuje s externími požadavky na Firebase a je plně připraven na HTTPS nasazení.
* **SEO: 92 / 100**
  * *Odůvodnění:* Stránky obsahují správně strukturovanou hlavičku, včetně validního tagu `<title>` a `<meta name="description">`, což zajišťuje bezproblémové čtení obsahu vyhledávači.