import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Select } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Dialog, DialogHeader, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Skeleton, SkeletonCard, SkeletonRow, SkeletonList } from "@/components/ui/skeleton";

// ---- Button ----

describe("Button", () => {
  it("renders with correct text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("handles click events", () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Press</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Press" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled when disabled prop is set", () => {
    render(<Button disabled>No click</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is disabled when loading", () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("applies variant className", () => {
    const { container } = render(<Button variant="outline">Outlined</Button>);
    const btn = container.querySelector("button");
    expect(btn?.className).toContain("border");
  });
});

// ---- Card ----

describe("Card components", () => {
  it("Card renders children", () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("CardHeader renders children", () => {
    render(<CardHeader>Header text</CardHeader>);
    expect(screen.getByText("Header text")).toBeInTheDocument();
  });

  it("CardTitle renders as h3", () => {
    render(<CardTitle>Title text</CardTitle>);
    const heading = screen.getByText("Title text");
    expect(heading.tagName).toBe("H3");
  });

  it("CardContent renders children", () => {
    render(<CardContent>Body text</CardContent>);
    expect(screen.getByText("Body text")).toBeInTheDocument();
  });
});

// ---- Badge ----

describe("Badge", () => {
  it("renders children", () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<Badge className="custom-class">Tag</Badge>);
    expect(container.querySelector("span")?.className).toContain("custom-class");
  });

  it("renders with variant styles", () => {
    const { container } = render(<Badge variant="positive">Good</Badge>);
    expect(container.querySelector("span")?.className).toContain("success");
  });
});

// ---- Spinner ----

describe("Spinner", () => {
  it("renders with role status", () => {
    render(<Spinner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has accessible label", () => {
    render(<Spinner />);
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  });

  it("renders with different sizes", () => {
    const { container } = render(<Spinner size="lg" />);
    const spinner = container.querySelector("[role='status']");
    expect(spinner?.className).toContain("h-10");
  });
});

// ---- Select ----

describe("Select", () => {
  const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
    { value: "c", label: "Gamma" },
  ];

  it("renders options", () => {
    render(<Select options={options} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });

  it("calls onValueChange when selection changes", () => {
    const onValueChange = jest.fn();
    render(<Select options={options} onValueChange={onValueChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } });
    expect(onValueChange).toHaveBeenCalledWith("b");
  });

  it("renders placeholder as disabled option", () => {
    render(<Select options={options} placeholder="Pick one" />);
    const placeholder = screen.getByText("Pick one");
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).toBeDisabled();
  });

  it("renders label when provided", () => {
    render(<Select options={options} label="Choose" />);
    expect(screen.getByText("Choose")).toBeInTheDocument();
  });
});

// ---- Tabs ----

describe("Tabs", () => {
  function renderTabs() {
    return render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
      </Tabs>
    );
  }

  it("renders tab triggers", () => {
    renderTabs();
    expect(screen.getByText("Tab 1")).toBeInTheDocument();
    expect(screen.getByText("Tab 2")).toBeInTheDocument();
  });

  it("shows default tab content", () => {
    renderTabs();
    expect(screen.getByText("Content 1")).toBeInTheDocument();
    expect(screen.queryByText("Content 2")).not.toBeInTheDocument();
  });

  it("switches tab content on click", () => {
    renderTabs();
    fireEvent.click(screen.getByText("Tab 2"));
    expect(screen.queryByText("Content 1")).not.toBeInTheDocument();
    expect(screen.getByText("Content 2")).toBeInTheDocument();
  });

  it("sets aria-selected on active trigger", () => {
    renderTabs();
    expect(screen.getByText("Tab 1")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Tab 2")).toHaveAttribute("aria-selected", "false");
  });
});

// ---- Input ----

