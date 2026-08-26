const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

router.get('/:id', async (req, res) => {
  try {
    const Produit = mongoose.models.Produit || mongoose.model('Produit');
    const p = await Produit.findById(req.params.id).lean();
    if (!p) return res.status(404).send('Produit introuvable');

    // 1. Image absolue pour WhatsApp (pas de base64)
    let image = p.images?.[0] || '';
    // Si c'est du base64, on ne peut pas l'afficher sur WhatsApp -> fallback icon
    if (image.startsWith('data:')) {
      image = 'unipay-production-d2a0.up.railway.app/icon.png';
    }
    // Assure https:// (WhatsApp refuse http)
    if (image &&!image.startsWith('https://')) {
      image = image.replace('http://', 'https://');
    }
    const fallbackImage = 'unipay-production-d2a0.up.railway.app/icon.png';
    const finalImage = image || fallbackImage;

    const titre = `${p.titre} - ${Number(p.prix).toLocaleString()} FCFA | UniPay Market`;
    const prix = `${Number(p.prix).toLocaleString()} FCFA`;
    const description = (p.description || '').slice(0, 160) + ` - Vendu par ${p.vendeurNom} à ${p.ville}. Paiement sécurisé avec UniPay Wallet.`;
    const productId = req.params.id;
    const pageUrl = `unipay-production-d2a0.up.railway.app/product/${productId}`;
    const appLink = `unipay://market/${productId}`;
    const playStoreLink = 'https://play.google.com/store/apps/details?id=com.abdallahtech.uniPay&pcampaignid=web_share';

    // 2. Ne pas rediriger si c'est le crawler WhatsApp / Facebook
    const ua = req.headers['user-agent'] || '';
    const isBot = /WhatsApp|facebookexternalhit|Twitterbot|LinkedInBot/i.test(ua);

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${p.titre} - UniPay Market Burkina</title>

<!-- OPEN GRAPH POUR WHATSAPP - DOIT ETRE TOUT EN HAUT -->
<meta property="og:type" content="product" />
<meta property="og:site_name" content="UniPay Burkina" />
<meta property="og:title" content="${p.titre} - ${prix}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${finalImage}" />
<meta property="og:image:secure_url" content="${finalImage}" />
<meta property="og:image:type" content="image/jpeg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="${pageUrl}" />
<meta property="og:locale" content="fr_BF" />
<meta property="product:price:amount" content="${p.prix}" />
<meta property="product:price:currency" content="XOF" />

<!-- Twitter / Telegram aussi -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${p.titre} - ${prix}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${finalImage}" />

<style>
body{font-family:system-ui,-apple-system;background:#FFFBF0;margin:0;padding:0;color:#3E2723}
.container{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border-radius:24px;padding:24px;max-width:420px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.12);text-align:center;border:1px solid #F0E6C8}
.card img{width:100%;border-radius:16px;max-height:340px;object-fit:cover;background:#f5f5f5}
.price{font-size:26px;font-weight:900;color:#2E7D32;margin:12px 0 4px}
.badge{display:inline-block;background:#EAF4E2;color:#2E7D32;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:800;margin-bottom:10px}
.btn-primary{background:#4A5D23;color:#fff;padding:16px 20px;border-radius:14px;text-decoration:none;display:block;font-weight:900;margin-top:16px}
.btn-secondary{background:#fff;color:#4A5D23;border:2px solid #4A5D23;padding:14px 20px;border-radius:14px;text-decoration:none;display:block;font-weight:800;margin-top:10px}
.small{font-size:12px;color:#8D7A5A;margin-top:14px;line-height:1.4}
</style>
${!isBot? `<script>
  // Redirection seulement pour les vrais humains, pas pour WhatsApp
  setTimeout(()=>{ window.location.href="${appLink}"; }, 800);
  // Fallback Play Store si app non installée
  setTimeout(()=>{ window.location.href="${playStoreLink}"; }, 2500);
</script>` : ''}
</head>
<body>
<div class="container">
  <div class="card">
    <div class="badge">🛒 UniPay Market • Paiement Wallet Sécurisé</div>
    <img src="${finalImage}" alt="${p.titre}" />
    <h1 style="font-size:20px;margin:14px 0 4px;line-height:1.2">${p.titre}</h1>
    <div class="price">${prix}</div>
    <p style="color:#8D7A5A;font-size:13px;margin:0">Vendu par ${p.vendeurNom} • ${p.ville}</p>
    <p style="font-size:14px;margin:14px 0 0;line-height:1.5;text-align:left;background:#FFFBF0;padding:12px;border-radius:12px">${p.description || 'Article disponible sur UniPay Market Burkina.'}</p>

    <a href="${appLink}" class="btn-primary">Ouvrir dans l'app UniPay</a>
    <a href="${playStoreLink}" class="btn-secondary">📲 Télécharger UniPay (Gratuit)</a>

    <p class="small">
      UniPay est le porte-monnaie mobile et marketplace 100% Burkinabè.<br>
      Payez en toute sécurité avec votre wallet, sans frais cachés.<br><br>
      <b>unipayburkina.com</b> • +226 70 87 94 25
    </p>
  </div>
</div>
</body>
</html>`;

    res.set('Content-Type', 'text/html; charset=utf-8');
    // Cache 1h pour WhatsApp
    res.set('Cache-Control', 'public, max-age=3600');
    return res.send(html);
  } catch(e){
    console.log(e);
    res.status(500).send('Erreur UniPay');
  }
});

module.exports = router;
