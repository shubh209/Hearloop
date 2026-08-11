const mockSend = jest.fn();

jest.mock("@aws-sdk/client-ses", () => {
  const actual = jest.requireActual("@aws-sdk/client-ses");
  return {
    ...actual,
    SESClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
  };
});

let sendUrgentAlert: (typeof import("../send-urgent-alert"))["sendUrgentAlert"];

beforeAll(() => {
  process.env.SES_FROM_EMAIL = "alerts@hearloop.example";
  process.env.APP_URL = "https://hearloop.vercel.app";
  sendUrgentAlert = require("../send-urgent-alert").sendUrgentAlert;
});

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({});
});

const BASE = {
  to: "owner@acme.test",
  sessionId: "session-abc",
  summary: "Customer is furious about the wait.",
  sentiment: "negative",
  urgency: "urgent",
  targetLabel: "North Ave — Oil Change",
};

describe("sendUrgentAlert", () => {
  it("sends one SES email to the Partner with summary, Target, and dashboard link", async () => {
    await sendUrgentAlert(BASE);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.input).toEqual({
      Source: "alerts@hearloop.example",
      Destination: { ToAddresses: ["owner@acme.test"] },
      Message: {
        Subject: { Data: "Urgent customer feedback", Charset: "UTF-8" },
        Body: {
          Text: {
            Data: expect.stringContaining("Customer is furious about the wait."),
            Charset: "UTF-8",
          },
        },
      },
    });
    expect(command.input.Message.Body.Text.Data).toContain("North Ave — Oil Change");
    expect(command.input.Message.Body.Text.Data).toContain(
      "https://hearloop.vercel.app/dashboard?nav=sessions&session=session-abc"
    );
    expect(command.input.Message.Body.Text.Data).toContain("session-abc");
  });

  it("does not call SES when the Partner has no email", async () => {
    await sendUrgentAlert({ ...BASE, to: "  " });
    expect(mockSend).not.toHaveBeenCalled();
  });
});
