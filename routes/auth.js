const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// Page de login
router.get('/login', (req, res) => {
  res.send(`
    <h2>Login Admin UniPay</h2>
    <form id="f">
      <input name="email" type="email" placeholder="Email" required><br><br>
      <input name="password" type="password" placeholder="Mot de passe" required><br><br>
      <button>Connexion</button>
    </form>
    <div id="msg"></div>
    <script>
      f.onsubmit = async e => {
        e.preventDefault();
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: f.email.value,
            password: f.password.value
          })
        });
        const data = await res.json();
        if (data.token) {
          localStorage.setItem('token', data.token);
          msg.innerHTML = 'Connecté! <a href="/api/clients/admin">Panel Admin</a>';
        } else {
          msg.innerText = data.message;
        }
      };
    </script>
  `);
});

// API Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (email!== process.env.ADMIN_EMAIL || password!== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ message: 'Identifiants incorrects' });
  }

  const token = jwt.sign(
    { email, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ message: 'Connecté', token });
});

module.exports = router;
