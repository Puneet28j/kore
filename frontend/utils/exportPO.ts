import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PurchaseOrder, Vendor } from "../types";

// Constant Company Info based on the user's provided image
const COMPANY_INFO = {
  name: "INNOVATIVE LIFESTYLE TECHNOLOGY PRIVATE LIMITED",
  cin: "U511909DL2020PTC3711873",
  gst: "07AAFC18644A1ZP",
  pan: "AAFC18644A",
  brand: "YOHO",
  invoiceTo:
    "INNOVATIVE LIFESTYLE TECHNOLOGY PRIVATE LIMITED, First Floor, M-24, Block-M, Badli Industrial Area Phase 1, GATE NO-4, New Delhi, North Delhi, Delhi, 110042",
  shipTo:
    "419/1, Village mundka, Near Under Pass, Mundka, New Delhi, West Delhi, 110041",
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().split("T")[0]; // YYYY-MM-DD
  } catch (e) {
    return dateStr;
  }
};

export const exportPOToPDF = (
  po: PurchaseOrder,
  vendor?: Vendor,
  opts?: { isBill?: boolean }
) => {
  const isBill = opts?.isBill ?? !!(po as any).billStatus;

  const doc = new jsPDF("portrait", "pt", "a4");

  // We construct the info table
  const vendorAddress = vendor
    ? [
        vendor.billingAddress?.address1,
        vendor.billingAddress?.address2,
        vendor.billingAddress?.city,
        vendor.billingAddress?.state,
        vendor.billingAddress?.pinCode,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  const poDate = formatDate(po.date);
  const deliveryDate = formatDate(po.deliveryDate);
  // Estimate an expiry date if none exists, else just leave blank if our schema lacks it
  const expiryDate = "";

  // Calculate total order qty
  const totalQty = po.items.reduce((sum, item) => sum + item.quantity, 0);

  const topTableData: any[] = [];
  // always output the full PO-style header; vendor object should supply
  // the code/address/contact/phone values (caller must pass it in)
  topTableData.push([
    {
      content: "Company Name",
      styles: { fontStyle: "bold", fillColor: [240, 245, 240] },
    },
    vendor?.companyName || vendor?.displayName || COMPANY_INFO.name,
    { content: "Vendor Name", styles: { fontStyle: "bold" } },
    vendor?.displayName || po.vendorName,
    { content: "PO Number", styles: { fontStyle: "bold" } },
    po.poNumber,
  ]);

  topTableData.push([
    {
      content: "CIN No.",
      styles: { fontStyle: "bold", fillColor: [240, 245, 240] },
    },
    vendor?.cinNumber || COMPANY_INFO.cin,
    { content: "Vendor Code", styles: { fontStyle: "bold" } },
    vendor?.vendorCode || "",
    { content: "PO Date", styles: { fontStyle: "bold" } },
    poDate,
  ]);

  topTableData.push([
    {
      content: "GST No.",
      styles: { fontStyle: "bold", fillColor: [240, 245, 240] },
    },
    vendor?.gstNumber || COMPANY_INFO.gst,
    { content: "Brand", styles: { fontStyle: "bold" } },
    vendor?.brand || COMPANY_INFO.brand,
    { content: "Delivery Date", styles: { fontStyle: "bold" } },
    deliveryDate,
  ]);

  topTableData.push([
    {
      content: "PAN No.",
      styles: { fontStyle: "bold", fillColor: [240, 245, 240] },
    },
    vendor?.pan || COMPANY_INFO.pan,
    {
      content: "Total Value INR",
      styles: { fontStyle: "bold", fillColor: [240, 245, 240] },
    },
    po.total.toLocaleString("en-IN", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
    {
      content: "Total Order Qty.",
      styles: { fontStyle: "bold", fillColor: [240, 245, 240] },
    },
    totalQty.toLocaleString("en-IN", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
  ]);

  topTableData.push([
    {
      content: "Invoice To",
      styles: { fontStyle: "bold", fillColor: [240, 245, 240] },
    },
    vendorAddress || COMPANY_INFO.invoiceTo,
    { content: "Vendor address", styles: { fontStyle: "bold" } },
    vendorAddress,
    { content: "PO Expiry Date", styles: { fontStyle: "bold" } },
    expiryDate,
  ]);

  topTableData.push([
    {
      content: "Ship To",
      styles: { fontStyle: "bold", fillColor: [240, 245, 240] },
    },
    vendorAddress || COMPANY_INFO.shipTo,
    { content: "Contact Person", styles: { fontStyle: "bold" } },
    vendor?.displayName || "",
    { content: "Phone", styles: { fontStyle: "bold" } },
    vendor?.mobile || vendor?.workPhone || "",
  ]);

  // append remark row only if it's a bill with a remark
  if ((po as any).billRemark) {
    topTableData.push([
      {
        content: "Bill Remark",
        styles: { fontStyle: "bold", fillColor: [240, 245, 240] },
      },
      (po as any).billRemark,
      "",
      "",
      "",
      "",
    ]);
  }

  // Draw the Title
  autoTable(doc, {
    startY: 20,
    margin: { left: 40, right: 40 },
    theme: "plain",
    styles: {
      cellPadding: 5,
      fontSize: 10,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.5,
    },
    body: [
      [
        {
          content: vendor?.companyName || COMPANY_INFO.name,
          styles: { halign: "left", fontStyle: "bold", fontSize: 11 },
        },
        {
          content:"Purchase Order",
          styles: {
            halign: "center",
            fontSize: 14,
            fontStyle: "bold",
            fillColor: [240, 245, 240],
          },
        },
        { content: "", styles: { halign: "right" } },
      ],
    ],
    columnStyles: {
      0: { cellWidth: 200 },
      1: { cellWidth: 200 },
      2: { cellWidth: "auto" },
    },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY,
    margin: { left: 40, right: 40 },
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 4,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.5,
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 80, fontStyle: "bold" },
      1: { cellWidth: 140 }, // Expanded for address and company name
      2: { cellWidth: 80, fontStyle: "bold" },
      3: { cellWidth: 120 }, // Vendor value
      4: { cellWidth: 60, fontStyle: "bold" },
      5: { cellWidth: "auto" }, // Last col
    },
    body: topTableData as any,
  });

  // Table Data Mapping
  // EAN | HSN | STYLE NAME | STYLE NO. | SKU | MARKETED COLOR | GENDER | MRP | PO QTY | UNIT PRICE | TOTAL W/O GST | GST (%) | TOTAL VALUE
  // Table Data Mapping - Flattening by size
  const itemRows: any[] = [];

  po.items.forEach((item) => {
    // Robustly extract style and color
    // itemName is often "Style-Color-Range" or "Brand - Style - Color"
    const parts = item.itemName.split("-").map((p) => p.trim());
    const masterName = parts[0] || ""; // e.g. "Urban"
    const styleBase = parts.slice(0, 2).join("-"); // e.g. "Urban-Red"
    const styleNo = styleBase;
    const color = parts.length > 1 ? parts[1] : "";
    const gender = "M";

    // Handle potential Map types or plain objects more safely
    let sizeMap: any = {};
    if (item.sizeMap) {
      if (typeof (item.sizeMap as any).get === "function") {
        // It's likely a Map
        (item.sizeMap as any).forEach((v: any, k: string) => {
          sizeMap[k] = v;
        });
      } else {
        sizeMap = item.sizeMap;
      }
    }

    const cartonCount = item.cartonCount || 1;
    const sizeEntries = Object.entries(sizeMap);
    const validSizes = sizeEntries.filter(
      ([_, data]: [string, any]) => data && data.qty > 0
    );

    if (validSizes.length > 0) {
      // Create a row for each size in the sizeMap with qty > 0
      validSizes.forEach(([size, data]: [string, any]) => {
        const totalQtyForItem = data.qty * cartonCount;
        const totalWoGst = totalQtyForItem * item.basePrice;
        const totalValue = totalWoGst + (totalWoGst * item.taxRate) / 100;

        // styleName should be master name + size
        const rowStyleName = `${masterName}-${size}`;
        // SKU as urban-red-4 (styleBase + size)
        const rowSku = data.sku || `${styleBase}-${size}`;

        const qtyFormula = `${data.qty} x ${cartonCount} = ${totalQtyForItem}`;

        itemRows.push([
          "", // EAN (empty per user request)
          item.itemTaxCode || "", // HSN
          rowStyleName, // STYLE NAME
          styleNo, // STYLE NO.
          rowSku, // SKU
          color, // MARKETED COLOR
          gender, // GENDER
          item.mrp.toFixed(1), // MRP
          qtyFormula, // PO QTY (Now Formula)
          item.basePrice.toFixed(1), // UNIT PRICE
          totalWoGst.toFixed(2), // TOTAL W/O GST
          item.taxRate.toFixed(1), // GST (%)
          totalValue.toFixed(2), // TOTAL VALUE
        ]);
      });
    } else {
      // Fallback: original row if no sizes found
      const totalQtyForItem = item.quantity * cartonCount;
      const totalWoGst = totalQtyForItem * item.basePrice;
      const qtyFormula = `${item.quantity} x ${cartonCount} = ${totalQtyForItem}`;

      itemRows.push([
        "", // EAN
        item.itemTaxCode || "",
        item.itemName,
        styleNo,
        item.sku,
        color,
        gender,
        item.mrp.toFixed(1),
        qtyFormula,
        item.basePrice.toFixed(1),
        totalWoGst.toFixed(2),
        item.taxRate.toFixed(1),
        (totalWoGst + (totalWoGst * item.taxRate) / 100).toFixed(2),
      ]);
    }
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 10,
    margin: { left: 40, right: 40 }, // Resetting to 40 to match the header table exactly
    theme: "grid",
    headStyles: {
      fillColor: [240, 245, 240],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 6.5,
      lineColor: [0, 0, 0],
      lineWidth: 0.5,
      halign: "center",
      valign: "middle",
    },
    styles: {
      fontSize: 6.5,
      cellPadding: 2,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.5,
      halign: "center",
      valign: "middle",
      overflow: "linebreak",
    },
    columnStyles: {
      0: { cellWidth: 25 }, // EAN (narrower since empty)
      1: { cellWidth: 35 }, // HSN
      2: { cellWidth: 45.28, halign: "left" }, // STYLE NAME (reduced to give room to formula)
      3: { cellWidth: 55 }, // STYLE NO
      4: { cellWidth: 55 }, // SKU
      5: { cellWidth: 40 }, // COLOR
      6: { cellWidth: 25 }, // GENDER
      7: { cellWidth: 30 }, // MRP
      8: { cellWidth: 55, fontStyle: "bold" }, // PO QTY (Formula) (expanded from 30)
      9: { cellWidth: 35 }, // UNIT PRICE
      10: { cellWidth: 40 }, // TOTAL W/O GST
      11: { cellWidth: 25 }, // GST %
      12: { cellWidth: 50 }, // TOTAL VALUE (slightly wider)
    },
    head: [
      [
        "EAN",
        "HSN",
        "STYLE\nNAME",
        "STYLE\nNO.",
        "SKU",
        "MARKETED\nCOLOR",
        "GENDER",
        "MRP",
        "PO QTY\n(Asst x Ctn)",
        "UNIT\nPRICE",
        "TOTAL\nW/O GST",
        "GST (%)",
        "TOTAL\nVALUE",
      ],
    ],
    body: itemRows,
  });

  // Save the PDF
  doc.save(`${po.poNumber}.pdf`);
};

/**
 * Export a purchase order or bill to a detailed Excel CSV file with professional formatting.
 * Includes header details, vendor information, item table, and financial summary.
 */
export const exportOrderToExcel = (po: PurchaseOrder, vendor?: Vendor) => {
  const sanitize = (v: any) => {
    if (v === null || v === undefined) return "";
    return String(v).replace(/"/g, '""');
  };

  const isBill = !!(po as any).billStatus;

  const rows: string[][] = [];

  // Title
  rows.push([isBill ? "BILL" : "PURCHASE ORDER"]);
  rows.push([]);

  // Company & Vendor Info Header
  rows.push([
    "Company Name",
    vendor?.companyName || vendor?.displayName || COMPANY_INFO.name,
    "Vendor Name",
    vendor?.displayName || po.vendorName,
    "PO Number",
    po.poNumber,
  ]);
  rows.push([
    "CIN No.",
    vendor?.cinNumber || COMPANY_INFO.cin,
    "Vendor Code",
    vendor?.vendorCode || "",
    "PO Date",
    formatDate(po.date),
  ]);
  rows.push([
    "GST No.",
    vendor?.gstNumber || COMPANY_INFO.gst,
    "Vendor GST",
    vendor?.gstNumber || "",
    "Delivery Date",
    formatDate(po.deliveryDate),
  ]);
  rows.push([
    "PAN No.",
    vendor?.pan || COMPANY_INFO.pan,
    "Vendor PAN",
    vendor?.pan || "",
    "Total Value (₹)",
    po.total?.toFixed(2) || "—",
  ]);

  const vendorAddress = vendor
    ? [
        vendor.billingAddress?.address1,
        vendor.billingAddress?.address2,
        vendor.billingAddress?.city,
        vendor.billingAddress?.state,
        vendor.billingAddress?.pinCode,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  rows.push([
    "Vendor Address",
    vendorAddress || "",
    "Contact Person",
    vendor?.displayName || "",
    "Phone",
    vendor?.mobile || vendor?.workPhone || "",
  ]);
  rows.push([
    "Brand",
    vendor?.brand || COMPANY_INFO.brand,
    "Payment Terms",
    "",
    "Total Order Qty",
    po.items.reduce((sum, item) => sum + item.quantity, 0).toFixed(1),
  ]);

  // Bill Remark if present
  if ((po as any).billRemark) {
    rows.push(["Bill Remark", (po as any).billRemark, "", "", "", ""]);
  }

  // Empty row for spacing
  rows.push([]);

  // Item Table Header
  rows.push([
    "EAN",
    "HSN",
    "STYLE NAME",
    "STYLE NO.",
    "SKU",
    "MARKETED COLOR",
    "GENDER",
    "MRP (₹)",
    "PO QTY (Asst x Ctn)",
    "UNIT PRICE (₹)",
    "TOTAL W/O GST (₹)",
    "GST (%)",
    "TOTAL VALUE (₹)",
  ]);

  // Item rows
  po.items.forEach((item) => {
    const parts = item.itemName.split("-").map((p) => p.trim());
    const masterName = parts[0] || "";
    const styleBase = parts.slice(0, 2).join("-");
    const color = parts.length > 1 ? parts[1] : "";
    const gender = "M";

    // Handle potential Map types
    let sizeMap: any = {};
    if (item.sizeMap) {
      if (typeof (item.sizeMap as any).get === "function") {
        (item.sizeMap as any).forEach((v: any, k: string) => {
          sizeMap[k] = v;
        });
      } else {
        sizeMap = item.sizeMap;
      }
    }

    const cartonCount = item.cartonCount || 1;
    const sizeEntries = Object.entries(sizeMap);
    const validSizes = sizeEntries.filter(
      ([_, data]: [string, any]) => data && data.qty > 0
    );

    if (validSizes.length > 0) {
      validSizes.forEach(([size, data]: [string, any]) => {
        const totalQtyForItem = data.qty * cartonCount;
        const totalWoGst = totalQtyForItem * item.basePrice;
        const totalValue = totalWoGst + (totalWoGst * item.taxRate) / 100;
        const qtyFormula = `${data.qty} x ${cartonCount} = ${totalQtyForItem}`;
        const rowStyleName = `${masterName}-${size}`;
        const rowSku = data.sku || `${styleBase}-${size}`;

        rows.push([
          "", // EAN
          sanitize(item.itemTaxCode || ""),
          sanitize(rowStyleName),
          sanitize(styleBase),
          sanitize(rowSku),
          sanitize(color),
          sanitize(gender),
          item.mrp.toFixed(2),
          qtyFormula,
          item.basePrice.toFixed(2),
          totalWoGst.toFixed(2),
          item.taxRate.toFixed(1),
          totalValue.toFixed(2),
        ]);
      });
    } else {
      const totalQtyForItem = item.quantity * cartonCount;
      const totalWoGst = totalQtyForItem * item.basePrice;
      const qtyFormula = `${item.quantity} x ${cartonCount} = ${totalQtyForItem}`;

      rows.push([
        "", // EAN
        sanitize(item.itemTaxCode || ""),
        sanitize(item.itemName),
        sanitize(styleBase),
        sanitize(item.sku),
        sanitize(color),
        sanitize(gender),
        item.mrp.toFixed(2),
        qtyFormula,
        item.basePrice.toFixed(2),
        totalWoGst.toFixed(2),
        item.taxRate.toFixed(1),
        (totalWoGst + (totalWoGst * item.taxRate) / 100).toFixed(2),
      ]);
    }
  });

  // Empty row for spacing
  rows.push([]);

  // Summary Section
  rows.push(["SUMMARY"]);
  rows.push(["Sub Total (₹)", po.subTotal?.toFixed(2) || "—"]);
  rows.push(["Discount (%)", po.discountPercent?.toFixed(1) || "—"]);
  rows.push(["Discount Amount (₹)", po.discountAmount?.toFixed(2) || "—"]);
  rows.push(["Total Tax (₹)", po.totalTax?.toFixed(2) || "—"]);
  rows.push(["TOTAL AMOUNT (₹)", po.total?.toFixed(2) || "—"]);

  // convert to CSV text
  const csv = rows
    .map((r) => r.map((c) => `"${sanitize(c)}"`).join(","))
    .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${po.poNumber}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
