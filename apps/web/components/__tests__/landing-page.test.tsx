import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import LandingPage from "../../app/page";

test("the Node integration example uses the real Session endpoint from server-only code", () => {
  const { container } = render(<LandingPage />);

  fireEvent.click(screen.getByRole("button", { name: /node\.js/i }));

  expect(container).toHaveTextContent(/server-only: never expose this secret in browser code/i);
  expect(container).toHaveTextContent(/HEARLOOP_API_URL/);
  expect(container).toHaveTextContent(/\/v1\/sessions/);
  expect(container).toHaveTextContent(/HEARLOOP_SECRET_KEY/);
  expect(container).not.toHaveTextContent(/\/api\/feedback\/session/);
});
