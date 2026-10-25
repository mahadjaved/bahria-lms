import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PortalTable as PortalTableType } from "@/lib/bahria/types";
export function PortalTableView({ table }: { table: PortalTableType }) {
  if (!table.rows.length) return null;
  return (
    <Table>
      {table.headers.length > 0 && (
        <TableHeader><TableRow>{table.headers.map((h, i) => <TableHead key={i}>{h || "—"}</TableHead>)}</TableRow></TableHeader>
      )}
      <TableBody>
        {table.rows.map((row, i) => (
          <TableRow key={i}>{row.map((cell, j) => {
            const href = table.cellLinks?.[i]?.[j];
            return (
              <TableCell key={j}>
                {href
                  ? <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80">{cell || "Open"}</a>
                  : (cell || "—")}
              </TableCell>
            );
          })}</TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
