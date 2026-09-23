"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PrintReport } from "@/components/print-report";
import { printReport } from "@/lib/print-native";
import type { Submission } from "@/lib/types";

export function PrintActions({ record }: { record: Submission }) {
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Button variant="outline" render={<Link href={`/history/${record.id}`} />}>
          Back to record
        </Button>
        <Button onClick={() => printReport()}>Print / save PDF</Button>
      </div>
      <PrintReport record={record} />
    </>
  );
}
