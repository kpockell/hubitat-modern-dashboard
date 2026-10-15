import {
  createEnvironmentMediaFeature,
  createFavoritesCustomCardsFeature,
  createLightsColorSnapshotsFeature,
  createNotificationsTriggersFeature,
  createSimpleDeviceFeature,
} from "./index.mjs";

globalThis.MLDFeatures = {
  createEnvironmentMediaFeature,
  createFavoritesCustomCardsFeature,
  createLightsColorSnapshotsFeature,
  createNotificationsTriggersFeature,
  createSimpleDeviceFeature,
};
