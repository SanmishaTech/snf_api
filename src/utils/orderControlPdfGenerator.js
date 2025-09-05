const PdfPrinter = require('pdfmake');
const path = require('path');
const fs = require('fs');

// Load vfs fonts similar to invoice generators
const vfsCandidate = require('pdfmake/build/vfs_fonts.js');
let vfsData = null;
if (vfsCandidate) {
  if (vfsCandidate.pdfMake && vfsCandidate.pdfMake.vfs) {
    vfsData = vfsCandidate.pdfMake.vfs;
  } else if (vfsCandidate.vfs) {
    vfsData = vfsCandidate.vfs;
  } else {
    vfsData = vfsCandidate;
  }
}

if (!vfsData || typeof vfsData['Roboto-Regular.ttf'] !== 'string') {
  console.error('[OrderControlPDF] Could not load vfs fonts correctly. PDF generation may fail.');
  vfsData = {};
}

function createPrinter() {
  const fonts = {
    Roboto: {
      normal: vfsData['Roboto-Regular.ttf'] ? Buffer.from(vfsData['Roboto-Regular.ttf'], 'base64') : null,
      bold: vfsData['Roboto-Medium.ttf'] ? Buffer.from(vfsData['Roboto-Medium.ttf'], 'base64') : null,
      italics: vfsData['Roboto-Italic.ttf'] ? Buffer.from(vfsData['Roboto-Italic.ttf'], 'base64') : null,
      bolditalics: vfsData['Roboto-MediumItalic.ttf'] ? Buffer.from(vfsData['Roboto-MediumItalic.ttf'], 'base64') : null,
    },
  };
  // Remove any nulls
  Object.keys(fonts.Roboto).forEach((k) => { if (fonts.Roboto[k] === null) delete fonts.Roboto[k]; });
  return new PdfPrinter(fonts);
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    const day = d.toLocaleDateString('en-IN', { weekday: 'short' });
    const datePretty = d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' });
    return `${day}, ${datePretty}`;
  } catch (_) {
    return dateStr || '';
  }
}

