import {
  createEnvironmentMediaFeature,
  createFavoritesCustomCardsFeature,
  createLightsColorSnapshotsFeature,
  createNotificationsTriggersFeature,
  createSimpleDeviceFeature,
  createThermostatsFeature,
} from "./index.mjs";

globalThis.MLDFeatures = {
  createEnvironmentMediaFeature,
  createFavoritesCustomCardsFeature,
  createLightsColorSnapshotsFeature,
  createNotificationsTriggersFeature,
  createSimpleDeviceFeature,
  createThermostatsFeature,
};
