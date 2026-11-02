// The dense table style (spec 12): a header row, grid lines, and 32 px rows. The box scrolls on a
// narrow screen, so the page never does.
export const tableBox = 'overflow-x-auto rounded-md border';
export const table =
  'w-full border-collapse text-left text-sm outline-none [&_tbody_tr:hover]:bg-muted/50 [&_tbody_tr:last-child>td]:border-b-0 [&_td:not(:last-child)]:border-r [&_th:not(:last-child)]:border-r';
export const th = 'h-8 border-b bg-sidebar px-3 font-medium whitespace-nowrap text-muted-foreground';
export const td = 'h-8 border-b px-3';
