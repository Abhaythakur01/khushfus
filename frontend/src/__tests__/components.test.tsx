import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Select } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Dialog, DialogHeader, DialogContent } from "@/components/ui/dialog";

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
    const { container } = render(
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
});