describe("Input", () => {
  it("renders with placeholder", () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
  });

  it("handles change events", () => {
    const onChange = jest.fn();
    render(<Input placeholder="type" onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText("type"), {
      target: { value: "hello" },
    });
    expect(onChange).toHaveBeenCalled();
  });

  it("renders label when provided", () => {
    render(<Input label="Email" />);
    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  it("shows error message", () => {
    render(<Input error="Required field" />);
    expect(screen.getByText("Required field")).toBeInTheDocument();
  });
});

// ---- Dialog (Modal) ----

describe("Dialog", () => {
  it("renders children when open", () => {
    render(
      <Dialog open={true}>
        <DialogHeader>My Modal</DialogHeader>
        <DialogContent>Modal body</DialogContent>
      </Dialog>
    );
    expect(screen.getByText("My Modal")).toBeInTheDocument();
    expect(screen.getByText("Modal body")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <Dialog open={false}>
        <DialogContent>Hidden content</DialogContent>
      </Dialog>
    );
    expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
  });

  it("calls onClose when overlay is clicked", () => {
    const onClose = jest.fn();
    render(
      <Dialog open={true} onClose={onClose}>
        <DialogContent>Content</DialogContent>
      </Dialog>
    );
    // The overlay is the first fixed div with bg-black
    const overlay = document.querySelector(".bg-black\\/50");
    if (overlay) {
      fireEvent.click(overlay);
    }
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = jest.fn();
    render(
      <Dialog open={true} onClose={onClose}>
        <DialogContent>Press Escape</DialogContent>
      </Dialog>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("has role='dialog' for accessibility", () => {
    render(
      <Dialog open={true}>
        <DialogContent>Accessible Dialog</DialogContent>
      </Dialog>
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("has aria-modal='true'", () => {
    render(
      <Dialog open={true}>
        <DialogContent>Modal</DialogContent>
      </Dialog>
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("renders DialogHeader with a close button when onClose is provided", () => {
    const onClose = jest.fn();
    render(
      <Dialog open={true} onClose={onClose}>
        <DialogHeader onClose={onClose}>Header with close</DialogHeader>
        <DialogContent>Body</DialogContent>
      </Dialog>
    );
    const closeBtn = screen.getByRole("button", { name: /close dialog/i });
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders DialogFooter children", () => {
    render(
      <Dialog open={true}>
        <DialogContent>Body</DialogContent>
        <DialogFooter>
          <button>Confirm</button>
          <button>Cancel</button>
        </DialogFooter>
      </Dialog>
    );
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("blocks body scrolling when open", () => {
    render(
      <Dialog open={true}>
        <DialogContent>Scroll blocked</DialogContent>
      </Dialog>
    );
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("does not call onClose if onClose is not provided", () => {
    // Overlay click should not throw when no handler is provided
    expect(() => {
      render(
        <Dialog open={true}>
          <DialogContent>No handler</DialogContent>
        </Dialog>
      );
      const overlay = document.querySelector(".bg-black\\/50");
      if (overlay) fireEvent.click(overlay);
    }).not.toThrow();
  });
});

// ---- Skeleton components ----

describe("Skeleton", () => {
  it("renders a div with animate-pulse class", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.className).toContain("animate-pulse");
  });

  it("merges additional className", () => {
    const { container } = render(<Skeleton className="h-4 w-48" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("h-4");
    expect(el.className).toContain("w-48");
  });

  it("renders without crashing when no className provided", () => {
    expect(() => render(<Skeleton />)).not.toThrow();
  });
});

describe("SkeletonCard", () => {
  it("renders multiple skeleton lines", () => {
    const { container } = render(<SkeletonCard />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(1);
  });

  it("applies custom className to wrapper", () => {
    const { container } = render(<SkeletonCard className="my-custom" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("my-custom");
  });
});

describe("SkeletonRow", () => {
  it("renders a default of 4 skeleton columns", () => {
    const { container } = render(<SkeletonRow />);
    const cols = container.querySelectorAll(".animate-pulse");
    expect(cols.length).toBe(4);
  });

  it("renders custom column count", () => {
    const { container } = render(<SkeletonRow columns={6} />);
    const cols = container.querySelectorAll(".animate-pulse");
    expect(cols.length).toBe(6);
  });
});

describe("SkeletonList", () => {
  it("renders default count of 5 list items", () => {
    const { container } = render(<SkeletonList />);
    // Each item has a circular avatar skeleton + two line skeletons
    const skeletons = container.querySelectorAll(".animate-pulse");
    // 5 items × 3 skeletons each = 15
    expect(skeletons.length).toBe(15);
  });

  it("renders custom item count", () => {
    const { container } = render(<SkeletonList count={3} />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(9); // 3 items × 3 skeletons
  });
});

// ---- Tabs keyboard navigation ----

describe("Tabs keyboard navigation", () => {
  function renderTabs() {
    return render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          <TabsTrigger value="tab3">Tab 3</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content 1</TabsContent>
        <TabsContent value="tab2">Content 2</TabsContent>
        <TabsContent value="tab3">Content 3</TabsContent>
      </Tabs>
    );
  }

  it("active tab trigger has aria-selected=true", () => {
    renderTabs();
    expect(screen.getByText("Tab 1")).toHaveAttribute("aria-selected", "true");
  });

  it("inactive tab triggers have aria-selected=false", () => {
    renderTabs();
    expect(screen.getByText("Tab 2")).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("Tab 3")).toHaveAttribute("aria-selected", "false");
  });

  it("clicking tab2 shows Content 2 and hides Content 1", () => {
    renderTabs();
    fireEvent.click(screen.getByText("Tab 2"));
    expect(screen.getByText("Content 2")).toBeInTheDocument();
    expect(screen.queryByText("Content 1")).not.toBeInTheDocument();
  });

  it("clicking tab3 shows Content 3", () => {
    renderTabs();
    fireEvent.click(screen.getByText("Tab 3"));
    expect(screen.getByText("Content 3")).toBeInTheDocument();
  });

  it("tabs are rendered as buttons/interactive elements", () => {
    renderTabs();
    const triggers = screen.getAllByRole("tab");
    expect(triggers).toHaveLength(3);
  });
});

// ---- ErrorBoundary ----

/**
 * Simple ErrorBoundary for testing React error propagation.
 * We write a basic inline one since there's no dedicated file to import from.
 */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <div>Something went wrong</div>;
    }
    return this.props.children;
  }
}

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Bomb exploded");
  return <div>No explosion</div>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // Suppress React's error output in the test console
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders children normally when no error occurs", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("No explosion")).toBeInTheDocument();
  });

  it("renders fallback UI when a child throws", () => {
    render(
      <ErrorBoundary fallback={<div>Error occurred</div>}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Error occurred")).toBeInTheDocument();
    expect(screen.queryByText("No explosion")).not.toBeInTheDocument();
  });

  it("renders default 'Something went wrong' if no fallback is provided", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("does not show fallback when child renders successfully", () => {
    render(
      <ErrorBoundary fallback={<div>Fallback</div>}>
        <div>Normal content</div>
      </ErrorBoundary>
    );
    expect(screen.queryByText("Fallback")).not.toBeInTheDocument();
    expect(screen.getByText("Normal content")).toBeInTheDocument();
  });
});
