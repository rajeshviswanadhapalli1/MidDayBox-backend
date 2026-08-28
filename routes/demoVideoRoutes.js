const express = require('express');
const router = express.Router();
const demoVideoController = require('../controllers/demoVideoController');
const { authenticateUser } = require('../middleware/auth');

router.use(authenticateUser);

// School, parent, or delivery boy — videos for logged-in role only
router.get('/', demoVideoController.getDemoVideosForApp);

module.exports = router;
