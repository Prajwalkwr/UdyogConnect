const PDFDocument = require('pdfkit');
const { buildBillData, formatRs, formatNepalDate } = require('../billing/billData');

const COLORS = {
  navy: '#102341',
  gold: '#F2B71D',
  goldSoft: '#FFF6DB',
  text: '#1F2A3D',
  muted: '#68778C',
  border: '#E5EBF2',
  rowAlt: '#F8FAFC',
  paid: '#059669',
  pending: '#D97706',
  refunded: '#DC2626',
};

const PAGE_MARGIN = 40;
const FOOTER_HEIGHT = 70;

// Built-in PDF fonts only cover Latin-1; anything else would render as broken glyphs.
const pdfSafe = (value) => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');

function statusColor(status) {
  return COLORS[status] || COLORS.muted;
}

function drawHeader(doc, bill) {
  const { width } = doc.page;
  doc.rect(0, 0, width, 96).fill(COLORS.navy);
  doc.rect(0, 96, width, 4).fill(COLORS.gold);

  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(26).text('UdyogConnect', PAGE_MARGIN, 26, { lineBreak: false });
  doc.fillColor(COLORS.gold).font('Helvetica').fontSize(11).text('Local Business Marketplace', PAGE_MARGIN, 58, { lineBreak: false });

  const rightX = width - PAGE_MARGIN - 220;
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16).text('BILL / INVOICE', rightX, 28, { width: 220, align: 'right' });
  doc.fillColor(COLORS.gold).font('Helvetica-Bold').fontSize(11).text(pdfSafe(bill.billNumber || 'PENDING'), rightX, 52, { width: 220, align: 'right' });
  doc.fillColor('#C9D3E3').font('Helvetica').fontSize(8.5).text(`Issued ${formatNepalDate(bill.billGeneratedAt || new Date())}`, rightX, 68, { width: 220, align: 'right' });
}

function drawKeyValueCard(doc, { x, y, width, title, rows }) {
  const padding = 12;
  const labelWidth = 92;
  let cursor = y + padding + 16;

  doc.font('Helvetica').fontSize(9);
  const rowHeights = rows.map(([, value]) => Math.max(12, doc.heightOfString(pdfSafe(value || '-'), { width: width - padding * 2 - labelWidth })) + 5);
  const height = padding * 2 + 16 + rowHeights.reduce((a, b) => a + b, 0);

  doc.roundedRect(x, y, width, height, 8).lineWidth(1).strokeColor(COLORS.border).stroke();
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(9.5).text(title.toUpperCase(), x + padding, y + padding, { characterSpacing: 0.6 });

  rows.forEach(([label, value, color], index) => {
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text(label, x + padding, cursor, { width: labelWidth });
    doc.fillColor(color || COLORS.text).font(color ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
      .text(pdfSafe(value || '-'), x + padding + labelWidth, cursor, { width: width - padding * 2 - labelWidth });
    cursor += rowHeights[index];
  });

  return y + height;
}

function drawTableHeader(doc, columns, y) {
  const tableWidth = doc.page.width - PAGE_MARGIN * 2;
  doc.rect(PAGE_MARGIN, y, tableWidth, 24).fill(COLORS.navy);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
  columns.forEach((col) => {
    doc.text(col.label, col.x + 8, y + 8, { width: col.width - 16, align: col.align || 'left' });
  });
  return y + 24;
}

function drawItemsTable(doc, bill, startY) {
  const tableWidth = doc.page.width - PAGE_MARGIN * 2;
  const x0 = PAGE_MARGIN;
  const columns = [
    { key: 'index', label: '#', width: 30 },
    { key: 'name', label: 'Product / Service', width: tableWidth - 30 - 50 - 100 - 105 },
    { key: 'quantity', label: 'Qty', width: 50, align: 'center' },
    { key: 'unitPrice', label: 'Unit Price', width: 100, align: 'right' },
    { key: 'total', label: 'Total', width: 105, align: 'right' },
  ];
  let cx = x0;
  columns.forEach((col) => { col.x = cx; cx += col.width; });

  let y = drawTableHeader(doc, columns, startY);
  const bottomLimit = () => doc.page.height - PAGE_MARGIN - FOOTER_HEIGHT;

  bill.items.forEach((item, index) => {
    const nameText = pdfSafe(item.type === 'service' ? `${item.name} (Service)` : item.name);
    doc.font('Helvetica').fontSize(9);
    const rowHeight = Math.max(22, doc.heightOfString(nameText, { width: columns[1].width - 16 }) + 12);

    if (y + rowHeight > bottomLimit()) {
      doc.addPage();
      y = drawTableHeader(doc, columns, PAGE_MARGIN);
    }

    if (index % 2 === 1) doc.rect(x0, y, tableWidth, rowHeight).fill(COLORS.rowAlt);
    const values = {
      index: String(index + 1),
      name: nameText,
      quantity: String(item.quantity),
      unitPrice: formatRs(item.unitPrice),
      total: formatRs(item.total),
    };
    columns.forEach((col) => {
      doc.fillColor(col.key === 'total' ? COLORS.navy : COLORS.text)
        .font(col.key === 'total' ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .text(values[col.key], col.x + 8, y + 6, { width: col.width - 16, align: col.align || 'left' });
    });
    y += rowHeight;
    doc.moveTo(x0, y).lineTo(x0 + tableWidth, y).lineWidth(0.5).strokeColor(COLORS.border).stroke();
  });

  return y;
}

function drawSummary(doc, bill, startY) {
  const { totals } = bill;
  const boxWidth = 230;
  const x = doc.page.width - PAGE_MARGIN - boxWidth;
  const rows = [
    ['Subtotal', formatRs(totals.subtotal)],
    ['Delivery Fee', formatRs(totals.deliveryFee)],
    ['Discount', totals.discount > 0 ? `- ${formatRs(totals.discount)}` : formatRs(0)],
  ];
  if (totals.tax > 0) rows.push([`VAT (${Math.round(totals.taxRate * 100)}%)`, formatRs(totals.tax)]);

  let y = startY;
  rows.forEach(([label, value]) => {
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9.5).text(label, x + 12, y, { width: 110 });
    doc.fillColor(COLORS.text).font('Helvetica').fontSize(9.5).text(value, x + 110, y, { width: boxWidth - 122, align: 'right' });
    y += 18;
  });

  y += 4;
  doc.roundedRect(x, y, boxWidth, 34, 6).fill(COLORS.goldSoft);
  doc.rect(x, y, 4, 34).fill(COLORS.gold);
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(11).text('Final Total', x + 14, y + 11, { width: 100 });
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(13).text(formatRs(totals.total), x + 100, y + 10, { width: boxWidth - 112, align: 'right' });
  return y + 34;
}

function drawPaymentCard(doc, bill, startY) {
  const width = doc.page.width - PAGE_MARGIN * 2 - 230 - 20;
  const rows = [
    ['Method', bill.paymentMethodLabel],
    ['Status', bill.paymentStatusLabel, statusColor(bill.paymentStatus)],
  ];
  if (bill.transactionId) rows.push(['Transaction ID', bill.transactionId]);
  if (bill.paidAt) rows.push(['Paid On', formatNepalDate(bill.paidAt)]);
  if (bill.paymentNote) rows.push(['Note', bill.paymentNote]);
  return drawKeyValueCard(doc, { x: PAGE_MARGIN, y: startY, width, title: 'Payment', rows });
}

function drawFooters(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const { width, height } = doc.page;
    const y = height - PAGE_MARGIN - FOOTER_HEIGHT + 18;
    // Writing inside the bottom margin would otherwise make PDFKit auto-add a page.
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.moveTo(PAGE_MARGIN, y).lineTo(width - PAGE_MARGIN, y).lineWidth(1).strokeColor(COLORS.gold).stroke();
    doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(10)
      .text('Thank you for shopping with UdyogConnect.', PAGE_MARGIN, y + 10, { width: width - PAGE_MARGIN * 2, align: 'center' });
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(8)
      .text('This is a computer-generated bill and does not require a signature.', PAGE_MARGIN, y + 26, { width: width - PAGE_MARGIN * 2, align: 'center' });
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7.5)
      .text(`UdyogConnect - Local Business Marketplace, Nepal   |   Page ${i - range.start + 1} of ${range.count}`, PAGE_MARGIN, y + 40, { width: width - PAGE_MARGIN * 2, align: 'center' });
    doc.page.margins.bottom = savedBottom;
  }
}

