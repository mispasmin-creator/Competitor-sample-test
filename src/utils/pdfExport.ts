import { jsPDF } from 'jspdf';
import type { Competitor, LabCase } from '../types/lab';
import type { ParameterComparisonRow, SampleTestSummary } from './labCalculations';
import { formatCurrency, formatShortDate } from './fileHelpers';

interface ReportPdfPayload {
  labCase: LabCase;
  competitor?: Competitor;
  rows: ParameterComparisonRow[];
  summary: SampleTestSummary;
  verdict: string;
}

export function downloadLabReportPdf(payload: ReportPdfPayload): void {
  const { labCase, competitor, rows, summary, verdict } = payload;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const sampleLabel = labCase.sampleCode || labCase.caseId;
  const productLabel = labCase.sampleName || labCase.product;

  // Header bar
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('COMPETITOR SAMPLE LAB', margin, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Engineering Benchmark & Lost Order Comparison Report', margin, 19);

  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(sampleLabel, pageWidth - margin, 12, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(`Status: ${labCase.approvalStatus}`, pageWidth - margin, 19, { align: 'right' });

  let y = 37;

  // Metadata Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.rect(margin, y, contentWidth, 34, 'FD');

  const col1X = margin + 4;
  const col2X = margin + contentWidth / 2 + 2;

  const drawMetaField = (x: number, rowY: number, label: string, value: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label.toUpperCase(), x, rowY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(value.slice(0, 42), x, rowY + 4.5);
  };

  drawMetaField(col1X, y + 6, 'Product & Category', `${productLabel} (${labCase.category})`);
  drawMetaField(
    col2X,
    y + 6,
    'Competitor',
    competitor?.name ?? labCase.competitorName ?? 'Unknown Competitor'
  );
  drawMetaField(
    col1X,
    y + 17,
    'Linked Lost Order',
    `${labCase.caseId} · ${labCase.customer} (${formatCurrency(labCase.orderValue)})`
  );
  drawMetaField(
    col2X,
    y + 17,
    'Loss Reason & Date',
    `${(labCase.lossReason || '—').toUpperCase()} · ${formatShortDate(labCase.orderDate)}`
  );
  drawMetaField(
    col1X,
    y + 27,
    'Sample Intake / Qty',
    `${labCase.receivedQty ?? labCase.qtyNeeded ?? 1} unit(s) · Tested by ${labCase.testedBy || 'Lab Team'}`
  );
  drawMetaField(
    col2X,
    y + 27,
    'Spec Compliance Score',
    summary.passRate !== null
      ? `${summary.passRate}% (${summary.passedCount}/${summary.measuredCount} Parameters Passed)`
      : 'Not yet benchmarked'
  );

  y += 42;

  // Verdict Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Executive Engineering Verdict', margin, y);
  y += 5;

  const verdictLines = doc.splitTextToSize(verdict, contentWidth - 8);
  const verdictHeight = Math.max(18, verdictLines.length * 4.8 + 8);
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentWidth, verdictHeight, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text(verdictLines, margin + 4, y + 6);
  y += verdictHeight + 10;

  // Parameter Comparison Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Parameter-by-Parameter Comparison', margin, y);
  y += 5;

  const colWidths = [48, 28, 28, 30, 22, 24];
  const headers = ['Parameter', 'Allowed Range', 'Our Standard', 'Competitor', 'Diff %', 'Result'];

  const drawTableHeader = (startY: number) => {
    doc.setFillColor(15, 23, 42);
    doc.rect(margin, startY, contentWidth, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    let cx = margin + 2;
    headers.forEach((h, idx) => {
      doc.text(h, cx, startY + 5.4);
      cx += colWidths[idx];
    });
    return startY + 8;
  };

  y = drawTableHeader(y);

  rows.forEach((row, index) => {
    if (y > 260) {
      doc.addPage();
      y = 20;
      y = drawTableHeader(y);
    }

    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, 8.5, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + 8.5, margin + contentWidth, y + 8.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);

    let cx = margin + 2;
    doc.text(`${row.name} (${row.unit})`.slice(0, 28), cx, y + 5.6);
    cx += colWidths[0];

    doc.setFont('courier', 'normal');
    doc.text(`${row.minValue} - ${row.maxValue}`, cx, y + 5.6);
    cx += colWidths[1];

    doc.text(`${row.ourStandardValue} ${row.unit}`, cx, y + 5.6);
    cx += colWidths[2];

    doc.text(
      row.measuredValue !== null ? `${row.measuredValue} ${row.unit}` : 'Pending',
      cx,
      y + 5.6
    );
    cx += colWidths[3];

    if (row.diffPercent !== null) {
      doc.text(`${row.diffPercent > 0 ? '+' : ''}${row.diffPercent}%`, cx, y + 5.6);
    } else {
      doc.text('—', cx, y + 5.6);
    }
    cx += colWidths[4];

    doc.setFont('helvetica', 'bold');
    if (row.passed === true) {
      doc.setTextColor(21, 128, 61);
      doc.text('PASS', cx, y + 5.6);
    } else if (row.passed === false) {
      doc.setTextColor(190, 18, 60);
      doc.text('FAIL', cx, y + 5.6);
    } else {
      doc.setTextColor(100, 116, 139);
      doc.text('PENDING', cx, y + 5.6);
    }

    y += 8.5;
  });

  y += 12;
  if (y > 255) {
    doc.addPage();
    y = 25;
  }

  // Condition notes & Manager Approval Block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('3. Sample Condition & Manager Sign-Off', margin, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const condLines = doc.splitTextToSize(
    `Intake Condition: ${labCase.condition || '—'} · ${labCase.conditionNotes || 'No remarks recorded.'}`,
    contentWidth
  );
  doc.text(condLines, margin, y);
  y += condLines.length * 4.5 + 6;

  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, contentWidth, 22, 'D');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`Approval State: ${labCase.approvalStatus}`, margin + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    labCase.approvedBy
      ? `Signed off by ${labCase.approvedBy} (${formatShortDate(labCase.actual5 || '')})`
      : 'Awaiting manager authorization review.',
    margin + 4,
    y + 13
  );
  if (labCase.managerComment) {
    doc.text(`Note: ${labCase.managerComment.slice(0, 95)}`, margin + 4, y + 18.5);
  }

  doc.save(`${sampleLabel}_Benchmark_Report.pdf`);
}