function buildHeader(title, date) {
  return (currentPage, pageCount) => ({
    margin: [24, 12, 24, 8],
    stack: [
      {
        columns: [
          [
            { text: title, style: 'headerTitle' },
            { text: `Delivery Date: ${formatDate(date)} (${date})`, style: 'headerSubTitle' },
          ],
          { text: `Page ${currentPage} of ${pageCount}`, style: 'headerSubRight', alignment: 'right' },
        ]
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#dddddd' }] }
    ]
  });
}

function buildFooter() {
  return (currentPage, pageCount) => ({
    margin: [24, 0, 24, 12],
    columns: [
      { text: '', width: '*' },
      { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', style: 'footerText' }
    ]
  });
}

function getTableLayout() {
  return {
    fillColor: function (rowIndex, node, columnIndex) {
      if (rowIndex === 0) return '#f2f2f2';
      return rowIndex % 2 === 0 ? '#fbfbfb' : null;
    },
    hLineWidth: function (i, node) { return i === 0 || i === 1 ? 1 : 0.5; },
    vLineWidth: function () { return 0; },
    hLineColor: function () { return '#e0e0e0'; },
    paddingLeft: function () { return 6; },
    paddingRight: function () { return 6; },
    paddingTop: function () { return 6; },
    paddingBottom: function () { return 6; },
  };
}

function buildDetailedDocDefinition({ date, productGroups }) {
  const content = [];

  productGroups.forEach((group, idx) => {
    content.push({ text: group.productName, style: 'groupTitle' });
    const sub = [];
    if (group.variantName) sub.push(`Variant: ${group.variantName}`);
    sub.push(`Rate: ₹${group.price.toFixed(2)}`);
    sub.push(`Active: ${group.activeQuantity}/${group.totalQuantity} qty`);
    content.push({ text: sub.join(' • '), style: 'groupSubtitle', margin: [0, 0, 0, 6] });

    const body = [
      [
        { text: 'Order No', style: 'tableHeader' },
        { text: 'Customer', style: 'tableHeader' },
        { text: 'Mobile', style: 'tableHeader' },
        { text: 'City', style: 'tableHeader' },
        { text: 'Qty', style: 'tableHeader', alignment: 'right' },
        { text: 'Line Total', style: 'tableHeader', alignment: 'right' },
        { text: 'Status', style: 'tableHeader', alignment: 'center' },
      ],
      ...group.orders.map(({ order, item }) => [
        { text: order.orderNo, style: 'tableCellMono' },
        { text: order.name, style: item.isCancelled ? 'tableCellCancelled' : 'tableCell' },
        { text: order.mobile || '', style: 'tableCell' },
        { text: order.city || '', style: 'tableCell' },
        { text: item.quantity.toString(), style: item.isCancelled ? 'tableCellCancelled' : 'tableCellRight', alignment: 'right' },
        { text: `₹${item.lineTotal.toFixed(2)}`, style: item.isCancelled ? 'tableCellCancelled' : 'tableCellRight', alignment: 'right' },
        { text: item.isCancelled ? 'Cancelled' : 'Active', style: item.isCancelled ? 'statusCancelled' : 'statusActive', alignment: 'center' },
      ])
    ];

    content.push({
      table: {
        headerRows: 1,
        widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
        body,
      },
      layout: getTableLayout(),
      margin: [0, 0, 0, 10]
    });

    if (idx < productGroups.length - 1) {
      content.push({ text: '', margin: [0, 0, 0, 10] });
    }
  });

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [24, 80, 24, 50],
    header: buildHeader('Order Control — Detailed', date),
    footer: buildFooter(),
    content,
    styles: {
      headerTitle: { fontSize: 16, bold: true },
      headerSubTitle: { fontSize: 10, color: '#666' },
      headerSubRight: { fontSize: 9, color: '#666' },
      title: { fontSize: 16, bold: true, margin: [0, 0, 0, 6] },
      subtitle: { fontSize: 10, color: '#666' },
      groupTitle: { fontSize: 12, bold: true, margin: [0, 10, 0, 2] },
      groupSubtitle: { fontSize: 9, color: '#555', margin: [0, 0, 0, 6] },
      tableHeader: { bold: true, fontSize: 9 },
      tableCell: { fontSize: 9 },
      tableCellRight: { fontSize: 9, alignment: 'right' },
      tableCellMono: { fontSize: 9, font: 'Roboto' },
      statusActive: { fontSize: 9, color: '#0a7a0a' },
      statusCancelled: { fontSize: 9, color: '#b00020', decoration: 'lineThrough' },
      tableCellCancelled: { fontSize: 9, color: '#999', decoration: 'lineThrough' },
      footerText: { fontSize: 8, color: '#888' }
    },
    defaultStyle: { font: 'Roboto' },
    info: {
      title: `Order Control — Detailed (${date})`,
      author: 'Sarkhot Natural Farms'
    }
  };

  return docDefinition;
}

function buildSummaryDocDefinition({ date, summaryRows }) {
  const content = [];

  const body = [
    [
      { text: 'Product', style: 'tableHeader' },
      { text: 'Variant', style: 'tableHeader' },
      { text: 'Required Qty', style: 'tableHeader', alignment: 'right' },
    ],
    ...summaryRows.map((row) => [
      { text: row.productName, style: 'tableCell' },
      { text: row.variantName || '-', style: 'tableCell' },
      { text: row.quantity.toString(), style: 'tableCellRight', alignment: 'right' },
    ])
  ];

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [24, 80, 24, 50],
    header: buildHeader('Order Control — Summary', date),
    footer: buildFooter(),
    content: [
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto'],
          body,
        },
        layout: getTableLayout(),
      }
    ],
    styles: {
      headerTitle: { fontSize: 16, bold: true },
      headerSubTitle: { fontSize: 10, color: '#666' },
      headerSubRight: { fontSize: 9, color: '#666' },
      tableHeader: { bold: true, fontSize: 10 },
      tableCell: { fontSize: 10 },
      tableCellRight: { fontSize: 10, alignment: 'right' },
      footerText: { fontSize: 8, color: '#888' }
    },
    defaultStyle: { font: 'Roboto' },
    info: {
      title: `Order Control — Summary (${date})`,
      author: 'Sarkhot Natural Farms'
    }
  };

  return docDefinition;
}

function createPdfStream(docDefinition) {
  const printer = createPrinter();
  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  return pdfDoc;
}

module.exports = {
  buildDetailedDocDefinition,
  buildSummaryDocDefinition,
  createPdfStream,
};
