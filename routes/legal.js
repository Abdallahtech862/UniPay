const express = require('express');
const router = express.Router();

const baseStyle = `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #1a1a1a; color: #fff; padding: 20px; line-height: 1.6;
    }
    .container { max-width: 600px; margin: 0 auto; }
    h1 { font-size: 24px; margin-bottom: 8px; color: #E8D19A; }
    h2 { font-size: 18px; margin: 24px 0 12px; color: #E8D19A; }
    p, li { font-size: 15px; color: #ccc; margin-bottom: 12px; }
    ul { padding-left: 20px; }
    .tarif-card { 
      background: #2a2a2a; border-radius: 12px; padding: 16px; 
      margin-bottom: 12px; border: 1px solid #444;
    }
    .tarif-title { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
    .tarif-price { font-size: 14px; color: #E8D19A; }
    .update { font-size: 13px; color: #888; margin-bottom: 20px; }
  </style>
`;

router.get('/privacy', (req, res) => {
  res.send(`
    <!DOCTYPE html><html><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Politique de confidentialité</title>${baseStyle}</head>
    <body>
      <div class="container">
        <h1>Politique de confidentialité</h1>
        <p class="update">Dernière mise à jour : 2 juillet 2026</p>
        
        <h2>1. Données collectées</h2>
        <p>UniPay collecte : nom, prénom, téléphone, solde, historique transactions, données biométriques pour authentification.</p>
        
        <h2>2. Utilisation</h2>
        <p>Vos données servent uniquement à : exécuter transactions, sécurité anti-fraude, support client.</p>
        
        <h2>3. Partage</h2>
        <p>Jamais vendues. Partagées uniquement avec opérateurs Mobile Money pour exécuter paiements, ou autorités si légalement requis.</p>
        
        <h2>4. Sécurité</h2>
        <p>Chiffrement AES-256, serveurs sécurisés Burkina Faso. Empreinte stockée localement uniquement.</p>
        
        <h2>5. Vos droits</h2>
        <p>Accès, rectification, suppression : abdallah.unipay@gmail.com</p>
      </div>
    </body></html>
  `);
});

router.get('/terms', (req, res) => {
  res.send(`
    <!DOCTYPE html><html><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Conditions d'utilisation</title>${baseStyle}</head>
    <body>
      <div class="container">
        <h1>Conditions d'utilisation</h1>
        <p class="update">Dernière mise à jour : 2 juillet 2026</p>
        
        <h2>1. Acceptation</h2>
        <p>En utilisant UniPay, vous acceptez ces conditions. Âge minimum : 18 ans.</p>
        
        <h2>2. Compte</h2>
        <p>Un compte par personne. Informations exactes obligatoires. Vous êtes responsable de votre code PIN.</p>
        
        <h2>3. Transactions</h2>
        <p>UniPay exécute ordres instantanément. Irréversibles sauf fraude prouvée. Plafond : 2 000 000 FCFA/jour.</p>
        
        <h2>4. Frais</h2>
        <p>Voir section "Nos tarifs". Frais prélevés automatiquement.</p>
        
        <h2>5. Suspension</h2>
        <p>UniPay peut suspendre compte pour fraude, blanchiment, ou violation conditions.</p>
        
        <h2>6. Responsabilité</h2>
        <p>UniPay n'est pas responsable des pannes opérateurs Mobile Money.</p>
      </div>
    </body></html>
  `);
});

router.get('/pricing', (req, res) => {
  res.send(`
    <!DOCTYPE html><html><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nos tarifs</title>${baseStyle}</head>
    <body>
      <div class="container">
        <h1>Nos tarifs</h1>
        <p class="update">Transparents, sans surprise</p>
        
        <div class="tarif-card">
          <div class="tarif-title">Transfert UniPay → UniPay</div>
          <div class="tarif-price">Gratuit</div>
        </div>

        <div class="tarif-card">
          <div class="tarif-title">Retrait Mobile Money</div>
          <div class="tarif-price">1% du montant (min 100 FCFA)</div>
        </div>

        <div class="tarif-card">
          <div class="tarif-title">Recharge wallet</div>
          <div class="tarif-price">Orange/Moov : 1% | Wave : Gratuit</div>
        </div>

        <div class="tarif-card">
          <div class="tarif-title">Paiement QR</div>
          <div class="tarif-price">Gratuit pour l'acheteur</div>
        </div>

        <div class="tarif-card">
          <div class="tarif-title">Plafond journalier</div>
          <div class="tarif-price">2 000 000 FCFA</div>
        </div>

        <p style="margin-top:24px;font-size:13px;color:#888;">
          Tarifs susceptibles d'évolution. Notification 30j avant changement.
        </p>
      </div>
    </body></html>
  `);
});

module.exports = router;
