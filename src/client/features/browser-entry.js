import {
  createEnvironmentMediaFeature,
  createFavoritesCustomCardsFeature,
  createNotificationsTriggersFeature,
  createSimpleDeviceFeature,
} from "./index.mjs";

globalThis.MLDFeatures = {
  createEnvironmentMediaFeature,
  createFavoritesCustomCardsFeature,
  createNotificationsTriggersFeature,
  createSimpleDeviceFeature,
};
