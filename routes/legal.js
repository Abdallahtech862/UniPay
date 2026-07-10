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



const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>UniPay - Carte virtuelle + Wallet Mobile Money</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
  
    * { margin: 0; padding: 0; box-sizing: border-box; }
  
  body {
    font-family: 'Poppins', sans-serif;
    background: #FDF8EF;
    color: #6B4423;
    line-height: 1.6;
  }
  
  .unipay-wrap { min-height: 100vh; }
  .page { display: none; }
  .page.active { display: block; }
  
  .unipay-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
  }
  
  .unipay-nav {
    background: #FFFFFF;
    padding: 15px 0;
    box-shadow: 0 2px 10px rgba(107, 68, 35, 0.05);
    position: sticky;
    top: 0;
    z-index: 100;
  }
  
  .unipay-nav-inner {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .unipay-nav-logo {
    font-size: 24px;
    font-weight: 700;
    color: #6B4423;
    cursor: pointer;
  }
  
  .unipay-nav-links a {
    color: #6B4423;
    text-decoration: none;
    margin-left: 25px;
    font-weight: 500;
    cursor: pointer;
  }
  
  .unipay-nav-links a:hover { color: #9C7E5C; }
  
  .unipay-btn {
    background: #E8D19A;
    color: #6B4423;
    padding: 16px 32px;
    border-radius: 12px;
    font-weight: 600;
    text-decoration: none;
    display: inline-block;
    transition: all 0.3s ease;
    border: none;
    cursor: pointer;
  }
  
  .unipay-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(232, 209, 154, 0.4);
  }
  
  .unipay-btn-outline {
    background: transparent;
    border: 2px solid #6B4423;
    color: #6B4423;
  }
  
  .unipay-hero {
    padding: 100px 0 80px;
    text-align: center;
  }
  
  .unipay-hero h1 {
    font-size: 48px;
    font-weight: 700;
    margin-bottom: 20px;
    line-height: 1.2;
  }
  
  .unipay-hero p {
    font-size: 18px;
    color: #9C7E5C;
    margin-bottom: 40px;
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
  }
  
  .unipay-phone {
    background: #E8D19A;
    width: 300px;
    height: 600px;
    border-radius: 40px;
    margin: 60px auto 0;
    padding: 15px;
    box-shadow: 0 30px 80px rgba(107, 68, 35, 0.2);
  }
  
  .unipay-phone-screen {
    background: #FDF8EF;
    width: 100%;
    height: 100%;
    border-radius: 30px;
    overflow: hidden;
  }
  
  .unipay-header {
    padding: 20px 20px 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .unipay-logo {
    font-size: 18px;
    font-weight: 700;
    color: #6B4423;
  }
  
  .unipay-settings {
    width: 28px;
    height: 28px;
    background: #E8D19A;
    border-radius: 8px;
  }
  
  .unipay-solde-box {
    padding: 10px 20px 20px;
  }
  
  .unipay-solde-label {
    font-size: 12px;
    color: #9C7E5C;
    margin-bottom: 4px;
  }
  
  .unipay-solde {
    font-size: 32px;
    font-weight: 700;
    color: #6B4423;
  }
  
  .unipay-qr-section {
    background: #FFFFFF;
    margin: 0 20px 20px;
    padding: 20px;
    border-radius: 16px;
    text-align: center;
  }
  
  .unipay-qr-box img {
    width: 120px;
    height: 120px;
    display: block;
    margin: 0 auto;
  }
  
  .unipay-actions {
    padding: 0 20px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 20px;
  }
  
  .unipay-action-btn {
    background: #E8D19A;
    padding: 14px 8px;
    border-radius: 12px;
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    color: #6B4423;
  }
  
  .unipay-action-btn.secondary { background: #DDE5D9; }
  .unipay-action-btn.outline {
    background: transparent;
    border: 1.5px solid #6B4423;
  }
  
  .unipay-section-title {
    font-size: 16px;
    font-weight: 600;
    padding: 0 20px;
    margin: 20px 0 12px;
    color: #6B4423;
  }
  
  .unipay-carte {
    background: #E8D19A;
    margin: 0 20px 12px;
    padding: 16px;
    border-radius: 12px;
  }
  
  .unipay-carte-type {
    font-size: 11px;
    color: #6B4423;
    opacity: 0.7;
    margin-bottom: 8px;
  }
  
  .unipay-carte-numero {
    font-size: 14px;
    font-weight: 600;
    color: #6B4423;
    letter-spacing: 2px;
    margin-bottom: 8px;
  }
  
  .unipay-carte-solde {
    font-size: 16px;
    font-weight: 700;
    color: #6B4423;
  }
  
  .unipay-wallet-section {
    padding: 80px 0;
    background: #FFFFFF;
  }
  
  .unipay-wallet-box {
    background: #DDE5D9;
    border-radius: 24px;
    padding: 60px 40px;
    text-align: center;
    max-width: 900px;
    margin: 0 auto;
  }
  
  .unipay-wallet-box h2 {
    font-size: 36px;
    font-weight: 700;
    margin-bottom: 20px;
  }
  
  .unipay-wallet-box p {
    font-size: 17px;
    color: #6B4423;
    margin-bottom: 40px;
    max-width: 700px;
    margin-left: auto;
    margin-right: auto;
  }
  
  .unipay-wallet-icons {
    display: flex;
    justify-content: center;
    gap: 30px;
    flex-wrap: wrap;
    margin-top: 40px;
  }
  
  .unipay-wallet-item { text-align: center; }
  
  .unipay-wallet-item-icon {
    width: 70px;
    height: 70px;
    background: #FDF8EF;
    border-radius: 16px;
    margin: 0 auto 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
  }
  
  .unipay-features {
    padding: 80px 0;
    background: #FDF8EF;
  }
  
  .unipay-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 40px;
    margin-top: 60px;
  }
  
  .unipay-feature {
    text-align: center;
    padding: 30px;
    background: #FFFFFF;
    border-radius: 16px;
  }
  
  .unipay-icon {
    width: 64px;
    height: 64px;
    background: #DDE5D9;
    border-radius: 16px;
    margin: 0 auto 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
  }
  
  .unipay-feature h3 {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 12px;
  }
  
  .unipay-feature p {
    color: #9C7E5C;
    font-size: 15px;
  }
  
  .unipay-cta {
    padding: 80px 0;
    text-align: center;
    background: #6B4423;
    color: #FDF8EF;
  }
  
  .unipay-cta h2 {
    font-size: 36px;
    margin-bottom: 20px;
  }
  
  .unipay-cta .unipay-btn {
    background: #E8D19A;
    margin-top: 20px;
  }
  
  .unipay-footer {
    background: #FDF8EF;
    padding: 60px 0 30px;
    border-top: 1px solid #E8D19A;
  }
  
  .unipay-footer-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 40px;
    margin-bottom: 40px;
  }
  
  .unipay-footer h4 {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 16px;
    color: #6B4423;
  }
  
  .unipay-footer p, .unipay-footer a {
    color: #9C7E5C;
    font-size: 14px;
    text-decoration: none;
    display: block;
    margin-bottom: 8px;
    cursor: pointer;
  }
  
  .unipay-footer a:hover { color: #6B4423; }
  
  .unipay-copyright {
    text-align: center;
    padding-top: 30px;
    border-top: 1px solid #E8D19A;
    color: #9C7E5C;
    font-size: 13px;
  }
  
  .legal-page {
    padding: 80px 0;
    min-height: 60vh;
  }
  
  .legal-page h1 {
    font-size: 36px;
    margin-bottom: 30px;
    color: #6B4423;
  }
  
  .legal-page h2 {
    font-size: 24px;
    margin: 30px 0 15px;
    color: #6B4423;
  }
  
  .legal-page p, .legal-page li {
    color: #9C7E5C;
    margin-bottom: 15px;
    line-height: 1.8;
  }
  
  .legal-page ul {
    margin-left: 20px;
    margin-bottom: 20px;
  }
  
  @media (max-width: 768px) {
    .unipay-hero h1 { font-size: 32px; }
    .unipay-hero p { font-size: 16px; }
    .unipay-wallet-box { padding: 40px 20px; }
    .unipay-phone { width: 280px; height: 560px; }
    .unipay-nav-links { display: none; }
  }
</style>
</head>
<body>
<div class="unipay-wrap">
  
  <!-- NAVIGATION -->
  <nav class="unipay-nav">
    <div class="unipay-container">
      <div class="unipay-nav-inner">
        <div class="unipay-nav-logo" onclick="showPage('home')">UniPay</div>
        <div class="unipay-nav-links">
          <a onclick="showPage('home')">Accueil</a>
          <a onclick="showPage('cgu')">CGU</a>
          <a onclick="showPage('confidentialite')">Confidentialité</a>
          <a onclick="showPage('mentions')">Mentions légales</a>
        </div>
      </div>
    </div>
  </nav>

  <!-- PAGE ACCUEIL -->
  <div id="home" class="page active">
    <section class="unipay-hero">
      <div class="unipay-container">
        <h1>La carte virtuelle<br>+ Wallet Mobile Money</h1>
        <p>Paye en ligne, dans les magasins et entre particuliers. Recharge par Orange Money, Wave, Moov. Simple, rapide, sécurisé.</p>
        <div>
          <a href="#download" class="unipay-btn">Télécharger l'app</a>
          <a href="#wallet" class="unipay-btn unipay-btn-outline" style="margin-left: 12px;">Découvrir le Wallet</a>
        </div>
        
        <div class="unipay-phone">
          <div class="unipay-phone-screen">
            <div class="unipay-header">
              <div class="unipay-settings"></div>
              <div class="unipay-logo">UniPay</div>
            </div>
            
            <div class="unipay-solde-box">
              <div class="unipay-solde-label">Solde:</div>
              <div class="unipay-solde">7 500 FCFA</div>
            </div>
            
            <div class="unipay-qr-section">
              <div class="unipay-qr-box">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=unipay://pay?user=22675322321" 
                     alt="QR UniPay" loading="lazy">
              </div>
            </div>
            
            <div class="unipay-actions">
              <div class="unipay-action-btn">Payer</div>
              
              <div class="unipay-action-btn outline">Partager</div>
            </div>
            
            <div class="unipay-actions">
              <div class="unipay-action-btn outline">Récupérer</div>
              
              <div class="unipay-action-btn secondary">Recharger</div>
            </div>
            
            <div class="unipay-section-title">Mes cartes</div>
            <div class="unipay-carte">
              <div class="unipay-carte-type">Visa</div>
              <div class="unipay-carte-numero">**** 5678</div>
              <div class="unipay-carte-solde">5 000 FCFA</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="unipay-wallet-section" id="wallet">
      <div class="unipay-container">
        <div class="unipay-wallet-box">
          <h2>Wallet UniPay : Paye partout au Burkina</h2>
          <p>Recharge ton wallet en 10 secondes avec Orange Money, Wave ou Moov Money. Paye dans les boutiques, marchés, restaurants et envoie de l'argent à tes proches instantanément. La meilleure solution pour des achats rapides et sécurisés au quotidien.</p>
          
          <div class="unipay-wallet-icons">
            <div class="unipay-wallet-item">
              <div class="unipay-wallet-item-icon">📱</div>
              <div style="font-size: 14px; font-weight: 600; color: #6B4423;">Mobile Money</div>
              <div style="font-size: 12px; color: #9C7E5C;">Recharge instantanée</div>
            </div>
            <div class="unipay-wallet-item">
              <div class="unipay-wallet-item-icon">🏪</div>
              <div style="font-size: 14px; font-weight: 600; color: #6B4423;">Magasins</div>
              <div style="font-size: 12px; color: #9C7E5C;">Scan QR & paiement</div>
            </div>
            <div class="unipay-wallet-item">
              <div class="unipay-wallet-item-icon">👥</div>
              <div style="font-size: 14px; font-weight: 600; color: #6B4423;">Particuliers</div>
              <div style="font-size: 12px; color: #9C7E5C;">Transfert instantané</div>
            </div>
            <div class="unipay-wallet-item">
              <div class="unipay-wallet-item-icon">🌐</div>
              <div style="font-size: 14px; font-weight: 600; color: #6B4423;">En ligne</div>
              <div style="font-size: 12px; color: #9C7E5C;">Carte virtuelle Visa</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="unipay-features" id="features">
      <div class="unipay-container">
        <h2 style="text-align: center; font-size: 36px; font-weight: 700; margin-bottom: 20px;">Tout-en-un dans ton téléphone</h2>
        <p style="text-align: center; color: #9C7E5C; max-width: 600px; margin: 0 auto;">Carte virtuelle + Wallet Mobile Money pour tous tes paiements</p>
        
        <div class="unipay-grid">
          <div class="unipay-feature">
            <div class="unipay-icon">💳</div>
            <h3>Carte virtuelle Visa</h3>
            <p>Active ta carte en 2 minutes. Paye sur Netflix, Amazon, Facebook Ads et tous les sites internationaux.</p>
          </div>
          
          <div class="unipay-feature">
            <div class="unipay-icon">⚡</div>
            <h3>Recharge Mobile Money</h3>
            <p>Orange Money, Wave, Moov Money. Recharge ton wallet 24h/24. L'argent arrive instantanément.</p>
          </div>
          
          <div class="unipay-feature">
            <div class="unipay-icon">🏪</div>
            <h3>Paiement en magasin</h3>
            <p>Scanne le QR code chez les commerçants partenaires. Paye sans cash ni carte physique.</p>
          </div>
          
          <div class="unipay-feature">
            <div class="unipay-icon">💸</div>
            <h3>Recevoir par QR Code</h3>
            <p>Partage ton QR code UniPay. Tes proches scannent et payent. Zéro erreur de numéro, argent reçu en 2 secondes.</p>
          </div>
          
          <div class="unipay-feature">
            <div class="unipay-icon">🔒</div>
            <h3>Sécurisé PIN + Empreinte</h3>
            <p>Chaque transaction validée par code PIN ou biométrie. Bloque ta carte en 1 clic si besoin.</p>
          </div>
          
          <div class="unipay-feature">
            <div class="unipay-icon">📊</div>
            <h3>Suivi des dépenses</h3>
            <p>Vois toutes tes transactions en temps réel. Gère ton budget facilement depuis l'app.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="unipay-cta" id="download">
      <div class="unipay-container">
        <h2>Rejoins la révolution du paiement mobile</h2>
        <p style="color: #E8D19A; font-size: 18px;">+10 000 utilisateurs font confiance à UniPay au Burkina Faso</p>
        <a href="#" class="unipay-btn">Télécharger sur Play Store</a>
      </div>
    </section>
  </div>

  <!-- PAGE CGU -->
  <div id="cgu" class="page">
    <div class="unipay-container">
      <div class="legal-page">
        <h1>Conditions Générales d'Utilisation</h1>
        <p><strong>Dernière mise à jour : 21 juin 2026</strong></p>
        
        <h2>1. Objet</h2>
        <p>Les présentes Conditions Générales d'Utilisation régissent l'utilisation de l'application mobile UniPay et du site web unipay.bf, édités par l'Etablissement Sabdou Transfert et Business.</p>
        
        <h2>2. Services proposés</h2>
        <p>UniPay propose les services suivants :</p>
        <ul>
          <li>Carte virtuelle Visa pour paiements en ligne</li>
          <li>Wallet Mobile Money rechargeable via Orange Money, Wave, Moov Money</li>
          <li>Paiements dans les magasins partenaires par QR Code</li>
          <li>Transferts d'argent entre utilisateurs UniPay</li>
          <li>Suivi des transactions en temps réel</li>
        </ul>
        
        <h2>3. Inscription et compte</h2>
        <p>Pour utiliser UniPay, vous devez être âgé de 18 ans minimum et résider au Burkina Faso. L'inscription nécessite un numéro de téléphone valide et une pièce d'identité.</p>
        
        <h2>4. Frais et commissions</h2>
        <p>Les frais applicables sont consultables dans l'application. UniPay se réserve le droit de modifier sa grille tarifaire avec un préavis de 30 jours.</p>
        
        <h2>5. Sécurité</h2>
        <p>Chaque transaction est protégée par code PIN ou authentification biométrique. En cas de perte ou vol, bloquez immédiatement votre carte depuis l'application.</p>
        
        <h2>6. Responsabilité</h2>
        <p>L'utilisateur est responsable de la confidentialité de ses identifiants. Etablissement Sabdou Transfert et Business ne saurait être tenu responsable en cas d'utilisation frauduleuse suite à une négligence.</p>
        
        <h2>7. Contact</h2>
        <p>Pour toute question : abdallah.unipay@gmail.com ou +226 75 32 23 21</p>
      </div>
    </div>
  </div>

  <!-- PAGE CONFIDENTIALITE -->
  <div id="confidentialite" class="page">
    <div class="unipay-container">
      <div class="legal-page">
        <h1>Politique de Confidentialité</h1>
        <p><strong>Dernière mise à jour : 21 juin 2026</strong></p>
        
        <h2>1. Données collectées</h2>
        <p>Nous collectons les données suivantes :</p>
        <ul>
          <li>Informations d'identité : nom, prénom, CNIB, date de naissance</li>
          <li>Coordonnées : numéro de téléphone, email, adresse</li>
          <li>Données de transaction : montants, destinataires, dates</li>
          <li>Données techniques : adresse IP, type d'appareil, logs</li>
        </ul>
        
        <h2>2. Utilisation des données</h2>
        <p>Vos données sont utilisées pour :</p>
        <ul>
          <li>Fournir et sécuriser nos services de paiement</li>
          <li>Vérifier votre identité (KYC) conformément à la réglementation</li>
          <li>Prévenir la fraude et le blanchiment d'argent</li>
          <li>Améliorer nos services et l'expérience utilisateur</li>
          <li>Respecter nos obligations légales</li>
        </ul>
        
        <h2>3. Partage des données</h2>
        <p>Nous ne vendons jamais vos données. Elles peuvent être partagées avec :</p>
        <ul>
          <li>Partenaires Mobile Money pour les recharges</li>
          <li>Visa pour les paiements par carte</li>
          <li>Autorités compétentes sur demande légale</li>
        </ul>
        
        <h2>4. Sécurité</h2>
        <p>Toutes vos données sont chiffrées (AES-256) et stockées sur des serveurs sécurisés au Burkina Faso. Les transactions sont protégées par cryptage SSL/TLS.</p>
        
        <h2>5. Vos droits</h2>
        <p>Conformément à la loi burkinabé, vous disposez d'un droit d'accès, de rectification et de suppression de vos données. Contactez-nous à abdallah.unipay@gmail.com</p>
        
        <h2>6. Conservation</h2>
        <p>Les données sont conservées 10 ans après la clôture du compte, conformément à la réglementation bancaire.</p>
      </div>
    </div>
  </div>

  <!-- PAGE MENTIONS LEGALES -->
  <div id="mentions" class="page">
    <div class="unipay-container">
      <div class="legal-page">
        <h1>Mentions Légales</h1>
        
        <h2>Éditeur du site</h2>
        <p><strong>Etablissement Sabdou Transfert et Business</strong><br>
        Entreprise individuelle<br>
        Responsable : Sawadogo Abdoulaye<br>
        Adresse : Ouagadougou, Burkina Faso<br>
        Email : abdallah.unipay@gmail.com<br>
        Téléphone : +226 75 32 23 21</p>
        
        <h2>Hébergement</h2>
        <p>Site hébergé par Dorik<br>
        Application hébergée sur serveurs sécurisés</p>
        
        <h2>Propriété intellectuelle</h2>
        <p>L'ensemble du contenu du site et de l'application UniPay (textes, images, logo, code) est la propriété exclusive de Etab lissement Sabdou Transfert et Business. Toute reproduction est interdite sans autorisation préalable.</p>
        
        <h2>Agrément</h2>
        <p>UniPay opère en conformité avec la réglementation de la BCEAO et de l'ARCEP Burkina Faso relative aux services de paiement mobile.</p>
        
        <h2>Réclamations</h2>
        <p>Pour toute réclamation, contactez-nous :<br>
        Email : abdallah.unipay@gmail.com<br>
        WhatsApp : +226 75 32 23 21<br>
        Délai de réponse : 72h maximum</p>
        
        <h2>Litiges</h2>
        <p>En cas de litige, une solution amiable sera privilégiée. À défaut, les tribunaux de Ouagadougou seront compétents.</p>
        
        <h2>Avertissement</h2>
        <p>UniPay est un outil technique d’interface développé à titre personnel. Nous ne sommes pas une banque ni un établissement de monnaie électronique agréé. Nous ne détenons pas les fonds des utilisateurs. Les services de transfert et dépôt sont fournis par des prestataires partenaires agréés.</p>
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <footer class="unipay-footer">
    <div class="unipay-container">
      <div class="unipay-footer-grid">
        <div>
          <h4>UniPay</h4>
          <p>Carte virtuelle + Wallet Mobile Money. Paye partout au Burkina Faso et en ligne.</p>
        </div>
        
        <div>
          <h4>Contact</h4>
          <p>Email : <a href="mailto:abdallah.unipay@gmail.com">abdallah.unipay@gmail.com</a></p>
          <p>Téléphone : <a href="tel:+22675322321">+226 75 32 23 21</a></p>
          <p>WhatsApp : <a href="https://wa.me/22675322321">+226 75 32 23 21</a></p>
        </div>
        
        <div>
          <h4>Entreprise</h4>
          <p><strong>Etablissement Sabdou Transfert et Business</strong></p>
          <p>Responsable : Sawadogo Abdoulaye</p>
          <p>Ouagadougou, Burkina Faso</p>
          <p>RCCM: BF-OUAGA-01-2023-A10-17269</p>
        </div>
        
        <div>
          <h4>Légal</h4>
          <a onclick="showPage('cgu')">Conditions d'utilisation</a>
          <a onclick="showPage('confidentialite')">Politique de confidentialité</a>
          <a onclick="showPage('mentions')">Mentions légales</a>
        </div>
      </div>
      
      <div class="unipay-copyright">
        <p>© 2026 Etablissement Sabdou Transfert et Business. Tous droits réservés.</p>
      </div>
    </div>
  </footer>
</div>

<script>
  function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
    window.scrollTo(0, 0);
  }
  
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
</script>

</body>
</html>`;
router.get('/unipay', (req, res) => {
  res.set('Content-Type', 'text/html');
  res.send(html); 
});

module.exports = router;
