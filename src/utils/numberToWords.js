const { toWords } = require('number-to-words');

/**
 * Converts a number to its word representation, including paisa.
 * Example: 1234.56 -> "Rupees One Thousand Two Hundred Thirty Four and Fifty Six Paise only"
 * @param {number} num - The number to convert.
 * @returns {string} The number in words.
 */
function numberToWords(num) {
  if (typeof num !== 'number') {
    return 'Invalid input';
  }

  const integerPart = Math.floor(num);
  const decimalPart = Math.round((num - integerPart) * 100);

  let words = 'Rupees ' + toWords(integerPart);

  if (decimalPart > 0) {
    words += ' and ' + toWords(decimalPart) + ' Paise';
  }

  return words + ' only';
}

module.exports = { numberToWords };
