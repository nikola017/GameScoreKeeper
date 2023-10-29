const express = require('express');
const router = express.Router();

router.get('/home', (req, res) => {
    if (req.oidc.isAuthenticated()) {
        console.log(req.oidc.user);
        res.render('home', { user: req.oidc.user });  // Ako je korisnik autenticiran, prikažite mu home stranicu.
    } else {
        res.redirect('/');  // Ako korisnik nije autenticiran, preusmjerite ga natrag na glavnu stranicu.
    }
});

module.exports = router;
