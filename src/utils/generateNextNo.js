const prisma = require('../config/db');

const prefixes = {
  transfer: 'TFR',
  purchase: 'PUR',
  wastage: 'WST',
};

const modelMap = {
  transfer: 'transfer',
  purchase: 'purchase',
  wastage: 'wastage',
};

const numberFieldMap = {
  transfer: 'transferNo',
  purchase: 'purchaseNo',
  wastage: 'wastageNo',
};

const generateNextNo = async (module) => {
  const prefix = prefixes[module];
  const modelName = modelMap[module];
  const numberField = numberFieldMap[module];

  if (!prefix || !modelName || !numberField) {
    throw new Error(`Configuration for module '${module}' not found.`);
  }

  const lastRecord = await prisma[modelName].findFirst({
    orderBy: {
      id: 'desc',
    },
  });

  let nextNo = 1;
  if (lastRecord && lastRecord[numberField]) {
    const lastNoStr = lastRecord[numberField].split('-').pop();
    const lastNo = parseInt(lastNoStr, 10);
    if (!isNaN(lastNo)) {
      nextNo = lastNo + 1;
    }
  }

  return `${prefix}-${String(nextNo).padStart(5, '0')}`;
};

module.exports = { generateNextNo };
