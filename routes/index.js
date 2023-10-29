const express = require('express');
const router = express.Router();

app.get('/', (req, res) => {
    if (req.oidc.isAuthenticated()) {
        res.redirect('/home');
    } else {
        res.render('index');
    }
  });

module.exports = router;
