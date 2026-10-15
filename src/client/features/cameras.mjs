export function createCamerasFeature() {
  function cameraEmbedUrl(baseUrl) {
    if (!baseUrl) return "";
    try {
      const url = new URL(baseUrl, globalThis.location?.href);
      if (/stream\.html$/i.test(url.pathname)) {
        url.pathname = url.pathname.replace(/stream\.html$/i, "webrtc.html");
      }
      url.searchParams.set("media", "video+audio");
      return url.toString();
    } catch {
      return baseUrl;
    }
  }

  function cameraStreamType(camera) {
    if (camera?.t === "mjpg" || camera?.t === "webrtc") return camera.t;
    const streamUrl = camera?.u || "";
    return streamUrl.includes(".mjpg") ? "mjpg" : "webrtc";
  }

  function cameraTileStreamUrl(camera, hd = false) {
    if (!camera) return "";
    if (cameraStreamType(camera) === "mjpg") return camera.u || "";
    const baseUrl = hd ? (camera.uh || camera.u) : camera.u;
    return cameraEmbedUrl(baseUrl || "");
  }

  return {
    cameraStreamType,
    cameraTileStreamUrl,
  };
}
