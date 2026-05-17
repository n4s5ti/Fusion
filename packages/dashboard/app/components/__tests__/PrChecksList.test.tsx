import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrChecksList } from "../PrChecksList";

describe("PrChecksList", () => {
  it("orders failing checks first", () => {
    render(
      <PrChecksList
        checks={[
          { name: "pass", required: true, state: "success" },
          { name: "pending", required: true, state: "pending" },
          { name: "fail", required: true, state: "failure" },
        ]}
        rollup="failure"
        loading={false}
        onRefresh={() => {}}
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("fail");
  });

  it("renders summary and details links", () => {
    render(
      <PrChecksList
        checks={[{ name: "fail", required: true, state: "failure", detailsUrl: "https://example.com/details" }]}
        rollup="failure"
        loading={false}
        onRefresh={() => {}}
      />,
    );

    expect(screen.getByText("0 passing, 1 failing, 0 pending")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View details/i })).toHaveAttribute("href", "https://example.com/details");
  });

  it("shows empty state", () => {
    render(<PrChecksList checks={[]} rollup="unknown" loading={false} onRefresh={() => {}} />);
    expect(screen.getByText("No checks reported yet")).toBeInTheDocument();
  });

  it("shows error state and retry", () => {
    const onRefresh = vi.fn();
    render(<PrChecksList checks={[]} rollup="unknown" loading={false} error="nope" onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole("button", { name: /Retry/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("refresh button triggers onRefresh", () => {
    const onRefresh = vi.fn();
    render(<PrChecksList checks={[]} rollup="unknown" loading={false} onRefresh={onRefresh} />);

    fireEvent.click(screen.getByRole("button", { name: "Refresh checks" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
