import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { PurchaseOrder, Vendor, VendorAddress } from "../types";
import { COMPANY_CONFIG } from "../constants";
import { getImageUrl } from "./imageUtils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const formatDisplayDate = (dateStr?: string) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
};

// Not-yet-approved POs have no poNumber — fall back to a stable, non-colliding
// filename base derived from the record's own id.
const exportFileBase = (po: PurchaseOrder): string =>
  po.poNumber || `PO-Draft-${String(po.id || "").slice(-6) || Date.now()}`;

const formatVendorAddress = (addr?: VendorAddress): string => {
  if (!addr) return "";
  return [addr.address1, addr.address2, [addr.city, addr.state, addr.pinCode].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(", ");
};

// ---------- Amount in words (Indian numbering) ----------
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const twoDigitsToWords = (n: number): string => {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
};

const threeDigitsToWords = (n: number): string => {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  let str = "";
  if (hundred) str += `${ONES[hundred]} Hundred`;
  if (rest) str += `${hundred ? " and " : ""}${twoDigitsToWords(rest)}`;
  return str;
};

export const numberToWordsIndian = (amount: number): string => {
  const n = Math.floor(Math.abs(amount || 0));
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundred = n % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${threeDigitsToWords(crore)} Crore`);
  if (lakh) parts.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (hundred) parts.push(threeDigitsToWords(hundred));
  return parts.join(" ").trim();
};

// ---------- Line item computation (shared by PDF + Excel) ----------
interface POLineItem {
  siNo: number;
  productCode: string;
  hsn: string;
  description: string;
  color: string;
  qty: number;
  mrp: number;
  rate: number;
  taxRatePct: number;
  taxableValue: number;
  taxAmount: number;
  amount: number;
  imageUrl: string;
}

const buildPOLineItems = (po: PurchaseOrder): POLineItem[] => {
  const rows: POLineItem[] = [];
  let siNo = 0;

  po.items.filter((item) => item.itemName?.trim() && item.sku?.trim()).forEach((item) => {
    const parts = item.itemName.split("-").map((p) => p.trim());
    const description = parts[0] || item.itemName;
    const color = item.color || (parts.length > 1 ? parts[1] : "");
    const hsn = item.itemTaxCode || "";
    const taxRatePct = item.taxRate || 0;

    let sizeMap: Record<string, { qty: number; sku: string }> = {};
    if (item.sizeMap) {
      if (typeof (item.sizeMap as any).get === "function") {
        (item.sizeMap as any).forEach((v: any, k: string) => { sizeMap[k] = v; });
      } else {
        sizeMap = item.sizeMap as any;
      }
    }
    // mrp/basePrice are stored per carton (24 pairs); rows below are per pair.
    const mrpPerPair = (item.mrp || 0) / 24;
    const ratePerPair = (item.basePrice || 0) / 24;
    const validSizes = Object.entries(sizeMap).filter(([, d]) => d && d.qty > 0);

    const pushRow = (productCode: string, qty: number) => {
      siNo += 1;
      const taxableValue = qty * ratePerPair;
      const taxAmount = taxableValue * (taxRatePct / 100);
      rows.push({
        siNo,
        productCode,
        hsn,
        description,
        color,
        qty,
        mrp: mrpPerPair,
        rate: ratePerPair,
        taxRatePct,
        taxableValue,
        taxAmount,
        amount: taxableValue + taxAmount,
        imageUrl: item.image || "",
      });
    };

    if (validSizes.length > 0) {
      // sizeMap qty already reflects the final per-size pair count.
      validSizes.forEach(([, data]) => {
        pushRow(data.sku || item.sku, data.qty || 0);
      });
    } else {
      pushRow(item.sku, item.quantity);
    }
  });

  return rows;
};

const summarizeLineItems = (rows: POLineItem[]) => ({
  totalQty: rows.reduce((s, r) => s + r.qty, 0),
  totalTaxable: rows.reduce((s, r) => s + r.taxableValue, 0),
  totalTax: rows.reduce((s, r) => s + r.taxAmount, 0),
  totalAmount: rows.reduce((s, r) => s + r.amount, 0),
});

const resolveGstLabel = (po: PurchaseOrder): string =>
  po.items.some((i) => i.taxType === "IGST") ? "IGST" : "GST";

// ---------- Image loading (fetched once, reused across rows/exports) ----------
interface ResolvedImage { dataUrl: string; w: number; h: number }
const imageCache = new Map<string, ResolvedImage | null>();

const loadImageAsPngDataUrl = (url: string, maxDim = 160): Promise<ResolvedImage | null> => {
  if (!url) return Promise.resolve(null);
  if (imageCache.has(url)) return Promise.resolve(imageCache.get(url) as ResolvedImage | null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { imageCache.set(url, null); resolve(null); return; }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const result: ResolvedImage = { dataUrl: canvas.toDataURL("image/png"), w, h };
        imageCache.set(url, result);
        resolve(result);
      } catch {
        imageCache.set(url, null);
        resolve(null);
      }
    };
    img.onerror = () => { imageCache.set(url, null); resolve(null); };
    img.src = url;
  });
};

const resolveRowImages = async (rows: POLineItem[]): Promise<(ResolvedImage | null)[]> => {
  const uniqueUrls = Array.from(new Set(rows.map((r) => r.imageUrl).filter(Boolean).map((u) => getImageUrl(u))));
  await Promise.all(uniqueUrls.map((u) => loadImageAsPngDataUrl(u)));
  return rows.map((r) => (r.imageUrl ? imageCache.get(getImageUrl(r.imageUrl)) || null : null));
};

// ---------- PDF export ----------
export const exportPOToPDF = async (
  po: PurchaseOrder,
  vendor?: Vendor,
  opts?: { isBill?: boolean }
) => {
  const isBill = opts?.isBill ?? !!(po as any).billStatus;
  const doc = new jsPDF("portrait", "pt", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 32;

  const gstLabel = resolveGstLabel(po);
  const lineItems = buildPOLineItems(po);
  const totals = summarizeLineItems(lineItems);
  const rowImages = await resolveRowImages(lineItems);

  const billingAddrLine = formatVendorAddress(vendor?.billingAddress) || "-";
  const shippingAddrLine = formatVendorAddress(vendor?.shippingAddress) || billingAddrLine;
  const brand = po.items.find((i) => i.skuCompany)?.skuCompany || vendor?.brand || COMPANY_CONFIG.brand || "-";

  autoTable(doc, {
    startY: 28,
    margin: { left: margin, right: margin },
    theme: "plain",
    styles: { halign: "center", fontStyle: "bold", fontSize: 14, textColor: [0, 0, 0] },
    body: [[isBill ? "Proforma Invoice / Bill" : "Purchase Order"]],
  });

  const labelStyle = { fontStyle: "bold" as const, fillColor: [240, 245, 240] as [number, number, number] };
  const midLabelStyle = { fontStyle: "bold" as const };

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 4,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 4, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.5, valign: "middle" },
    columnStyles: { 0: { cellWidth: 78 }, 1: { cellWidth: 140 }, 2: { cellWidth: 70 }, 3: { cellWidth: 105 }, 4: { cellWidth: 60 }, 5: { cellWidth: "auto" } },
    body: [
      [{ content: "Purchaser", styles: labelStyle }, COMPANY_CONFIG.name, { content: "PO Number", styles: midLabelStyle }, po.poNumber || "Pending Approval", { content: "PO Date", styles: midLabelStyle }, formatDisplayDate(po.date)],
      [{ content: "Purchaser GSTIN", styles: labelStyle }, COMPANY_CONFIG.gst, { content: "Delivery Date", styles: midLabelStyle }, formatDisplayDate(po.deliveryDate), { content: "Expiry Date", styles: midLabelStyle }, "-"],
      [{ content: "Purchaser Address", styles: labelStyle }, COMPANY_CONFIG.invoiceTo, { content: "Reference #", styles: midLabelStyle }, po.referenceNumber || "-", { content: "Payment Terms", styles: midLabelStyle }, po.paymentTerms || "-"],
      [{ content: "Vendor", styles: labelStyle }, vendor?.companyName || vendor?.displayName || po.vendorName, { content: "Vendor Code", styles: midLabelStyle }, vendor?.vendorCode || "-", { content: "Vendor GSTIN", styles: midLabelStyle }, vendor?.gstNumber || "-"],
      [{ content: "Vendor Address", styles: labelStyle }, billingAddrLine, { content: "Ship To", styles: midLabelStyle }, shippingAddrLine, { content: "Vendor Phone", styles: midLabelStyle }, vendor?.billingAddress?.phone || vendor?.mobile || vendor?.workPhone || "-"],
      [{ content: "Brand", styles: labelStyle }, brand, { content: "Total Qty", styles: midLabelStyle }, totals.totalQty.toString(), { content: "Total Value (INR)", styles: midLabelStyle }, totals.totalAmount.toFixed(2)],
      ...((po as any).billRemark ? [[{ content: "Bill Remark", styles: labelStyle }, (po as any).billRemark, "", "", "", ""]] : []),
    ],
  });

  const footRows: any[] = [];
  footRows.push([
    { content: "Logistic Charges", colSpan: 10, styles: { halign: "right", fontStyle: "bold" } },
    { content: "0.00", styles: { halign: "right" } },
  ]);
  if (po.discountAmount) {
    footRows.push([
      { content: `Discount (${po.discountPercent || 0}%)`, colSpan: 10, styles: { halign: "right", fontStyle: "bold" } },
      { content: `-${po.discountAmount.toFixed(2)}`, styles: { halign: "right" } },
    ]);
  }
  footRows.push([
    { content: "Total", colSpan: 3, styles: { halign: "center", fontStyle: "bold", fillColor: [240, 245, 240] } },
    { content: totals.totalQty.toString(), styles: { halign: "center", fontStyle: "bold", fillColor: [240, 245, 240] } },
    { content: "", styles: { fillColor: [240, 245, 240] } },
    { content: "", styles: { fillColor: [240, 245, 240] } },
    { content: "", styles: { fillColor: [240, 245, 240] } },
    { content: "", styles: { fillColor: [240, 245, 240] } },
    { content: totals.totalTaxable.toFixed(2), styles: { halign: "right", fontStyle: "bold", fillColor: [240, 245, 240] } },
    { content: totals.totalTax.toFixed(2), styles: { halign: "right", fontStyle: "bold", fillColor: [240, 245, 240] } },
    { content: totals.totalAmount.toFixed(2), styles: { halign: "right", fontStyle: "bold", fillColor: [240, 245, 240] } },
  ]);

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 3, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.5, valign: "middle", halign: "center", overflow: "linebreak", minCellHeight: 34 },
    headStyles: { fillColor: [240, 245, 240], textColor: [0, 0, 0], fontStyle: "bold", fontSize: 7, halign: "center", valign: "middle" },
    footStyles: { fontSize: 7.5, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.5 },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 58, halign: "left" },
      2: { cellWidth: 52, halign: "left" },
      3: { cellWidth: 28 },
      4: { cellWidth: 42 },
      5: { cellWidth: 32, halign: "right" },
      6: { cellWidth: 32, halign: "right" },
      7: { cellWidth: 42, halign: "left" },
      8: { cellWidth: 55, halign: "right" },
      9: { cellWidth: 58, halign: "right" },
      10: { cellWidth: "auto", halign: "right" },
    },
    head: [["SI No.", "Product\nCode", "Description\nof Goods", "QTY", "Image", "MRP", "Rate", "Color", "Taxable\nValue", `${gstLabel}\nAmount`, "Amount"]],
    body: lineItems.map((r) => [
      r.siNo,
      `${r.productCode}\nHSN: ${r.hsn}`,
      r.description,
      r.qty,
      "",
      r.mrp.toFixed(2),
      r.rate.toFixed(2),
      r.color,
      r.taxableValue.toFixed(2),
      `${r.taxAmount.toFixed(2)}\n(${r.taxRatePct.toFixed(2)}%)`,
      r.amount.toFixed(2),
    ]),
    foot: footRows,
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 4) {
        const img = rowImages[data.row.index];
        if (img) {
          const boxW = data.cell.width - 6;
          const boxH = data.cell.height - 6;
          const scale = Math.min(boxW / img.w, boxH / img.h, 1);
          const w = img.w * scale;
          const h = img.h * scale;
          const x = data.cell.x + (data.cell.width - w) / 2;
          const y = data.cell.y + (data.cell.height - h) / 2;
          try { doc.addImage(img.dataUrl, "PNG", x, y, w, h); } catch { /* skip unreadable image */ }
        }
      }
    },
  });

  let y = (doc as any).lastAutoTable.finalY + 16;
  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 40) { doc.addPage(); y = 40; }
  };

  ensureSpace(24);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Amount Chargeable (in words):", margin, y);
  doc.text("E. & O.E", pageWidth - margin, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  const wordsText = `INR ${numberToWordsIndian(totals.totalAmount)} Only`;
  const wordsLines = doc.splitTextToSize(wordsText, pageWidth - margin * 2 - 120);
  doc.text(wordsLines, margin, y + 12);
  y += 12 + wordsLines.length * 11 + 10;

  ensureSpace(14);
  doc.text("Tax is payable on reverse charge basis: No", margin, y);
  y += 24;

  ensureSpace(50);
  doc.setFont("helvetica", "bold");
  doc.text(`For ${COMPANY_CONFIG.name}`, pageWidth - margin, y, { align: "right" });
  y += 34;
  doc.text("Authorised Signatory", pageWidth - margin, y, { align: "right" });
  y += 22;

  ensureSpace(14);
  doc.setFont("helvetica", "bold");
  doc.text("Payment Terms:", margin, y);
  doc.setFont("helvetica", "normal");
  doc.text(po.paymentTerms || "-", margin + 78, y);
  y += 16;

  if (po.notes) {
    ensureSpace(14);
    doc.setFont("helvetica", "bold");
    doc.text("Remarks:", margin, y);
    doc.setFont("helvetica", "normal");
    const noteLines = doc.splitTextToSize(po.notes, pageWidth - margin * 2 - 60);
    doc.text(noteLines, margin + 55, y);
    y += noteLines.length * 11 + 8;
  }

  if (po.termsAndConditions) {
    ensureSpace(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Terms and Conditions:", margin, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const tcLines: string[] = doc.splitTextToSize(po.termsAndConditions, pageWidth - margin * 2);
    tcLines.forEach((line: string) => {
      ensureSpace(11);
      doc.text(line, margin, y);
      y += 11;
    });
  }

  doc.save(`${exportFileBase(po)}.pdf`);
};

// ---------- Excel export ----------
export const exportOrderToExcel = async (po: PurchaseOrder, vendor?: Vendor) => {
  const isBill = !!(po as any).billStatus;
  const gstLabel = resolveGstLabel(po);
  const lineItems = buildPOLineItems(po);
  const totals = summarizeLineItems(lineItems);
  const rowImages = await resolveRowImages(lineItems);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(isBill ? "Bill" : "Purchase Order");

  const COLUMN_COUNT = 13;
  worksheet.columns = [
    { header: "SI No.", key: "siNo", width: 8 },
    { header: "Product Code", key: "productCode", width: 22 },
    { header: "HSN", key: "hsn", width: 14 },
    { header: "Description of Goods", key: "description", width: 26 },
    { header: "QTY", key: "qty", width: 10 },
    { header: "Image", key: "image", width: 14 },
    { header: "MRP (₹)", key: "mrp", width: 12 },
    { header: "Rate (₹)", key: "rate", width: 12 },
    { header: "Color", key: "color", width: 18 },
    { header: "Taxable Value (₹)", key: "taxableValue", width: 18 },
    { header: `${gstLabel} (%)`, key: "gstPercent", width: 12 },
    { header: `${gstLabel} Amount (₹)`, key: "gstAmount", width: 16 },
    { header: "Amount (₹)", key: "amount", width: 16 },
  ];

  const titleRow = worksheet.insertRow(1, [isBill ? "PROFORMA INVOICE / BILL" : "PURCHASE ORDER"]);
  titleRow.font = { size: 18, bold: true, color: { argb: "FF000000" } };
  worksheet.mergeCells(1, 1, 1, COLUMN_COUNT);
  titleRow.alignment = { horizontal: "center", vertical: "middle" };
  titleRow.height = 35;

  const addHeaderInfo = (rowIdx: number, label1: string, val1: any, label2: string, val2: any, label3: string, val3: any) => {
    const row = worksheet.insertRow(rowIdx, [label1, val1, "", label2, val2, "", label3, val3]);
    row.font = { bold: false, size: 10 };
    row.getCell(1).font = { bold: true };
    row.getCell(4).font = { bold: true };
    row.getCell(7).font = { bold: true };
    worksheet.mergeCells(rowIdx, 1, rowIdx, 1);
    worksheet.mergeCells(rowIdx, 2, rowIdx, 3);
    worksheet.mergeCells(rowIdx, 4, rowIdx, 4);
    worksheet.mergeCells(rowIdx, 5, rowIdx, 6);
    worksheet.mergeCells(rowIdx, 7, rowIdx, 7);
    worksheet.mergeCells(rowIdx, 8, rowIdx, COLUMN_COUNT);
    row.height = 20;
    return row;
  };

  const billingAddrLine = formatVendorAddress(vendor?.billingAddress) || "-";
  const shippingAddrLine = formatVendorAddress(vendor?.shippingAddress) || billingAddrLine;
  const brand = po.items.find((i) => i.skuCompany)?.skuCompany || vendor?.brand || COMPANY_CONFIG.brand || "-";

  addHeaderInfo(2, "Purchaser", COMPANY_CONFIG.name, "PO Number", po.poNumber || "Pending Approval", "PO Date", formatDisplayDate(po.date));
  addHeaderInfo(3, "Purchaser GSTIN", COMPANY_CONFIG.gst, "Delivery Date", formatDisplayDate(po.deliveryDate), "Expiry Date", "-");
  addHeaderInfo(4, "Purchaser Address", COMPANY_CONFIG.invoiceTo, "Reference #", po.referenceNumber || "-", "Payment Terms", po.paymentTerms || "-");
  addHeaderInfo(5, "Vendor", vendor?.companyName || vendor?.displayName || po.vendorName, "Vendor Code", vendor?.vendorCode || "-", "Vendor GSTIN", vendor?.gstNumber || "-");
  addHeaderInfo(6, "Vendor Address", billingAddrLine, "Ship To", shippingAddrLine, "Vendor Phone", vendor?.billingAddress?.phone || vendor?.mobile || vendor?.workPhone || "-");
  addHeaderInfo(7, "Brand", brand, "Total Qty", totals.totalQty, "Total Value (₹)", totals.totalAmount.toFixed(2));

  worksheet.addRow([]);

  const HEADER_ROW = 9;
  const tableHeaderRow = worksheet.getRow(HEADER_ROW);
  tableHeaderRow.values = ["SI No.", "Product Code", "HSN", "Description of Goods", "QTY", "Image", "MRP (₹)", "Rate (₹)", "Color", "Taxable Value (₹)", `${gstLabel} (%)`, `${gstLabel} Amount (₹)`, "Amount (₹)"];
  tableHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  tableHeaderRow.height = 25;
  tableHeaderRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "medium" }, right: { style: "thin" } };
  });

  const IMAGE_COL_INDEX0 = 5; // 0-based column index of "Image"
  lineItems.forEach((r, idx) => {
    const row = worksheet.addRow({
      siNo: r.siNo, productCode: r.productCode, hsn: r.hsn, description: r.description, qty: r.qty,
      image: "", mrp: r.mrp, rate: r.rate, color: r.color, taxableValue: r.taxableValue,
      gstPercent: r.taxRatePct, gstAmount: r.taxAmount, amount: r.amount,
    });

    const img = rowImages[idx];
    if (img) {
      row.height = 48;
      const imageId = workbook.addImage({ base64: img.dataUrl, extension: "png" });
      const aspect = img.w / img.h;
      const boxH = 44;
      const boxW = Math.min(60, boxH * aspect);
      worksheet.addImage(imageId, {
        tl: { col: IMAGE_COL_INDEX0 + 0.05, row: row.number - 1 + 0.05 },
        ext: { width: boxW, height: boxH },
      } as any);
    }
  });

  worksheet.addRow([]);
  const addSummaryRow = (label: string, value: any) => {
    const row = worksheet.addRow(["", "", "", "", "", "", "", "", "", "", label, "", value]);
    row.font = { bold: true };
    worksheet.mergeCells(row.number, 10, row.number, 11);
    row.getCell(10).alignment = { horizontal: "right" };
    row.getCell(13).alignment = { horizontal: "right" };
    return row;
  };

  addSummaryRow("Logistic Charges (₹)", "0.00");
  if (po.discountAmount) addSummaryRow(`Discount (${po.discountPercent || 0}%) (₹)`, `-${po.discountAmount.toFixed(2)}`);
  addSummaryRow("Total Taxable Value (₹)", totals.totalTaxable.toFixed(2));
  addSummaryRow(`Total ${gstLabel} (₹)`, totals.totalTax.toFixed(2));
  const finalRow = addSummaryRow("TOTAL AMOUNT (₹)", totals.totalAmount.toFixed(2));
  finalRow.font = { bold: true, size: 12 };

  const wordsRow = worksheet.addRow(["Amount Chargeable (in words):", `INR ${numberToWordsIndian(totals.totalAmount)} Only`]);
  wordsRow.font = { bold: true, size: 10 };
  worksheet.mergeCells(wordsRow.number, 2, wordsRow.number, COLUMN_COUNT);

  worksheet.addRow([]);
  const paymentRow = worksheet.addRow(["Payment Terms:", po.paymentTerms || "-"]);
  paymentRow.getCell(1).font = { bold: true };
  worksheet.mergeCells(paymentRow.number, 2, paymentRow.number, COLUMN_COUNT);

  if (po.notes) {
    const notesRow = worksheet.addRow(["Remarks:", po.notes]);
    notesRow.getCell(1).font = { bold: true };
    worksheet.mergeCells(notesRow.number, 2, notesRow.number, COLUMN_COUNT);
  }

  if (po.termsAndConditions) {
    const tcHeaderRow = worksheet.addRow(["Terms and Conditions:"]);
    tcHeaderRow.getCell(1).font = { bold: true };
    const tcRow = worksheet.addRow([po.termsAndConditions]);
    worksheet.mergeCells(tcRow.number, 1, tcRow.number, COLUMN_COUNT);
    tcRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
  }

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < HEADER_ROW) return;
    if (rowNumber > HEADER_ROW + lineItems.length) return;
    row.eachCell((cell) => {
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  saveAs(blob, `${exportFileBase(po)}.xlsx`);
};
