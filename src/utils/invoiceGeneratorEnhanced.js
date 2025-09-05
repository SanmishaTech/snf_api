const PdfPrinter = require('pdfmake');
const fs = require('fs');
const path = require('path');

// Load VFS data for fonts
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
  console.error('Failed to load vfs_fonts.js or VFS data is not in the expected format.');
  vfsData = {};
}

const fonts = {
  Roboto: {
    normal: vfsData['Roboto-Regular.ttf'] ? Buffer.from(vfsData['Roboto-Regular.ttf'], 'base64') : null,
    bold: vfsData['Roboto-Medium.ttf'] ? Buffer.from(vfsData['Roboto-Medium.ttf'], 'base64') : null,
    italics: vfsData['Roboto-Italic.ttf'] ? Buffer.from(vfsData['Roboto-Italic.ttf'], 'base64') : null,
    bolditalics: vfsData['Roboto-MediumItalic.ttf'] ? Buffer.from(vfsData['Roboto-MediumItalic.ttf'], 'base64') : null
  }
};

// Filter out null fonts
Object.keys(fonts.Roboto).forEach(key => {
  if (fonts.Roboto[key] === null) {
    console.warn(`Font style ${key} for Roboto not found in VFS data.`);
    delete fonts.Roboto[key];
  }
});

const printer = new PdfPrinter(fonts);

// Helper to format date as DD/MM/YYYY
const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Generates an enhanced invoice PDF with comprehensive information
 */
