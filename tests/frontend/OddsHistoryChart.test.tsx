import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OddsHistoryChart } from "@/components/OddsHistoryChart";

describe("OddsHistoryChart", () => {
  it("renders an empty state when there is no history", () => {
    render(<OddsHistoryChart history={[]} />);
    expect(screen.getByText("No history yet.")).toBeInTheDocument();
  });

  it("renders one legend entry per distinct sportsbook", () => {
    render(
      <OddsHistoryChart
        history={[
          { sportsbook: "DraftKings", sportsbookId: 1, decimalOdds: 1.9, capturedAt: "2026-07-20T10:00:00Z" },
          { sportsbook: "DraftKings", sportsbookId: 1, decimalOdds: 1.95, capturedAt: "2026-07-20T11:00:00Z" },
          { sportsbook: "FanDuel", sportsbookId: 2, decimalOdds: 2.0, capturedAt: "2026-07-20T10:00:00Z" },
        ]}
      />
    );
    expect(screen.getByText("DraftKings")).toBeInTheDocument();
    expect(screen.getByText("FanDuel")).toBeInTheDocument();
  });

  it("renders an SVG line for each sportsbook", () => {
    const { container } = render(
      <OddsHistoryChart
        history={[
          { sportsbook: "DraftKings", sportsbookId: 1, decimalOdds: 1.9, capturedAt: "2026-07-20T10:00:00Z" },
          { sportsbook: "DraftKings", sportsbookId: 1, decimalOdds: 1.95, capturedAt: "2026-07-20T11:00:00Z" },
          { sportsbook: "FanDuel", sportsbookId: 2, decimalOdds: 2.0, capturedAt: "2026-07-20T10:00:00Z" },
        ]}
      />
    );
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(2);
  });
});
