const express = require('express');
const router = express.Router();
const appController = require('../controllers/appController');

// No auth required - called on app launch
router.get('/version-check', appController.versionCheck);

module.exports = router;
