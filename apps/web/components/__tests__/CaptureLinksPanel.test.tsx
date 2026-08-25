import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CaptureLinksPanel } from "../CaptureLinksPanel";

const mockToDataURL = jest.fn();

jest.mock("qrcode", () => ({
  __esModule: true,
  default: { toDataURL: (...args: unknown[]) => mockToDataURL(...args) },
}));

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => body } as Response);
}

describe("CaptureLinksPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockToDataURL.mockResolvedValue("data:image/png;base64,generated-qr");
  });

  it("generates and downloads a QR code for a newly created Capture link", async () => {
    const link = {
      id: "link-a",
      token: "capture-token-a",
      targetLabel: "North Ave — Oil Change",
      targetKey: "north-ave-oil-change",
      path: "/c/capture-token-a",
      createdAt: "2026-08-24T12:00:00.000Z",
    };
    global.fetch = jest
      .fn()
      .mockImplementationOnce(() => jsonResponse({ links: [] }))
      .mockImplementationOnce(() => jsonResponse(link))
      .mockImplementationOnce(() => jsonResponse({ links: [link] }));
    render(<CaptureLinksPanel />);
    await screen.findByText(/no capture links yet/i);

    fireEvent.change(screen.getByPlaceholderText(/target label/i), {
      target: { value: "North Ave — Oil Change" },
    });
    fireEvent.click(screen.getByRole("button", { name: /new link/i }));

    await waitFor(() => {
      expect(mockToDataURL).toHaveBeenCalledWith(
        "http://localhost/c/capture-token-a",
        { width: 320, margin: 1 }
      );
    });
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/partners/me/capture-links",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ targetLabel: "North Ave — Oil Change" }),
      })
    );
    const download = await screen.findByRole("link", { name: /download qr/i });
    expect(download).toHaveAttribute("href", "data:image/png;base64,generated-qr");
    expect(download).toHaveAttribute(
      "download",
      "hearloop-qr-north-ave-oil-change.png"
    );
  });
});
