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
          <TableRow key={i}>{row.map((cell, j) => <TableCell key={j}>{cell || "—"}</TableCell>)}</TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
