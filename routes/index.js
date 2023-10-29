const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    if (req.oidc.isAuthenticated()) {
        res.redirect('/home');
    } else {
        res.render('index');
    }
  });

module.exports = router;
