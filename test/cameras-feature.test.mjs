import assert from "node:assert/strict";
import test from "node:test";
import { createCamerasFeature } from "../src/client/features/cameras.mjs";

test("camera stream helpers normalize type and play URLs", () => {
  const feature = createCamerasFeature();
  const mjpg = { i: 1, t: "mjpg", u: "https://cam.local/stream.mjpg" };
  const rtc = { i: 2, t: "webrtc", u: "https://cam.local/stream.html?src=1", uh: "https://cam.local/stream.html?src=1&hd=1" };

  assert.equal(feature.cameraStreamType(mjpg), "mjpg");
  assert.equal(feature.cameraStreamType({ i: 9, u: "https://x/live.mjpg" }), "mjpg");
  assert.equal(feature.cameraStreamType(rtc), "webrtc");
  assert.equal(feature.cameraStreamType({ i: 7, t: "other", u: "https://cam.local/live" }), "webrtc");
  assert.equal(feature.cameraTileStreamUrl(mjpg, false), "https://cam.local/stream.mjpg");
  assert.equal(feature.cameraTileStreamUrl(rtc, false), "https://cam.local/webrtc.html?src=1&media=video%2Baudio");
  assert.equal(feature.cameraTileStreamUrl(rtc, true), "https://cam.local/webrtc.html?src=1&hd=1&media=video%2Baudio");
  assert.equal(
    feature.cameraTileStreamUrl({ i: 8, t: "webrtc", u: "https://cam.local/basic" }, true),
    "https://cam.local/basic?media=video%2Baudio",
  );
  assert.equal(feature.cameraTileStreamUrl(null, true), "");
});
