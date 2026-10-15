import {
  createEnvironmentMediaFeature,
  createNotificationsTriggersFeature,
  createSimpleDeviceFeature,
} from "./index.mjs";

globalThis.MLDFeatures = {
  createEnvironmentMediaFeature,
  createNotificationsTriggersFeature,
  createSimpleDeviceFeature,
};
