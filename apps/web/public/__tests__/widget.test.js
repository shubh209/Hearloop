function loadWidget() {
  jest.isolateModules(() => require("../widget.js"));
}

function okJson(body = {}) {
  return Promise.resolve({ ok: true, json: async () => body });
}

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  delete window.Hearloop;
  global.requestAnimationFrame = (callback) => callback();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: jest.fn() },
  });
});

test("widget exchanges its browser-safe embed key for a Session-create token", async () => {
  const fetchMock = jest
    .fn()
    .mockImplementationOnce(() => okJson({ sessionCreateToken: "create-token" }))
    .mockImplementationOnce(() => okJson({ sessionId: "session-a", sessionToken: "public-token" }))
    .mockImplementationOnce(() => okJson({}))
    .mockImplementationOnce(() => okJson({ uploadUrl: "https://storage.test/upload", storageKey: "recordings/a.webm" }))
    .mockImplementationOnce(() => okJson({}))
    .mockImplementationOnce(() => okJson({}));
  global.fetch = fetchMock;
  loadWidget();
  const widget = window.Hearloop.init({ embedKey: "pk-live_browser", apiBaseUrl: "https://api.test/v1" });
  widget.audioBlob = new Blob(["voice"], { type: "audio/webm" });

  await widget._send();

  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ embedKey: "pk-live_browser" });
});

test("widget displays microphone denial to the End user", async () => {
  navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(new Error("denied"));
  loadWidget();
  window.Hearloop.init({ embedKey: "pk-live_browser" });

  document.getElementById("hl-fab").click();
  document.getElementById("hl-mic-btn").click();

  await Promise.resolve();
  await Promise.resolve();
  expect(document.getElementById("hl-error")).toHaveTextContent(/microphone access denied/i);
  expect(document.getElementById("hl-error")).toBeVisible();
});
