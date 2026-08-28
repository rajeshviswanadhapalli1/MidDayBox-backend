/**
 * App version check - used by MidDayBox app to prompt users to update.
 * No authentication required.
 */
exports.versionCheck = (req, res) => {
  const latestVersion = process.env.APP_LATEST_VERSION || '1.0.4';
  const forceUpdate = process.env.APP_FORCE_UPDATE !== 'false';
  const playStoreUrl =
    process.env.APP_PLAY_STORE_URL ||
    'https://play.google.com/store/apps/details?id=com.middaybox.app';

  res.status(200).json({
    success: true,
    data: {
      latestVersion,
      forceUpdate,
      playStoreUrl
    }
  });
};
