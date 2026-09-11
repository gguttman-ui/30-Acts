// The bracelet shipping price must be the same everywhere it appears.
//
// FOUND 2026-09-02, while working out how to reach the certificate screen for
// App Store screenshots: RecognitionScreen offered the bracelet for "$4.95
// shipping & handling" while BraceletFormScreen, BraceletPaymentScreen and the
// actual payment amount were all $6.95. Someone choosing the bracelet was
// quoted one price and asked for another two screens later.
//
// That is worth a test rather than a fix alone. It is exactly the kind of
// number that gets changed in one file, and a reviewer who spots a quoted
// price that does not match what is charged has a fair reason to reject —
// quite apart from it being unfair to the person paying.
const fs   = require('fs');
const path = require('path');

const SHIPPING = '6.95';

const read = (name) =>
  fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', name), 'utf8');

// Comments discuss other amounts on purpose (the $1.00 Venmo test charge, for
// one), so only live code and copy is checked.
const codeOnly = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// Every screen that quotes or charges the shipping price.
const SCREENS = [
  'RecognitionScreen.js',
  'BraceletFormScreen.js',
  'BraceletPaymentScreen.js',
];

describe('bracelet shipping price', () => {
  test('the payment screen charges 6.95', () => {
    expect(read('BraceletPaymentScreen.js'))
      .toContain(`SHIP_AMOUNT_NUM = '${SHIPPING}'`);
  });

  for (const name of SCREENS) {
    describe(name, () => {
      const src = read(name);

      test('quotes the shipping price at all', () => {
        expect(src).toContain(SHIPPING);
      });

      test('quotes no other dollar amount as shipping', () => {
        // Any $N.NN in these three screens should be the shipping price.
        // A different one means two screens disagree about what the bracelet
        // costs, which is what happened on 2026-09-02.
        const amounts = [...codeOnly(src).matchAll(/\$(\d+\.\d{2})/g)].map(m => m[1]);
        const wrong = amounts.filter(a => a !== SHIPPING);
        expect(wrong).toEqual([]);
      });
    });
  }
});
