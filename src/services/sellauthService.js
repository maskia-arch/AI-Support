/**
 * sellauthService.js v1.1.4
 *
 * Fix: Produktlinks verwenden nur {shopUrl}/{product.path}
 * Sellauth hat KEIN ?variant=ID URL-Parameter.
 * Varianten werden auf der Produktseite ausgewählt.
 */

const axios   = require('axios');
const supabase = require('../config/supabase');
const deepseekService = require('./deepseekService');
const logger  = require('../utils/logger');

const SELLAUTH_API = 'https://api.sellauth.com/v1';

const sellauthService = {

  _client(apiKey) {
    return axios.create({
      baseURL: SELLAUTH_API,
      timeout: 20000,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  },

  async getShopInfo(apiKey, shopId) {
    const { data } = await this._client(apiKey).get(`/shops/${shopId}`);
    return data;
  },

  async getAllProducts(apiKey, shopId) {
    const client = this._client(apiKey);
    const all = [];
    let page = 1, lastPage = 1;
    // 1. Alle Produkte listen
    do {
      const { data } = await client.get(`/shops/${shopId}/products`, {
        params: { page, perPage: 100, orderColumn: 'name', orderDirection: 'asc' }
      });
      all.push(...(data.data || []));
      lastPage = data.last_page || 1;
      page++;
    } while (page <= lastPage);

    // 2. Für Variant-Produkte: Einzel-Abruf für vollständige Varianten-Preise
    // Die List-API gibt manchmal unvollständige Varianten zurück
    const enriched = [];
    for (const product of all) {
      if (product.type === 'variant' && product.id) {
        try {
          const { data: full } = await client.get(`/shops/${shopId}/products/${product.id}`);
          // Varianten aus Einzel-Abruf sind vollständiger (inkl. Preise, Stock)
          if (full && full.variants && full.variants.length > 0) {
            enriched.push({ ...product, variants: full.variants }); // Einzel-Abruf ist autoritativ
          } else {
            enriched.push(product);
          }    await new Promise(r => setTimeout(r, 100)); // Rate-Limit-Schutz
        } catch {
          enriched.push(product); // Fallback auf List-Daten
        }
      } else {
        enriched.push(product);
      }
    }
    return enriched;
  },

  async getCategories(apiKey, shopId) {
    try {
      const { data } = await this._client(apiKey).get(`/shops/${shopId}/categories`, { params: { perPage: 100 } });
      return data.data || [];
    } catch { return []; }
  },

  // FIX: /product/ Prefix — Sellauth URL-Format: {shopUrl}/product/{path}
  buildProductUrl(shopUrl, productPath) {
    return `${shopUrl.replace(/\/$/, '')}/product/${productPath}`;
  },

  // Format für Variante: Link führt immer zur Produktseite
  // Parst "50.00GB / 180 Days" → { gb: "50", days: "180" }
  _parseVariantName(name) {
    const m = (name || '').match(/([\d.]+)\s*GB.*?(\d+)\s*(?:Day|Tag)/i);
    return m ? { gb: parseFloat(m[1]).toString(), days: m[2] } : null;
  },

  formatVariantKnowledge(product, variant, productUrl, categoryName) {
    const rawPrice = variant.price ? parseFloat(variant.price) : null;
    const price    = rawPrice ? `${rawPrice.toFixed(2)} ${product.currency || 'EUR'}` : null;
    const stock    = variant.stock;
    const isUnlimited  = stock === null || stock === -1;
    const stockDisplay = isUnlimited ? 'Unbegrenzt vorrätig' : stock > 0 ? `${stock} auf Lager` : 'Ausverkauft';

    // Deutsche Synonyme ableiten für besseres RAG-Matching
    const parsed   = this._parseVariantName(variant.name);
    const gbPart   = parsed ? `${parsed.gb} GB`               : '';
    const daysPart = parsed ? `${parsed.days} Tage`            : '';
    const germanName = parsed ? `${parsed.gb}GB ${parsed.days} Tage` : '';

    const lines = [
      `Produkt: ${product.name}`,
      `Variante: ${variant.name}`,
      germanName ? `Auch bekannt als: ${germanName}` : '',
      gbPart     ? `Datenvolumen: ${gbPart}`          : '',
      daysPart   ? `Laufzeit: ${daysPart}`             : '',
      price      ? `Preis: ${price}`                  : 'Preis: Bitte Produktseite besuchen',
      price      ? `Kosten: ${price}`                 : '',
      `Verfügbarkeit: ${stockDisplay}`,
      `Kauflink: ${productUrl}`,
      categoryName ? `Kategorie: ${categoryName}`     : '',
    ];

    if (product.description) {
      const clean = product.description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (clean.length > 10) lines.push(`Info: ${clean.substring(0, 300)}`);
    }

    lines.push('');
    if (parsed) {
      lines.push(`Suchanfrage "${product.name} ${parsed.gb}GB" → Kauflink: ${productUrl}`);
      lines.push(`Kunden fragen nach "${parsed.gb} gb ${parsed.days} tage"`);
    } else {
      lines.push(`Suchanfrage "${variant.name}" → Kauflink: ${productUrl}`);
    }
    if (price) {
      lines.push(`Kaufempfehlung: ${variant.name} für genau ${price}. Kauflink: ${productUrl}`);
      lines.push(`PREIS-FAKT (nicht verändern): ${product.name} – ${variant.name} = ${price}`);
    }

    return lines.filter(Boolean).join('\n');
  },

  // Format für Produkte ohne Varianten
  formatSingleProductKnowledge(product, productUrl, categoryName) {
    const price = product.price ? `${product.price} ${product.currency || 'EUR'}` : null;
    const lines = [
      `Produkt: ${product.name}`,
      price ? `Preis: ${price}` : '',
      `Kauflink: ${productUrl}`,
      categoryName ? `Kategorie: ${categoryName}` : '',
    ];
    if (product.description) {
      const clean = product.description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (clean.length > 10) lines.push(`Info: ${clean.substring(0, 500)}`);
    }
    lines.push('');
    lines.push(`Wenn ein Kunde dieses Produkt sucht: Link → ${productUrl}`);
    return lines.filter(Boolean).join('\n');
  },

  // Übersichts-Eintrag für Variant-Produkt (alle Optionen auf einen Blick)
  formatOverviewKnowledge(product, productUrl, categoryName) {
    const variantLines = (product.variants || []).map(v => {
      const price = v.price ? `${v.price} ${product.currency || 'EUR'}` : '?';
      const stockNote = (v.stock === 0) ? ' (ausverkauft)' : (v.stock === null || v.stock === -1) ? ' (unbegrenzt)' : '';
      return `  • ${v.name}: ${price}${stockNote}`;
    }).join('\n');

    return [
      `Produkt-Übersicht: ${product.name}`,
      categoryName ? `Kategorie: ${categoryName}` : '',
      `Kauflink (alle Optionen auf dieser Seite): ${productUrl}`,
      '',
      `Verfügbare Optionen:`,
      variantLines,
      '',
      `Kunden können auf der Seite ${productUrl} die gewünschte Option auswählen und direkt kaufen.`
    ].filter(Boolean).join('\n');
  },


  // ── KI-gestützte Anreicherung mit OpenAI ────────────────────────────────
  // Erstellt mehrsprachige, kategoriespezifische Wissensdatenbank-Einträge
  async _enrichWithAI(product, variants, productUrl, catName) {
    const { openai } = require('../config/env');
    const axios      = require('axios');

    if (!openai?.apiKey) return null; // OpenAI nicht konfiguriert

    const variantSummary = variants.map(v => {
      const rawP = v.price ? parseFloat(v.price) : null;
      const p    = rawP ? `€${rawP.toFixed(2)}` : '?';
      return `  - ${v.name}: ${p}`;
    }).join('\n');

    const prompt = `Du bist ein Wissensbank-Assistent für einen eSIM-Shop. 
Erstelle aus diesen Produktdaten STRUKTURIERTE Wissenseinträge auf Deutsch UND Englisch.

Produkt: ${product.name}
Kategorie: ${catName || 'eSIM'}
Kauflink: ${productUrl}
Varianten mit Preisen:
${variantSummary}

Erstelle genau DREI Einträge als JSON-Array:
1. "de_faq" – häufige deutsche Kundenfragen + Antworten mit genauen Preisen
2. "en_faq" – same in English with exact prices  
3. "price_list" – strukturierte Preisliste auf Deutsch, alle Varianten

Gib NUR das JSON zurück, kein Markdown. Format:
[{"type":"de_faq","content":"..."},{"type":"en_faq","content":"..."},{"type":"price_list","content":"..."}]`;

    try {
      const resp = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model:       'gpt-4o-mini',
          max_tokens:  1200,
          temperature: 0.1,
          messages: [
            { role: 'system', content: 'Du erstellst präzise, faktentreue Produktbeschreibungen für eine KI-Wissensdatenbank. Erfinde NIEMALS Preise - verwende nur die exakten Zahlen aus dem Input.' },
            { role: 'user',   content: prompt }
          ]
        },
        { headers: { 'Authorization': `Bearer ${openai.apiKey}`, 'Content-Type': 'application/json' }, timeout: 30000 }
      );
      const raw  = resp.data.choices[0].message.content.trim();
      const clean = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch (e) {
      logger.warn(`[Sellauth] AI-Enrichment fehlgeschlagen (${product.name}): ${e.message}`);
      return null;
    }
  },

  async syncToKnowledgeBase(apiKey, shopId, shopUrl, jobId) {
    const syncJobManager    = require('./syncJobManager');
    const knowledgeEnricher = require('./knowledgeEnricher');

    const progress = (pct, step) => {
      if (jobId) syncJobManager.updateProgress(jobId, pct, step);
      logger.info(`[Sellauth] ${pct}% – ${step}`);
    };

    const results = { saved: 0, skipped: 0, errors: 0 };

    // 1. Kategorien sicherstellen bevor GPT läuft
    progress(2, 'Kategorien vorbereiten...');
    await knowledgeEnricher.ensureEsimCategories();

    // 2. Produkte laden
    progress(5, 'Lade Produkte...');
    const products = await this.getAllProducts(apiKey, shopId);
    progress(10, `${products.length} Produkte geladen`);

    // 3. Filter: versteckte und Duplikate raus
    const SKIP_PATTERNS = /bestseller|bundle|combo|upsell/i;
    const seenPaths = new Set(), seenNormNames = new Set();
    const filtered = products.filter(p => {
      if (p.visibility === 'hidden') return false;
      if (SKIP_PATTERNS.test(p.name) || SKIP_PATTERNS.test(p.path || '')) return false;
      if (p.path && seenPaths.has(p.path)) return false;
      if (p.path) seenPaths.add(p.path);
      const normName = (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seenNormNames.has(normName)) return false;
      seenNormNames.add(normName);
      return true;
    });
    progress(14, `${filtered.length} Produkte nach Filterung`);

    // 4. Alle alten Sellauth-Einträge löschen
    progress(16, 'Alte Einträge löschen...');
    try { await supabase.from('knowledge_base').delete().eq('source_type', 'sellauth_sync'); } catch (_) {}
    try { await supabase.from('knowledge_base').delete().eq('source', 'sellauth_sync'); } catch (_) {}

    // 5. Jede Variante als eigenständiges Produkt in die KB
    // Zähle Gesamtanzahl Varianten für Fortschrittsbalken
    const totalVariants = filtered.reduce((sum, p) => sum + Math.max((p.variants || []).length, 1), 0);
    let variantsDone = 0;

    for (const product of filtered) {
      const productUrl  = shopUrl ? this.buildProductUrl(shopUrl, product.path) : '';
      const variants    = product.variants || [];
      const tariffType  = knowledgeEnricher._detectTariffType(product.name);

      // Produkt-Beschreibung (gemeinsam für alle Varianten)
      const baseDesc = product.description
        ? product.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300)
        : '';

      if (variants.length === 0) {
        // Kein Variant-System → Produkt direkt speichern
        const pct = Math.round(16 + ((variantsDone / totalVariants) * 78));
        progress(pct, `${product.name} (kein Variant)`);
        variantsDone++;

        const content = this._buildVariantText(product.name, null, product.price, product.currency, productUrl, baseDesc, tariffType);
        try {
          const saved = await knowledgeEnricher.enrichAndStore(content, 'sellauth_sync', null, { product_id: product.id });
          results.saved += saved.length;
          if (!saved.length) results.skipped++;
        } catch (e) { results.errors++; logger.warn(`[Sellauth] ${product.name}: ${e.message}`); }
        await new Promise(r => setTimeout(r, 250));

      } else {
        // Jede Variante = eigener KB-Eintrag
        for (const variant of variants) {
          const pct = Math.round(16 + ((variantsDone / totalVariants) * 78));
          progress(pct, `${product.name} – ${variant.name || '?'}`);
          variantsDone++;

          const content = this._buildVariantText(
            product.name,
            variant.name,
            variant.price || product.price,
            variant.currency || product.currency,
            productUrl,
            baseDesc,
            tariffType
          );

          try {
            const saved = await knowledgeEnricher.enrichAndStore(content, 'sellauth_sync', null, {
              product_id: product.id,
              variant_id: variant.id,
              product_url: productUrl,
            });
            results.saved += saved.length;
            if (!saved.length) results.skipped++;
          } catch (e) {
            results.errors++;
            logger.warn(`[Sellauth] ${product.name} / ${variant.name}: ${e.message}`);
          }

          // Rate-Limit: 300ms zwischen Varianten (OpenAI + Supabase)
          await new Promise(r => setTimeout(r, 300));
        }
      }
    }

    progress(100, `Fertig: ${results.saved} Einträge gespeichert, ${results.errors} Fehler`);
    logger.info(`[Sellauth] Sync: ${results.saved} gespeichert, ${results.skipped} übersprungen, ${results.errors} Fehler`);
    return results;
  },

  /**
   * Baut den Beratungstext für eine einzelne Variante.
   * Enthält alle Infos die die Support-KI für eine präzise Empfehlung braucht.
   */
  _buildVariantText(productName, variantName, price, currency, productUrl, baseDesc, tariffType) {
    const cur = currency || 'EUR';

    // Tariftyp-Erklärung direkt im KB-Eintrag
    const tariffNote = {
      pro:    'Unlimited Pro: Highspeed-Volumen inklusive, danach Drosselung auf 1 Mbit/s',
      eco:    'Unlimited Eco: Highspeed-Volumen inklusive, danach Drosselung auf 512 kb/s',
      travel: 'Travel eSIM: Datenvolumen-begrenzt, kein Internet nach Verbrauch (jederzeit aufladbar)',
    }[tariffType] || '';

    let text = `Produkt: ${productName}`;
    if (variantName) text += ` – ${variantName}`;
    text += '\n';
    if (tariffNote) text += `Tariftyp: ${tariffNote}\n`;
    if (price) text += `Preis: ${price} ${cur}\n`;
    if (baseDesc) text += `Info: ${baseDesc}\n`;
    if (productUrl) text += `Kauflink: ${productUrl}\n`;

    return text.trim();
  },

  // Wissensdatenbank-Kategorien aus Sellauth-Kategorien ableiten
  async _ensureKbCategories(sellauthCategories) {
    const map = {};

    // Alle existierenden KB-Kategorien laden (User-Kategorien bewahren!)
    try {
      const { data: allCats } = await supabase.from('knowledge_categories').select('id, name');
      for (const cat of (allCats || [])) {
        map['_' + cat.name.toLowerCase()] = cat.id;
      }
    } catch (_) {}

    // Standard-Kategorien anlegen falls noch nicht vorhanden
    const needed = [
      { name: 'Produkte', icon: '🛒' },
      { name: 'Tarife',   icon: '📶' },
      { name: 'Preise',   icon: '💰' },
      { name: 'FAQ',      icon: '❓' },
      { name: 'Support',  icon: '🛠️' },
    ];
    for (const def of needed) {
      const key = '_' + def.name.toLowerCase();
      if (map[key]) continue; // Bereits vorhanden → nicht überschreiben
      try {
        const { data: created } = await supabase.from('knowledge_categories')
          .insert([{ name: def.name, icon: def.icon, color: '#3b82f6' }])
          .select('id').single();
        if (created) map[key] = created.id;
      } catch (_) {}
    }

    // Fallback-Alias
    map['_products'] = map['_tarife'] || map['_produkte'] || null;

    // Sellauth-Kategorien → KB-Kategorien mappen
    for (const cat of (sellauthCategories || [])) {
      const lname = (cat.name || '').toLowerCase();
      if (/tarif|esim|data|sim|travel|unlimited/.test(lname)) {
        map[cat.id] = map['_tarife'] || map['_products'];
      } else if (/preis|price|kosten|cost/.test(lname)) {
        map[cat.id] = map['_preise'] || map['_tarife'];
      } else if (/faq|info|hilfe|help|anleitung/.test(lname)) {
        map[cat.id] = map['_faq'];
      } else if (/support|kontakt|service/.test(lname)) {
        map[cat.id] = map['_support'];
      } else {
        map[cat.id] = map['_produkte'] || map['_products'];
      }
    }
    return map;
  },

  async getInvoice(apiKey, shopId, invoiceId) {
    try {
      const { data } = await this._client(apiKey).get(
        `/shops/${shopId}/invoices/${encodeURIComponent(invoiceId)}`
      );
      return data;
    } catch (err) {
      // Fallback: wenn unique_id übergeben, aber numeric ID auch versuchen
      if (invoiceId.includes('-') && err.response?.status !== 404) {
        const numericId = invoiceId.split('-').pop().replace(/^0+/, '') || '0';
        const { data } = await this._client(apiKey).get(
          `/shops/${shopId}/invoices/${numericId}`
        );
        return data;
      }
      throw err;
    }
  },

  // Formatiert Invoice-Daten für Kunden (keine sensiblen Felder)
  formatInvoiceForCustomer(invoice, shopUrl) {
    // Checkout-URL: {shopUrl}/checkout/{unique_id}
    const checkoutUrl = invoice.unique_id
      ? `${(shopUrl || '').replace(/\/$/, '')}/checkout/${invoice.unique_id}`
      : null;

    // Status auf Deutsch
    const statusMap = {
      completed:  { text: 'Abgeschlossen', emoji: '✅' },
      pending:    { text: 'Ausstehend / Offen', emoji: '⏳' },
      refunded:   { text: 'Erstattet', emoji: '↩️' },
      cancelled:  { text: 'Storniert', emoji: '❌' },
      processing: { text: 'Wird verarbeitet', emoji: '🔄' }
    };
    const status = statusMap[invoice.status] || { text: invoice.status, emoji: '❓' };

    // Produkte aus items
    const products = (invoice.items || []).map(item => {
      const pName = item.product?.name || 'Produkt';
      const vName = item.variant?.name  || null;
      return vName ? `${pName} – ${vName}` : pName;
    });

    const lines = [
      `Bestellnummer: ${invoice.id}`,
      `Status: ${status.emoji} ${status.text}`,
      '',
      products.length
        ? `Produkt: ${products.join(', ')}`
        : '',
      invoice.price
        ? `Betrag: ${invoice.price} ${invoice.currency || 'EUR'}`
        : '',
      invoice.gateway
        ? `Zahlungsart: ${invoice.gateway}`
        : '',
      invoice.completed_at
        ? `Abgeschlossen am: ${new Date(invoice.completed_at).toLocaleString('de-DE')}`
        : '',
    ].filter(Boolean);

    // Checkout-Link IMMER anzeigen (auch bei completed – dort ist die eSIM abrufbar)
    if (checkoutUrl) {
      lines.push('');
      if (invoice.status === 'completed') {
        lines.push('Deine eSIM und Bestelldetails findest du hier:');
      } else if (invoice.status === 'pending') {
        lines.push('Zahlung noch offen. Bezahle und erhalte deine eSIM hier:');
      } else {
        lines.push('Bestellseite:');
      }
      lines.push(checkoutUrl);
    }

    return lines.join('\n');
  },

  async testConnection(apiKey, shopId) {
    try {
      const shop = await this.getShopInfo(apiKey, shopId);
      return { ok: true, shopName: shop.name || shop.slug || shopId };
    } catch (err) {
      return { ok: false, error: err.response?.data?.message || err.message };
    }
  }
};

module.exports = sellauthService;