const generateInvoicePdf = async (invoiceData, filePath) => {
  // Ensure the directory exists
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }

  const { 
    invoiceNumber, 
    invoiceDate,
    orderNo,
    member,
    SNFlobal,
    items,
    totals,
    paymentDetails
  } = invoiceData;

  const companyDetails = SNFlobal || {
    name: 'Sarkhot Natural Farms',
    addressLines: ['B/3 Prabhat Society,','Mukherjee Road, Near CKP Hall,',"Dombivli East", "421201", "Thane", "Maharashtra"],
    city: 'Dombivli East',
    pincode: '421201',
    // gstinUin: '27AAHCB7744A1ZT',
    email: 'sarkhotnaturalfarms@gmail.com'
  };

  const memberAddress = member.addressLines ? member.addressLines.join('\n') : '';
  const companyAddress = companyDetails.addressLines.join('\n');

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [30, 30, 30, 30], 
    content: [
      // Company Header Section
      {
        columns: [
          {
            width: '60%',
            stack: [
              { text: companyDetails.name, style: 'companyTitle' },
              { text: companyAddress, style: 'companyDetails' },
              { text: `${companyDetails.city} - ${companyDetails.pincode}`, style: 'companyDetails' },
              // { text: `GSTIN/UIN: ${companyDetails.gstinUin}`, style: 'companyDetails' },
              { text: `Email: ${companyDetails.email}`, style: 'companyDetails' }
            ]
          },
          {
            width: '40%',
            stack: [
              { text: 'TAX INVOICE', style: 'invoiceTitle', alignment: 'right' },
              { text: `Invoice No: ${invoiceNumber}`, style: 'invoiceDetails', alignment: 'right', margin: [0, 5, 0, 0] },
              { text: `Invoice Date: ${formatDate(invoiceDate)}`, style: 'invoiceDetails', alignment: 'right' },
              { text: `Order No: ${orderNo}`, style: 'invoiceDetails', alignment: 'right' }
            ]
          }
        ],
        margin: [0, 0, 0, 10] 
      },

      // Separator line
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 535, y2: 0, lineWidth: 1, lineColor: '#000000' }], 
        margin: [0, 0, 0, 10] 
      },

      // Bill To Section
      {
        columns: [
          {
            width: '50%',
            stack: [
              { text: 'Bill To:', style: 'sectionHeader' },
              { text: member.memberName, style: 'customerName', margin: [0, 3, 0, 2] },
              { text: memberAddress, style: 'addressText' },
              { text: `${member.city}${member.state ? ', ' + member.state : ''} - ${member.pincode}`, style: 'addressText' },
              ...(member.mobile ? [{ text: `Mobile: ${member.mobile}`, style: 'addressText', margin: [0, 2, 0, 0] }] : []),
              ...(member.email ? [{ text: `Email: ${member.email}`, style: 'addressText' }] : []),
              ...(member.gstin ? [{ text: `GSTIN: ${member.gstin}`, style: 'addressText', margin: [0, 2, 0, 0] }] : [])
            ]
          },
          // {
          //   width: '50%',
          //   stack: [
          //     { text: 'Payment Status:', style: 'sectionHeader' },
          //     {
          //       table: {
          //         widths: ['auto', '*'],
          //         body: [
          //           [
          //             { text: 'Status:', style: 'paymentLabel' },
          //             { 
          //               text: paymentDetails.paymentStatus || 'PENDING', 
          //               style: 'paymentStatusValue'
          //             }
          //           ],
                    
          //           ...(paymentDetails.paymentReferenceNo ? [[
          //             { text: 'Ref No:', style: 'paymentLabel' },
          //             { text: paymentDetails.paymentReferenceNo, style: 'paymentValue' }
          //           ]] : []),
          //           ...(paymentDetails.paymentDate ? [[
          //             { text: 'Date:', style: 'paymentLabel' },
          //             { text: formatDate(paymentDetails.paymentDate), style: 'paymentValue' }
          //           ]] : [])
          //         ]
          //       },
          //       layout: 'noBorders',
          //       margin: [0, 3, 0, 0]
          //     }
          //   ]
          // }
        ],
        margin: [0, 0, 0, 15] 
      },

      // Items Table
      {
        table: {
          headerRows: 1,
          widths: ['auto', '*', '25%'],
          body: [
            // Header
            [
              { text: 'S.No', style: 'tableHeader' },
              { text: 'Description', style: 'tableHeader' },
              // { text: 'HSN/SAC', style: 'tableHeader' },
              { text: 'Amount', style: 'tableHeader', alignment: 'right' }
            ],
            // Items
            ...items.map(item => [
              { text: item.srNo.toString(), style: item.isCancelled ? 'tableCellCancelled' : 'tableCell', alignment: 'center' },
              { text: item.description, style: item.isCancelled ? 'tableCellDescriptionCancelled' : 'tableCellDescription' },
              // { text: item.hsnSac || '', style: 'tableCell', alignment: 'center' },
              { text: `₹ ${item.amount.toFixed(2)}`, style: item.isCancelled ? 'tableCellCancelled' : 'tableCell', alignment: 'right' }
            ]),
            // Empty row for spacing
            [{ text: '', colSpan: 3, border: [false, false, false, false], margin: [0, 2] }, {}, {}],
            // Subtotal
            [
              { text: '', border: [false, false, false, false] },
              { text: 'Subtotal:', style: 'totalLabel', alignment: 'right' },
              { text: `₹ ${totals.amountBeforeTax.toFixed(2)}`, style: 'totalValue', alignment: 'right' }
            ],
            // Grand Total
            [
              { text: '', border: [false, true, false, false] },
              { text: 'Grand Total:', style: 'grandTotalLabel', alignment: 'right', border: [false, true, false, false] },
              { text: `₹ ${totals.totalAmount.toFixed(2)}`, style: 'grandTotalValue', alignment: 'right', border: [false, true, false, false] }
            ]
          ]
        },
        layout: {
          hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#000000',
          vLineColor: () => '#AAAAAA',
          paddingTop: (i) => i === 0 ? 5 : 4, 
          paddingBottom: (i) => i === 0 ? 5 : 4, 
          paddingLeft: () => 8,
          paddingRight: () => 8
        }
      },

      // Amount in Words
      {
        columns: [
          {
            width: '100%',
            stack: [
              { text: 'Amount in Words:', style: 'amountWordsLabel' },
              { text: totals.amountInWords, style: 'amountWordsValue' }
            ]
          }
        ],
        margin: [0, 15, 0, 15] 
      },

      // Terms & Conditions
      // {
      //   stack: [
      //     { text: 'Terms & Conditions:', style: 'termsHeader' },
      //     { text: '1. This is a computer generated invoice and does not require physical signature.', style: 'termsText' },
      //     { text: '2. Subject to Maharashtra Jurisdiction only.', style: 'termsText' },
      //    ],
      //   margin: [0, 0, 0, 15] 
      // },

      // Signature Section
      {
        columns: [
          { text: '', width: '*' },
          {
            width: 200,
            stack: [
              { text: `For ${companyDetails.name}`, style: 'signatureText', alignment: 'center' },
              { text: '\n\n', style: 'normalText' }, 
              { 
                canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.5, lineColor: '#000000' }],
                alignment: 'center'
              },
              { text: 'Authorized Signatory', style: 'signatureText', alignment: 'center', margin: [0, 4, 0, 0] }
            ]
          }
        ]
      }
    ],
    styles: {
      companyTitle: {
        fontSize: 18, 
        bold: true,
        color: '#000000'
      },
      companyDetails: {
        fontSize: 9,
        margin: [0, 1, 0, 0],
        color: '#000000'
      },
      invoiceTitle: {
        fontSize: 16, 
        bold: true,
        color: '#000000'
      },
      invoiceDetails: {
        fontSize: 9,
        color: '#000000'
      },
      sectionHeader: {
        fontSize: 11, 
        bold: true,
        color: '#000000',
        margin: [0, 0, 0, 4]
      },
      customerName: {
        fontSize: 12, 
        bold: true,
        color: '#000000'
      },
      addressText: {
        fontSize: 9,
        color: '#000000',
        lineHeight: 1.2
      },
      tableHeader: {
        fontSize: 10, 
        bold: true,
        color: '#000000',
        fillColor: '#E0E0E0' 
      },
      tableCell: {
        fontSize: 8,
        color: '#000000'
      },
      tableCellDescription: {
        fontSize: 8,
        color: '#000000',
        lineHeight: 1.3
      },
      tableCellCancelled: {
        fontSize: 8,
        color: '#999999',
        decoration: 'lineThrough'
      },
      tableCellDescriptionCancelled: {
        fontSize: 8,
        color: '#999999',
        lineHeight: 1.3,
        decoration: 'lineThrough'
      },
      totalLabel: {
        fontSize: 9,
        color: '#000000'
      },
      totalValue: {
        fontSize: 9,
        color: '#000000'
      },
      grandTotalLabel: {
        fontSize: 10, 
        bold: true,
        color: '#000000'
      },
      grandTotalValue: {
        fontSize: 10, 
        bold: true,
        color: '#000000'
      },
      amountWordsLabel: {
        fontSize: 9,
        bold: true,
        color: '#000000'
      },
      amountWordsValue: {
        fontSize: 10,
        italics: true,
        color: '#000000'
      },
      paymentLabel: {
        fontSize: 8,
        color: '#000000',
        margin: [0, 1, 5, 1]
      },
      paymentValue: {
        fontSize: 8,
        color: '#000000'
      },
      paymentStatusValue: {
        fontSize: 9,
        bold: true,
        color: '#000000'
      },
      termsHeader: {
        fontSize: 10, 
        bold: true,
        color: '#000000',
        margin: [0, 0, 0, 4]
      },
      termsText: {
        fontSize: 8,
        color: '#000000',
        lineHeight: 1.2
      },
      signatureText: {
        fontSize: 9,
        color: '#000000'
      },
      normalText: {
        fontSize: 9
      }
    },
    defaultStyle: {
      font: 'Roboto',
      columnGap: 20
    }
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    pdfDoc.pipe(stream);
    pdfDoc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
};

module.exports = { generateInvoicePdf };
