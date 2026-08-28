const express = require('express');
const router = express.Router();
const festivalWishController = require('../controllers/festivalWishController');
const { authenticateUser } = require('../middleware/auth');

router.use(authenticateUser);

// On app open — scheduled wish for logged-in user (if not permanently hidden)
router.get('/active', festivalWishController.getActiveFestivalWish);

// Permanent hide ("Don't show again")
router.post('/:id/hide', festivalWishController.hideFestivalWish);

module.exports = router;
