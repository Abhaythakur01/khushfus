# UI Component Catalog

Reusable components in `frontend/src/components/ui/`. All support `className` prop for overrides.

> **TODO (6.49):** Add Storybook for interactive component browsing.

---

## Button

Polymorphic button with loading state.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `"primary" \| "secondary" \| "outline" \| "ghost" \| "danger" \| "destructive"` | `"primary"` | Visual style |
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | Height and padding |
| `loading` | `boolean` | `false` | Shows spinner, disables button |
| `icon` | `ReactNode` | - | Leading icon slot |

```tsx
<Button variant="primary" size="sm" loading={saving}>Save</Button>
<Button variant="ghost" icon={<Plus className="h-4 w-4" />}>Add Item</Button>
```

## Card, CardHeader, CardTitle, CardContent, CardFooter

Composable card container for dashboard widgets and content sections.

| Component | Key Props | Description |
|-----------|-----------|-------------|
| `Card` | `className` | Outer container with border + shadow |
| `CardHeader` | `className` | Top section with bottom border |
| `CardTitle` | `className` | `<h3>` styled heading |
| `CardContent` | `className` | Padded body area |
| `CardFooter` | `className` | Bottom section with top border |

```tsx
<Card>
  <CardHeader><CardTitle>Revenue</CardTitle></CardHeader>
  <CardContent>Chart goes here</CardContent>
</Card>
```

## Input

Text input with optional label, icon, and error message. Auto-generates `htmlFor`/`id` from label.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | - | Label text (auto-links via htmlFor) |
| `error` | `string` | - | Error message shown below input |
| `icon` | `ReactNode` | - | Left-aligned icon |

```tsx
<Input label="Email" type="email" error={errors.email} />
```

## Textarea

Same API as Input but for multi-line text. Re-exported from `input.tsx`.

```tsx
<Textarea label="Description" rows={4} />
```

## Select

Native `<select>` wrapper with label, error, and chevron icon.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | - | Label text |
| `error` | `string` | - | Error message |
| `options` | `{ value, label }[]` | - | Option items (or use children) |
| `placeholder` | `string` | - | Disabled placeholder option |
| `onValueChange` | `(value: string) => void` | - | Callback on selection |

```tsx
<Select label="Platform" options={[{ value: "twitter", label: "Twitter" }]} onValueChange={setPlatform} />
```

## Dialog, DialogHeader, DialogContent, DialogFooter

Modal dialog with focus trap, Escape-to-close, and body scroll lock. Renders via portal.

| Prop | Type | Description |
|------|------|-------------|
| `open` | `boolean` | Controls visibility |
| `onClose` | `() => void` | Called on overlay click or Escape |
| `onOpenChange` | `(open: boolean) => void` | Alternative close callback |

```tsx
<Dialog open={isOpen} onClose={() => setIsOpen(false)}>
  <DialogHeader onClose={() => setIsOpen(false)}>Confirm</DialogHeader>
  <DialogContent>Are you sure?</DialogContent>
  <DialogFooter><Button onClick={handleConfirm}>Yes</Button></DialogFooter>
</Dialog>
```

## Tabs, TabList, TabTrigger, TabPanel

Accessible tabs with keyboard navigation (Arrow keys, Home/End). Also exported as `TabsList`, `TabsTrigger`, `TabsContent`.

| Prop | Type | Description |
|------|------|-------------|
| `defaultValue` | `string` | Initial active tab (uncontrolled) |
| `value` | `string` | Active tab (controlled) |
| `onValueChange` | `(value: string) => void` | Tab change callback |

```tsx
<Tabs defaultValue="overview">
  <TabList><TabTrigger value="overview">Overview</TabTrigger></TabList>
  <TabPanel value="overview">Content here</TabPanel>
</Tabs>
```

## Badge

Inline label/tag with semantic color variants.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `"positive" \| "negative" \| "neutral" \| "twitter" \| "reddit" \| ... \| "default" \| "destructive" \| "outline"` | `"default"` | Color scheme |
| `size` | `"sm" \| "md"` | `"md"` | Padding and font size |

```tsx
<Badge variant="positive">Positive</Badge>
```

## Spinner, PageSpinner

Loading indicator with three sizes.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `size` | `"sm" \| "md" \| "lg"` | `"md"` | Spinner diameter |

```tsx
<Spinner size="lg" />
<PageSpinner />  {/* Centered full-height spinner */}
```

## Skeleton, SkeletonCard, SkeletonRow, SkeletonList

Animated placeholder components for loading states.

| Component | Key Props | Description |
|-----------|-----------|-------------|
| `Skeleton` | `className` (set height/width) | Base shimmer block |
| `SkeletonCard` | `className` | Pre-built card placeholder |
| `SkeletonRow` | `columns?: number` | Table row placeholder |
| `SkeletonList` | `count?: number` | List of avatar + text placeholders |

```tsx
<Skeleton className="h-4 w-48" />
<SkeletonCard />
```

## Table, TableHeader, TableBody, TableRow, TableHead, TableCell

Composable table primitives with horizontal scroll wrapper.

```tsx
<Table>
  <TableHeader><TableRow><TableHead>Name</TableHead></TableRow></TableHeader>
  <TableBody><TableRow><TableCell>Acme</TableCell></TableRow></TableBody>
</Table>
```

## EmptyState

Centered placeholder for empty lists/sections with optional CTA.

| Prop | Type | Description |
|------|------|-------------|
| `icon` | `ReactNode` | Custom icon (default: Inbox) |
| `title` | `string` | Heading text |
| `description` | `string` | Subtext |
| `actionLabel` | `string` | Button label |
| `onAction` | `() => void` | Button click handler |

```tsx
<EmptyState title="No projects" description="Create one to get started" actionLabel="New Project" onAction={handleCreate} />
```
