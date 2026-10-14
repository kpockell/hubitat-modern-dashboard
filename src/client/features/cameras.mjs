export function createCamerasFeature() {
  function cameraStreamType(camera) {
    if (camera?.t === "mjpg" || camera?.t === "webrtc") return camera.t;
    const streamUrl = camera?.u || "";
    return streamUrl.includes(".mjpg") ? "mjpg" : "webrtc";
  }

  function cameraTileStreamUrl(camera, hd = false) {
    if (!camera) return "";
    if (cameraStreamType(camera) === "mjpg") return camera.u || "";
    return (hd ? (camera.uh || camera.u) : camera.u) || "";
  }

  return {
    cameraStreamType,
    cameraTileStreamUrl,
  };
}
