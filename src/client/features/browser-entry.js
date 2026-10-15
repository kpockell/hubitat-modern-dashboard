import {
  createCamerasFeature,
  createEnvironmentMediaFeature,
  createFavoritesCustomCardsFeature,
  createLightsColorSnapshotsFeature,
  createNotificationsTriggersFeature,
  createSimpleDeviceFeature,
  createThermostatsFeature,
} from "./index.mjs";

globalThis.MLDFeatures = {
  ...(globalThis.MLDFeatures || {}),
  createCamerasFeature,
  createEnvironmentMediaFeature,
  createFavoritesCustomCardsFeature,
  createLightsColorSnapshotsFeature,
  createNotificationsTriggersFeature,
  createSimpleDeviceFeature,
  createThermostatsFeature,
};
