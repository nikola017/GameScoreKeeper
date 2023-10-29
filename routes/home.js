const express = require('express');
const router = express.Router();

router.get('/home', (req, res) => {
    if (req.oidc.isAuthenticated()) {
        console.log(req.oidc.user);
        let username;
        if (req.oidc && req.oidc.user) {
            if (req.oidc.user.name !== undefined) {
                username = req.oidc.user.name;
            } else if (req.oidc.user.sub !== undefined) {
                username = req.oidc.user.sub;
            }
        }
        res.render('home', { username });  // Ako je korisnik autenticiran, prikažite mu home stranicu.
    } else {
        res.redirect('/');  // Ako korisnik nije autenticiran, preusmjerite ga natrag na glavnu stranicu.
    }
});

module.exports = router;
