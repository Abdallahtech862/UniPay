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
    const description = p?.description?.slice(0,150) || 'Voir sur UniPay Market';
    const productId = req.params.id;

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titre} - UniPay</title>
<meta property="og:title" content="${titre} - ${prix}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${image}" />
<meta property="og:url" content="https://unipayburkina.com/product/${productId}" />
<style>body{font-family:system-ui;background:#FFFBF0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}.card{background:#fff;border-radius:20px;padding:20px;max-width:400px;width:100%;box-shadow:0 4px 20px rgba(0,0,0,.1);text-align:center}img{width:100%;border-radius:12px;max-height:300px;object-fit:cover}.btn{background:#4A5D23;color:#fff;padding:14px 20px;border-radius:14px;text-decoration:none;display:block;margin-top:16px;font-weight:800}</style>
<script>const appLink="unipay://market/${productId}";setTimeout(()=>{window.location.href=appLink},600);</script>
</head><body><div class="card"><img src="${image}"/><h2>${titre}</h2><p style="font-size:22px;font-weight:900;color:#2E7D32">${prix}</p><p>${description}</p><a href="unipay://market/${productId}" class="btn">Ouvrir dans UniPay</a></div></body></html>`;

    res.set('Content-Type','text/html').send(html);
  } catch(e){ res.status(500).send('Erreur'); }
});

module.exports = router;