/**
 * Renders the official UdyogConnect bill for an order as an A4 PDF.
 * All figures come from the stored order (see buildBillData), never from client input.
 * @returns {Promise<Buffer>}
 */
function generateBillPDF(order, context = {}) {
  const bill = order && order.items && order.totals ? order : buildBillData(order, context);
  if (!bill.billNumber) return Promise.reject(new Error('Bill number is required to generate a bill.'));

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
        bufferPages: true,
        info: {
          Title: `UdyogConnect Bill ${bill.billNumber}`,
          Author: 'UdyogConnect',
          Subject: `Bill for order ${bill.orderId}`,
          Creator: 'UdyogConnect - Local Business Marketplace',
        },
      });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      drawHeader(doc, bill);

      const contentWidth = doc.page.width - PAGE_MARGIN * 2;
      const gap = 16;
      const colWidth = (contentWidth - gap) / 2;
      let y = 120;

      const billInfoBottom = drawKeyValueCard(doc, {
        x: PAGE_MARGIN, y, width: colWidth, title: 'Bill Information',
        rows: [
          ['Bill Number', bill.billNumber],
          ['Order ID', bill.orderId],
          ['Order Date', formatNepalDate(bill.orderDate)],
          ['Payment', bill.paymentMethodLabel],
          ['Payment Status', bill.paymentStatusLabel, statusColor(bill.paymentStatus)],
        ],
      });
      const customerRows = [['Name', bill.customer.name]];
      if (bill.customer.email) customerRows.push(['Email', bill.customer.email]);
      customerRows.push(['Phone', bill.customer.phone], ['Delivery', bill.customer.address || '-']);
      const customerBottom = drawKeyValueCard(doc, {
        x: PAGE_MARGIN + colWidth + gap, y, width: colWidth, title: 'Billed To', rows: customerRows,
      });
      y = Math.max(billInfoBottom, customerBottom) + 14;

      const businessRows = [['Business', bill.business.name]];
      if (bill.business.address) businessRows.push(['Address', bill.business.address]);
      const contact = [bill.business.phone, bill.business.email].filter(Boolean).join('  |  ');
      if (contact) businessRows.push(['Contact', contact]);
      y = drawKeyValueCard(doc, { x: PAGE_MARGIN, y, width: contentWidth, title: 'Sold By', rows: businessRows }) + 18;

      y = drawItemsTable(doc, bill, y) + 16;

      if (y + 140 > doc.page.height - PAGE_MARGIN - FOOTER_HEIGHT) {
        doc.addPage();
        y = PAGE_MARGIN;
      }
      const summaryBottom = drawSummary(doc, bill, y);
      const paymentBottom = drawPaymentCard(doc, bill, y - 4);
      doc.y = Math.max(summaryBottom, paymentBottom);

      drawFooters(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateBillPDF };
