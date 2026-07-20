import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LogBetButton } from "@/components/LogBetButton";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LogBetButton", () => {
  it("shows a stake input after clicking 'Log bet', then posts the bet on Save", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<LogBetButton outcomeId={42} sportsbookId={2} americanOdds={-115} />);

    fireEvent.click(screen.getByText("Log bet"));
    const stakeInput = screen.getByDisplayValue("25");
    expect(stakeInput).toBeInTheDocument();

    fireEvent.change(stakeInput, { target: { value: "50" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/bets");
    expect(JSON.parse(init.body)).toEqual({ outcomeId: 42, sportsbookId: 2, americanOdds: -115, stake: 50 });

    await waitFor(() => expect(screen.getByText("Logged ✓")).toBeInTheDocument());
  });
});
