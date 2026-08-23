const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

router.get('/:id', async (req, res) => {
  try {
    const Produit = mongoose.models.Produit || mongoose.model('Produit');
    const p = await Produit.findById(req.params.id).lean();
    
    const titre = p?.titre || 'Article UniPay';
    const prix = p ? `${Number(p.prix).toLocaleString()} FCFA` : '';
    const image = p?.images?.[0] || 'https://unipayburkina.com/icon.png';
    const description = p?.description?.slice(0,150) || 'Voir cet article sur UniPay Market - Paiement sécurisé';
    const productId = req.params.id;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titre} - ${prix} | UniPay</title>

<!-- Open Graph pour WhatsApp / Facebook -->
<meta property="og:title" content="${titre} - ${prix}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${image}" />
<meta property="og:url" content="https://unipayburkina.com/product/${productId}" />
<meta property="og:type" content="product" />
<meta property="og:site_name" content="UniPay Burkina" />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${titre}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${image}" />

<style>
body{font-family:system-ui; background:#FFFBF0; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:20px; text-align:center}
.card{background:#fff; border-radius:20px; padding:20px; max-width:400px; width:100%; box-shadow:0 4px 20px rgba(0,0,0,0.1)}
img{width:100%; border-radius:12px; max-height:300px; object-fit:cover}
.btn{background:#4A5D23; color:#fff; padding:14px 20px; border-radius:14px; text-decoration:none; display:block; margin-top:16px; font-weight:800}
.btn2{background:#F0E6C8; color:#3E2723; padding:12px 20px; border-radius:14px; text-decoration:none; display:block; margin-top:10px; font-weight:700}
</style>

<script>
  // Tente d'ouvrir l'app UniPay
  const appLink = "unipay://market/${productId}";
  const playStore = "https://play.google.com/store/apps/details?id=com.abdallahtech.uniPay";
  
  function openApp(){
    window.location.href = appLink;
    setTimeout(() => {
      // Si l'app n'est pas installée, on reste sur cette page
      // Si tu veux rediriger auto vers Play Store, décommente:
      // window.location.href = playStore;
    }, 1500);
  }
  
  // Auto open après 500ms
  setTimeout(openApp, 500);
</script>
</head>
<body>
  <div class="card">
    <img src="${image}" alt="${titre}" />
    <h2 style="margin:16px 0 6px; color:#3E2723">${titre}</h2>
    <p style="font-size:22px; font-weight:900; color:#2E7D32; margin:0">${prix}</p>
    <p style="color:#8D7A5A; font-size:14px; margin:10px 0">${description}</p>
    <a href="unipay://market/${productId}" class="btn" onclick="openApp()">Ouvrir dans UniPay</a>
    <a href="${'https://unipayburkina.com'}" class="btn2">Voir plus d'articles</a>
    <p style="font-size:11px; color:#aaa; margin-top:16px">Si l'app ne s'ouvre pas, installez UniPay Burkina</p>
  </div>
</body>
</html>`;

    res.set('Content-Type', 'text/html');
    return res.send(html);
    
  } catch(e){
    console.error(e);
    res.status(500).send('Erreur');
  }
});

// Fichiers pour App Links verification
router.get('/.well-known/assetlinks.json', (req, res) => {
  res.json([{
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.abdallahtech.uniPay",
      "sha256_cert_fingerprints": ["A CHANGER - mets ton SHA256 ici"]
    }
  }]);
});

router.get('/.well-known/apple-app-site-association', (req, res) => {
  res.set('Content-Type', 'application/json');
  res.json({
    "applinks": {
      "apps": [],
      "details": [{
        "appID": "TEAMID.com.abdallahtech.uniPay",
        "paths": ["/product/*", "/market/*", "/chat/*"]
      }]
    }
  });
});

module.exports = router;
