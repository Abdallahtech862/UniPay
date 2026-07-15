const express = require('express');
const router = express.Router();

const baseStyle = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght=400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Poppins', sans-serif;
      background: #FDF8EF; 
      color: #6B4423; 
      padding: 20px; 
      line-height: 1.6;
    }
    .container { max-width: 600px; margin: 0 auto; }
    h1 { font-size: 28px; margin-bottom: 8px; color: #6B4423; font-weight: 700; }
    h2 { font-size: 20px; margin: 32px 0 12px; color: #6B4423; font-weight: 600; }
    p, li { font-size: 15px; color: #9C7E5C; margin-bottom: 12px; }
    ul { padding-left: 20px; }
    .tarif-card { 
      background: #FFFFFF; 
      border-radius: 12px; 
      padding: 16px; 
      margin-bottom: 12px; 
      border: 1px solid #E8D19A;
    }
    .tarif-title { font-size: 16px; font-weight: 600; margin-bottom: 4px; color: #6B4423; }
    .tarif-price { font-size: 14px; color: #6B4423; font-weight: 500; }
    .update { font-size: 13px; color: #9C7E5C; margin-bottom: 24px; }
    .disclaimer { 
      background: #DDE5D9; 
      padding: 16px; 
      border-radius: 12px; 
      margin-top: 32px;
      font-size: 14px;
      color: #6B4423;
    }
    a { color: #6B4423; text-decoration: underline; }
  </style>
`;

router.get('/privacy', (req, res) => {
  res.send(`
    <!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Politique de confidentialité - UniPay</title>${baseStyle}</head>
    <body>
      <div class="container">
        <h1>Politique de confidentialité</h1>
        <p class="update">Dernière mise à jour : 10 juillet 2026</p>
        
        <h2>1. Données collectées</h2>
        <p>UniPay collecte les données nécessaires au fonctionnement du service : nom, prénom, numéro de téléphone, CNIB, historique des transactions initiées, données techniques de l’appareil.</p>
        <p>Les données biométriques (empreinte/FaceID) sont utilisées uniquement pour l’authentification locale et ne sont jamais transmises à nos serveurs.</p>
        
        <h2>2. Utilisation des données</h2>
        <p>Vos données sont utilisées exclusivement pour :</p>
        <ul>
          <li>Initier et suivre vos opérations de paiement via prestataires agréés</li>
          <li>Sécuriser l’accès à votre compte et prévenir la fraude</li>
          <li>Respecter nos obligations légales KYC/LCB-FT</li>
          <li>Vous fournir un support client</li>
        </ul>
        
        <h2>3. Partage des données</h2>
        <p>Vos données ne sont jamais vendues. Elles peuvent être transmises uniquement :</p>
        <ul>
          <li>Aux opérateurs Mobile Money (Orange, Moov, Wave) pour exécuter vos recharges/retraits</li>
          <li>Aux autorités compétentes sur demande légale</li>
        </ul>
        
        <h2>4. Sécurité et conservation</h2>
        <p>Chiffrement AES-256. Données stockées sur serveurs sécurisés. Conservation : 10 ans après clôture du compte conformément à la réglementation.</p>
        
        <h2>5. Vos droits</h2>
        <p>Droit d’accès, rectification, suppression : contactez abdallah.unipay@gmail.com</p>

        <div class="disclaimer">
          <strong>Avertissement :</strong> UniPay est un outil technique d’interface. Nous ne sommes pas une banque ni un établissement de monnaie électronique. Nous ne détenons pas vos fonds.
        </div>
      </div>
    </body></html>
  `);
});

router.get('/terms', (req, res) => {
  res.send(`
    <!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Conditions d'utilisation - UniPay</title>${baseStyle}</head>
    <body>
      <div class="container">
        <h1>Conditions d'utilisation</h1>
        <p class="update">Dernière mise à jour : 10 juillet 2026</p>
        
        <h2>1. Objet du service</h2>
        <p>UniPay est une interface technique permettant d’initier des opérations de paiement mobile. L’exécution des transactions est assurée par des prestataires tiers agréés. UniPay ne détient pas de fonds.</p>
        
        <h2>2. Conditions d’accès</h2>
        <p>Âge minimum : 18 ans. Résidence : Burkina Faso. Un compte par personne. Vous êtes responsable de la confidentialité de votre code PIN.</p>
        
        <h2>3. Transactions</h2>
        <p>Les ordres de paiement sont transmis instantanément aux prestataires. UniPay ne peut garantir l’exécution en cas de panne des opérateurs Mobile Money. Plafond indicatif : 2 000 000 FCFA/jour, susceptible d’ajustement.</p>
        
        <h2>4. Frais</h2>
        <p>Les frais applicables sont détaillés sur la page "Nos tarifs". Ils sont prélevés par les prestataires ou UniPay selon l’opération.</p>
        
        <h2>5. Suspension</h2>
        <p>UniPay peut suspendre l’accès en cas de suspicion de fraude, blanchiment, ou violation des présentes conditions.</p>
        
        <h2>6. Responsabilité</h2>
        <p>UniPay fournit un outil d’interface. La responsabilité des transferts de fonds incombe aux prestataires agréés qui exécutent l’opération.</p>

        <div class="disclaimer">
          <strong>Important :</strong> En utilisant UniPay, vous reconnaissez que nous ne sommes pas un établissement financier. Les fonds transitent via Orange Money, Moov Money, Wave ou autres partenaires régulés.
        </div>
      </div>
    </body></html>
  `);
});

router.get('/pricing', (req, res) => {
  res.send(`
    <!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nos tarifs - UniPay</title>${baseStyle}</head>
    <body>
      <div class="container">
        <h1>Nos tarifs</h1>
        <p class="update">Transparents, sans surprise. Dernière mise à jour : 10 juillet 2026</p>
        
        <div class="tarif-card">
          <div class="tarif-title">Transfert entre utilisateurs UniPay</div>
          <div class="tarif-price">Gratuit</div>
        </div>

        <div class="tarif-card">
          <div class="tarif-title">Retrait vers Mobile Money</div>
          <div class="tarif-price">1% du montant (minimum 100 FCFA)</div>
        </div>

        <div class="tarif-card">
          <div class="tarif-title">Recharge du wallet</div>
          <div class="tarif-price">Orange/Moov : 1% | Wave : Gratuit</div>
        </div>

        <div class="tarif-card">
          <div class="tarif-title">Paiement QR chez commerçant</div>
          <div class="tarif-price">Gratuit pour l'acheteur</div>
        </div>

        <div class="tarif-card">
          <div class="tarif-title">Plafond journalier indicatif</div>
          <div class="tarif-price">2 000 000 FCFA</div>
        </div>

        <p style="margin-top:24px;font-size:13px;color:#9C7E5C;">
          Les tarifs peuvent évoluer. Toute modification sera notifiée 30 jours avant application. Les frais sont prélevés par UniPay ou directement par les opérateurs partenaires selon l’opération.
        </p>

        <div class="disclaimer">
          <strong>Note :</strong> UniPay facture uniquement l’usage de son interface. Les frais de transfert Mobile Money sont appliqués par Orange, Moov ou Wave selon leurs grilles.
        </div>
      </div>
    </body></html>
  `);
});

router.get('/supprime', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Suppression de compte et données - UniPay</title>
<style>
body{font-family:Inter,Arial;max-width:800px;margin:0 auto;padding:20px;line-height:1.6;color:#222;background:#fdfbf5}
h1{color:#2b1e12} h2{color:#5a3e1b;margin-top:30px}
.card{background:white;padding:20px;border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,.06);margin:20px 0}
button{background:#2b1e12;color:#f8e7c0;border:none;padding:12px 20px;border-radius:10px;font-weight:700;cursor:pointer}
input,textarea{width:100%;padding:10px;border-radius:8px;border:1px solid #ddd;margin:8px 0}
a{color:#2b1e12}
</style>
</head>
<body>
<h1>UniPay - Suppression de compte et de données</h1>
<p><b>ETABLISSEMENT SABDOU TRANSFERT BUSINESS</b> - Opérateur de la plateforme UniPay<br>
Dernière mise à jour : 15 Juillet 2025</p>

<div class="card">
<h2>1. Comment supprimer votre compte UniPay ?</h2>
<p>Vous pouvez supprimer votre compte directement depuis l'application :</p>
<ol>
<li>Ouvrez l'application UniPay</li>
<li>Allez dans <b>Profil > Paramètres > Supprimer mon compte</b></li>
<li>Confirmez avec votre mot de passe</li>
<li>Votre compte sera supprimé immédiatement</li>
</ol>
<p>Ou par email : envoyez une demande à <b>abdallah.unipay@gmail.com</b> avec objet <b>"Suppression compte UniPay - [votre téléphone]"</b></p>
</div>

<div class="card">
<h2>2. Quelles données sont supprimées ?</h2>
<ul>
<li>Nom, prénom, téléphone, email, pseudo</li>
<li>Photo de profil, photos CNIB (recto/verso) stockées sur Cloudinary</li>
<li>Solde (doit être à 0 avant suppression)</li>
<li>Token de notification push (Expo)</li>
<li>Historique des transactions (anonymisé pour obligations légales LBC/FT BCEAO 5 ans)</li>
</ul>
<p><b>Conformément à la réglementation BCEAO et LBC/FT, nous conservons pendant 5 ans :</b> numéro de téléphone, numéro CNIB anonymisé, et logs de transactions pour audit, sans données personnelles identifiables.</p>
</div>

<div class="card">
<h2>3. Délai de suppression</h2>
<p>Suppression immédiate dans l'application. Par email : sous 48h ouvrées. Vous recevrez un email de confirmation.</p>
</div>

<div class="card">
<h2>4. Formulaire de demande de suppression (si vous n'avez plus l'app)</h2>
<form onsubmit="event.preventDefault(); window.location.href='mailto:abdallah.unipay@gmail.com?subject=Suppression compte UniPay - '+encodeURIComponent(document.getElementById('tel').value)+'&body=Bonjour,%0AJe demande la suppression de mon compte UniPay.%0ATelephone: '+encodeURIComponent(document.getElementById('tel').value)+'%0ARaison: '+encodeURIComponent(document.getElementById('raison').value)">
<label>Votre numéro de téléphone UniPay :</label>
<input id="tel" type="tel" placeholder="+226 XX XX XX XX" required>
<label>Raison (optionnel) :</label>
<textarea id="raison" placeholder="Pourquoi supprimez-vous votre compte ?"></textarea>
<button type="submit">Envoyer la demande par email</button>
</form>
</div>

<div class="card">
<h2>5. Contact Délégué à la Protection des Données</h2>
<p>
ETABLISSEMENT SABDOU TRANSFERT BUSINESS<br>
Gérant : SAWADOGO Abdoulaye<br>
Adresse : Kilwin Secteur 15, Ouagadougou, Burkina Faso<br>
Email : abdallah.unipay@gmail.com<br>
Téléphone : +226 70 87 94 25<br>
Merchant PawaPay ID : 24790
</p>
</div>

<p><a href="/privacy">Voir Politique de Confidentialité complète</a></p>
</body>
</html>
`);
});

module.exports = router;
