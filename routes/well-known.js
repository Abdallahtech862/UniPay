const express = require('express');
const router = express.Router();

// 1. Android App Links - https://unipayburkina.com/.well-known/assetlinks.json
router.get('/assetlinks.json', (req, res) => {
  res.set('Content-Type', 'application/json');
  res.json([
    {
      "relation": ["delegate_permission/common.handle_all_urls"],
      "target": {
        "namespace": "android_app",
        "package_name": "com.abdallahtech.uniPay",
        // Remplace par ton vrai SHA256 trouvé avec: eas credentials
        "sha256_cert_fingerprints": [
          "E4:12:5A:8E:23:1B:9C:4F:6D:7A:2E:5B:8C:9D:0A:1F:2E:3D:4C:5B:6A:7F:8E:9D:0C:1B:2A:3F:4E:5D"
        ]
      }
    }
  ]);
});

// 2. iOS Universal Links - https://unipayburkina.com/.well-known/apple-app-site-association
// ATTENTION: pas de .json à la fin pour Apple, et Content-Type doit être application/json
router.get('/apple-app-site-association', (req, res) => {
  res.set('Content-Type', 'application/json');
  res.json({
    "applinks": {
      "apps": [],
      "details": [
        {
          // Remplace TEAMID par ton Apple Team ID (10 caractères)
          "appID": "ABCDE12345.com.abdallahtech.uniPay",
          "paths": [
            "/product/*",
            "/market/*",
            "/chat/*"
          ]
        }
      ]
    }
  });
});

// Pour compatibilité, certains iOS cherchent aussi avec .json
router.get('/apple-app-site-association.json', (req, res) => {
  res.set('Content-Type', 'application/json');
  res.json({
    "applinks": {
      "apps": [],
      "details": [
        {
          "appID": "ABCDE12345.com.abdallahtech.uniPay",
          "paths": ["/product/*", "/market/*", "/chat/*"]
        }
      ]
    }
  });
});

module.exports = router;
