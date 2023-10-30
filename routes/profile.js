const express = require('express');
const router = express.Router();
const { requiresAuth } = require('express-openid-connect')

router.get('/profile', requiresAuth(), function (req, res, next) {
    const user = req.oidc.user;
    const filteredProfile = {
        nickname: user.nickname,
        name: user.name,
        picture: user.picture,
        email: user.email,
        email_verified: user.email_verified
    };
    
    res.render('profile', {
      userProfile: filteredProfile,
      title: 'Profile page'
    });
});

module.exports = router;
