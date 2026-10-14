import {
  createApplicationShellFeature,
  createEnvironmentMediaFeature,
  createFavoritesCustomCardsFeature,
  createLightsColorSnapshotsFeature,
  createNotificationsTriggersFeature,
  createSimpleDeviceFeature,
  createThermostatsFeature,
} from "./index.mjs";

globalThis.MLDFeatures = {
  createApplicationShellFeature,
  createEnvironmentMediaFeature,
  createFavoritesCustomCardsFeature,
  createLightsColorSnapshotsFeature,
  createNotificationsTriggersFeature,
  createSimpleDeviceFeature,
  createThermostatsFeature,
};
