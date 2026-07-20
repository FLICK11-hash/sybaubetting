import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge, EvValue, LoadingState, ErrorState, EmptyState } from "@/components/ui";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge tone="positive">Best</Badge>);
    expect(screen.getByText("Best")).toBeInTheDocument();
  });
});

describe("EvValue", () => {
  it("renders a dash for null", () => {
    render(<EvValue value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders a signed, formatted percentage for positive EV", () => {
    render(<EvValue value={3.125} />);
    expect(screen.getByText("+3.13%")).toBeInTheDocument();
  });

  it("does not add a plus sign for negative EV", () => {
    render(<EvValue value={-2.5} />);
    expect(screen.getByText("-2.50%")).toBeInTheDocument();
  });
});

describe("LoadingState / ErrorState / EmptyState", () => {
  it("renders a default loading label", () => {
    render(<LoadingState />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("renders the error message", () => {
    render(<ErrorState message="network down" />);
    expect(screen.getByText(/network down/)).toBeInTheDocument();
  });

  it("renders the empty state message", () => {
    render(<EmptyState message="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
});
