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
  invoiceTo: "INNOVATIVE LIFESTYLE TECHNOLOGY PRIVATE LIMITED, First Floor, M-24, Block-M, Badli Industrial Area Phase 1, GATE NO-4, New Delhi, North Delhi, Delhi, 110042",
  shipTo: "419/1, Village mundka, Near Under Pass, Mundka, New Delhi, West Delhi, 110041"
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

export const exportPOToPDF = (po: PurchaseOrder, vendor?: Vendor) => {
  const doc = new jsPDF("portrait", "pt", "a4");

  // Font setup
  // doc.setFont("helvetica");

  // Logo text - substitute for image if image isn't available
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(110, 190, 150); // greenish 'yoho' color from image
  doc.text("yoho", 40, 40);

  doc.setTextColor(0, 0, 0); // reset color

  // We construct the info table
  const vendorAddress = vendor 
    ? [
        vendor.billingAddress?.address1,
        vendor.billingAddress?.address2,
        vendor.billingAddress?.city,
        vendor.billingAddress?.state,
        vendor.billingAddress?.pinCode
      ].filter(Boolean).join(", ") 
    : "";

  const poDate = formatDate(po.date);
  const deliveryDate = formatDate(po.deliveryDate);
  // Estimate an expiry date if none exists, else just leave blank if our schema lacks it
  const expiryDate = ""; 

  // Calculate total order qty 
  const totalQty = po.items.reduce((sum, item) => sum + item.quantity, 0);

  const topTableData = [
    [
      { content: "Company Name", styles: { fontStyle: "bold", fillColor: [240, 245, 240] } },
      vendor?.companyName || vendor?.displayName || COMPANY_INFO.name,
      { content: "Vendor Name", styles: { fontStyle: "bold" } },
      vendor?.displayName || po.vendorName,
      { content: "PO Number", styles: { fontStyle: "bold" } },
      po.poNumber
    ],
    [
      { content: "CIN No.", styles: { fontStyle: "bold", fillColor: [240, 245, 240] } },
      vendor?.cinNumber || COMPANY_INFO.cin,
      { content: "Vendor Code", styles: { fontStyle: "bold" } },
      vendor?.vendorCode || "",
      { content: "PO Date", styles: { fontStyle: "bold" } },
      poDate
    ],
    [
      { content: "GST No.", styles: { fontStyle: "bold", fillColor: [240, 245, 240] } },
      vendor?.gstNumber || COMPANY_INFO.gst,
      { content: "Brand", styles: { fontStyle: "bold" } },
      vendor?.brand || COMPANY_INFO.brand,
      { content: "Delivery Date", styles: { fontStyle: "bold" } },
      deliveryDate
    ],
    [
      { content: "PAN No.", styles: { fontStyle: "bold", fillColor: [240, 245, 240] } },
      vendor?.pan || COMPANY_INFO.pan,
      { content: "Total Value INR", styles: { fontStyle: "bold", fillColor: [240, 245, 240] } },
      po.total.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      { content: "Total Order Qty.", styles: { fontStyle: "bold", fillColor: [240, 245, 240] } },
      totalQty.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    ],
    [
      { content: "Invoice To", styles: { fontStyle: "bold", fillColor: [240, 245, 240] } },
      vendorAddress || COMPANY_INFO.invoiceTo,
      { content: "Vendor address", styles: { fontStyle: "bold" } },
      vendorAddress,
      { content: "PO Expiry Date", styles: { fontStyle: "bold" } },
      expiryDate
    ],
    [
      { content: "Ship To", styles: { fontStyle: "bold", fillColor: [240, 245, 240] } },
      vendorAddress || COMPANY_INFO.shipTo,
      { content: "Contact Person", styles: { fontStyle: "bold" } },
      vendor?.displayName || "",
      { content: "Phone", styles: { fontStyle: "bold" } },
      vendor?.mobile || vendor?.workPhone || ""
    ]
  ];

  // Draw the Title matching top block
  autoTable(doc, {
    startY: 20,
    margin: { left: 40, right: 40 },
    theme: "plain",
    styles: { cellPadding: 5, fontSize: 10, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.5 },
    body: [
      [
        { content: "yoho", styles: { halign: "left", fontSize: 16, fontStyle: "bold", textColor: [110, 190, 150] } },
        { content:vendor?.companyName || COMPANY_INFO.name, styles: { halign: "center", fontStyle: "bold", fontSize: 11 } },
        { content: "Purchase Order", styles: { halign: "left", fontSize: 14, fontStyle: "bold", fillColor: [240, 245, 240] } }
      ]
    ],
    columnStyles: {
      0: { cellWidth: 100 },
      1: { cellWidth: 250 },
      2: { cellWidth: 'auto' }
    }
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
      valign: "middle"
    },
    columnStyles: {
      0: { cellWidth: 80, fontStyle: "bold" },
      1: { cellWidth: 140 }, // Expanded for address and company name
      2: { cellWidth: 80, fontStyle: "bold" },
      3: { cellWidth: 120 }, // Vendor value
      4: { cellWidth: 60, fontStyle: "bold" },
      5: { cellWidth: 'auto' } // Last col
    },
    body: topTableData as any
  });

  // Table Data Mapping
  // EAN | HSN | STYLE NAME | STYLE NO. | SKU | MARKETED COLOR | GENDER | MRP | PO QTY | UNIT PRICE | TOTAL W/O GST | GST (%) | TOTAL VALUE
  // Table Data Mapping - Flattening by size
  const itemRows: any[] = [];
  
  po.items.forEach(item => {
    // Robustly extract style and color
    // itemName is often "Style-Color-Range" or "Brand - Style - Color"
    const parts = item.itemName.split("-").map(p => p.trim());
    const masterName = parts[0] || ""; // e.g. "Urban"
    const styleBase = parts.slice(0, 2).join("-"); // e.g. "Urban-Red"
    const styleNo = styleBase; 
    const color = parts.length > 1 ? parts[1] : "";
    const gender = "M";

    // Handle potential Map types or plain objects more safely
    let sizeMap: any = {};
    if (item.sizeMap) {
      if (typeof (item.sizeMap as any).get === 'function') {
        // It's likely a Map
        (item.sizeMap as any).forEach((v: any, k: string) => {
          sizeMap[k] = v;
        });
      } else {
        sizeMap = item.sizeMap;
      }
    }

    const sizeEntries = Object.entries(sizeMap);
    const validSizes = sizeEntries.filter(([_, data]: [string, any]) => data && data.qty > 0);

    if (validSizes.length > 0) {
      // Create a row for each size in the sizeMap with qty > 0
      validSizes.forEach(([size, data]: [string, any]) => {
        const totalWoGst = data.qty * item.basePrice;
        const totalValue = totalWoGst + (totalWoGst * item.taxRate / 100);
        
        // styleName should be master name + size
        const rowStyleName = `${masterName}-${size}`;
        // SKU as urban-red-4 (styleBase + size)
        const rowSku = data.sku || `${styleBase}-${size}`;

        itemRows.push([
          "",                          // EAN (empty per user request)
          item.itemTaxCode || "",      // HSN
          rowStyleName,                // STYLE NAME
          styleNo,                     // STYLE NO.
          rowSku,                      // SKU
          color,                       // MARKETED COLOR
          gender,                      // GENDER
          item.mrp.toFixed(1),         // MRP
          data.qty.toFixed(1),         // PO QTY
          item.basePrice.toFixed(1),   // UNIT PRICE
          totalWoGst.toFixed(2),       // TOTAL W/O GST
          item.taxRate.toFixed(1),     // GST (%)
          totalValue.toFixed(2)        // TOTAL VALUE
        ]);
      });
    } else {
      // Fallback: original row if no sizes found
      const totalWoGst = item.quantity * item.basePrice;
      itemRows.push([
        "", // EAN
        item.itemTaxCode || "",
        item.itemName,
        styleNo,
        item.sku,
        color,
        gender,
        item.mrp.toFixed(1),
        item.quantity.toFixed(1),
        item.basePrice.toFixed(1),
        totalWoGst.toFixed(2),
        item.taxRate.toFixed(1),
        item.unitTotal.toFixed(2)
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
      valign: "middle"
    },
    styles: {
      fontSize: 6.5,
      cellPadding: 2,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.5,
      halign: "center",
      valign: "middle",
      overflow: "linebreak"
    },
    columnStyles: {
      0: { cellWidth: 25 }, // EAN (narrower since empty)
      1: { cellWidth: 35 }, // HSN
      2: { cellWidth: 70.28, halign: "left" }, // STYLE NAME (adjusted to align total width to 515.28)
      3: { cellWidth: 55 }, // STYLE NO
      4: { cellWidth: 55 }, // SKU
      5: { cellWidth: 40 }, // COLOR
      6: { cellWidth: 25 }, // GENDER
      7: { cellWidth: 30 }, // MRP
      8: { cellWidth: 30, fontStyle: "bold" }, // PO QTY
      9: { cellWidth: 35 }, // UNIT PRICE
      10: { cellWidth: 40 }, // TOTAL W/O GST
      11: { cellWidth: 25 }, // GST %
      12: { cellWidth: 50 }  // TOTAL VALUE (slightly wider)
    },
    head: [[
      "EAN", "HSN", "STYLE\nNAME", "STYLE\nNO.", "SKU", "MARKETED\nCOLOR", 
      "GENDER", "MRP", "PO QTY", "UNIT\nPRICE", "TOTAL\nW/O GST", "GST (%)", "TOTAL\nVALUE"
    ]],
    body: itemRows
  });

  // Save the PDF
  doc.save(`${po.poNumber}.pdf`);
};
